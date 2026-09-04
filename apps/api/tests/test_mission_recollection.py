"""회고록 구매 한도, 사용 시 경험치 지급 및 중복 수령 방지."""
import unittest
from datetime import date

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.models import Chapter, Character, CharacterItemState, ItemUsage, Mission, MissionProgress, Purchase, Reward
from app.schemas import BulkPurchaseRequest, ItemCreate


class MissionRecollectionTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.chapter = Chapter(name="1장", start_date=date(2026, 1, 1), end_date=date(2026, 1, 31))
        self.character = Character(name="러너", gold=100, exp=0)
        self.db.add_all([self.chapter, self.character])
        self.db.flush()
        self.missions = [
            Mission(chapter="1장", name="임무 A", description="", reward="", reward_experience=0,
                    reward_gold=50, reward_items=[{"type": "stat", "stat": "exp", "amount": 7},
                                                  {"type": "stat", "stat": "cp", "amount": 5}], is_public=True),
            Mission(chapter="1장", name="임무 B", description="", reward="", reward_experience=9,
                    reward_items=[{"type": "stat", "stat": "exp", "amount": 3}], is_public=True),
        ]
        self.db.add_all(self.missions)
        self.db.flush()
        self.db.add_all([MissionProgress(mission_id=m.id, character_id=self.character.id) for m in self.missions])
        self.item = self.create_item("회고록 I")

    def create_item(self, name):
        return crud.create_item(self.db, ItemCreate(name=name, price_gold=10,
            effects=[{"stat": "mission_exp_recollection", "delta": 0, "chapter": "1장"}]))

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def purchase(self, quantity=1, item=None):
        return crud.bulk_purchase(self.db, BulkPurchaseRequest(character_id=self.character.id,
            items=[{"item_id": (item or self.item).id, "quantity": quantity}]))[0]

    def use(self, mission_id, item=None):
        return crud.use_item(self.db, self.character.id, (item or self.item).id, mission_id=mission_id)

    def stock(self):
        return next(i for i in crud.get_items_with_stock(self.db, self.character.id) if i.id == self.item.id)

    def test_purchase_without_mission_does_not_grant_or_consume(self):
        purchase = self.purchase(2)
        self.assertEqual(self.character.exp, 0)
        self.assertEqual(self.character.gold, 80)
        self.assertIsNone(purchase.selected_mission_id)
        self.assertEqual(self.db.query(ItemUsage).count(), 0)
        self.assertEqual(self.stock().remaining_per_character, 0)
        self.assertFalse(self.stock().purchasable)
        with self.assertRaises(HTTPException):
            self.purchase()

    def test_use_grants_only_experience_and_records_mission(self):
        self.purchase()
        result = self.use(self.missions[0].id)
        self.assertEqual(result.exp, 7)
        self.assertEqual(result.gold, 90)
        self.assertEqual(result.cp, 0)
        self.assertFalse(self.db.query(MissionProgress).filter_by(mission_id=self.missions[0].id).one().achieved)
        self.assertEqual(self.db.query(Reward).count(), 0)
        usage = self.db.query(ItemUsage).one()
        self.assertEqual(usage.selected_mission_name, "임무 A")
        self.assertEqual(usage.granted_experience, 7)
        self.assertEqual(crud.get_item_history(self.db, self.character.id)[0].item_name, "회고록 I - 임무 A")
        self.assertEqual(self.stock().remaining_per_character, 1)

    def test_experience_preview_matches_legacy_and_current_rewards(self):
        missions = crud.get_recollection_missions(self.db, self.character.id, self.item.id)
        self.assertEqual([m["reward_experience"] for m in missions], [7, 12])
        self.purchase()
        self.assertEqual(self.use(self.missions[1].id).exp, 12)

    def test_duplicate_use_does_not_consume_remaining_copy(self):
        self.purchase(2)
        self.use(self.missions[0].id)
        with self.assertRaises(HTTPException):
            self.use(self.missions[0].id)
        self.assertEqual(self.db.query(CharacterItemState).one().used_quantity, 1)
        self.assertEqual(self.use(self.missions[1].id).exp, 19)
        self.assertFalse(self.stock().purchasable)

    def test_completed_rewarded_hidden_and_other_chapter_missions_are_excluded(self):
        self.db.query(MissionProgress).filter_by(mission_id=self.missions[0].id).one().achieved = True
        self.db.add_all([
            Mission(chapter="1장", name="비공개", description="", reward="", is_public=False),
            Mission(chapter="2장", name="다른 챕터", description="", reward="", is_public=True),
        ])
        self.db.commit()
        self.assertEqual(self.stock().remaining_per_character, 1)
        with self.assertRaises(HTTPException):
            self.purchase(2)
        self.purchase()
        for mid in (None, self.missions[0].id, 9999):
            with self.assertRaises(HTTPException):
                self.use(mid)
        self.db.add(Reward(type="mission", source_id=self.missions[1].id, character_id=self.character.id,
                           reward_items=[], rewarded_at=date.today()))
        self.db.commit()
        with self.assertRaises(HTTPException):
            self.use(self.missions[1].id)
        self.assertEqual(self.db.query(ItemUsage).count(), 0)

    def test_duplicate_cart_rows_cannot_exceed_limit(self):
        with self.assertRaises(HTTPException):
            crud.bulk_purchase(self.db, BulkPurchaseRequest(character_id=self.character.id,
                items=[{"item_id": self.item.id, "quantity": 2}, {"item_id": self.item.id, "quantity": 1}]))
        self.assertEqual(self.db.query(Purchase).count(), 0)
        self.assertEqual(self.character.gold, 100)

    def test_same_chapter_items_share_capacity_and_mission_exclusions(self):
        sibling = self.create_item("회고록 II")
        self.purchase(2)
        with self.assertRaises(HTTPException):
            self.purchase(item=sibling)
        self.use(self.missions[0].id)
        self.assertEqual([m["id"] for m in crud.get_recollection_missions(self.db, self.character.id, sibling.id)],
                         [self.missions[1].id])

    def test_legacy_purchase_remains_excluded(self):
        self.db.add(Purchase(character_id=self.character.id, item_id=self.item.id, quantity=1,
                             selected_mission_id=self.missions[0].id, selected_mission_name="임무 A", granted_experience=7))
        self.db.add(CharacterItemState(character_id=self.character.id, item_id=self.item.id, used_quantity=1))
        self.db.commit()
        self.assertEqual(self.stock().remaining_per_character, 1)
        self.purchase()
        with self.assertRaises(HTTPException):
            self.use(self.missions[0].id)
        self.assertEqual(self.use(self.missions[1].id).exp, 12)


if __name__ == "__main__":
    unittest.main()
