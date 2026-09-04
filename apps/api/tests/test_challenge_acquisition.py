"""도전과제 획득 아이템의 구매 한도, 달성 처리, 구매 이미지 및 기존 DB 이전."""
import unittest
from datetime import date

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.migrations import ensure_schema
from app.models import Chapter, Challenge, ChallengeProgress, Character, CharacterItemState, ItemUsage, Purchase, Reward
from app.schemas import BulkPurchaseRequest, ItemCreate


class ChallengeAcquisitionTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.character = Character(name="러너", gold=100)
        self.db.add_all([self.character, Chapter(name="1장", start_date=date(2026, 1, 1), end_date=date(2026, 1, 31))])
        self.db.flush()
        self.challenges = [self.challenge("도전 A"), self.challenge("도전 B")]
        self.item = self.create_item("도전과제 획득권")

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def challenge(self, name, chapter="1장", public=True):
        challenge = Challenge(name=name, chapter=chapter, description="달성 조건", reward="", is_public=public,
                              image_url="https://example.com/original.webp", purchase_image_url="https://example.com/purchased.webp")
        self.db.add(challenge)
        self.db.flush()
        self.db.add(ChallengeProgress(character_id=self.character.id, challenge_id=challenge.id))
        return challenge

    def create_item(self, name):
        return crud.create_item(self.db, ItemCreate(name=name, price_gold=10,
            effects=[{"stat": "challenge_acquisition", "delta": 0, "chapter": "1장"}]))

    def purchase(self, quantity=1, item=None):
        return crud.bulk_purchase(self.db, BulkPurchaseRequest(character_id=self.character.id,
            items=[{"item_id": (item or self.item).id, "quantity": quantity}]))

    def use(self, challenge_id):
        return crud.use_item(self.db, self.character.id, self.item.id, challenge_id=challenge_id)

    def stock(self, item=None):
        return next((entry for entry in crud.get_items_with_stock(self.db, self.character.id) if entry.id == (item or self.item).id), None)

    def test_two_purchases_and_uses_never_reopen_capacity(self):
        self.assertEqual(self.stock().remaining_per_character, 2)
        self.purchase(2)
        self.assertEqual(self.db.query(ChallengeProgress).filter_by(achieved=True).count(), 0)
        self.assertEqual(self.stock().remaining_per_character, 0)
        with self.assertRaises(HTTPException):
            self.purchase()
        self.use(self.challenges[0].id)
        self.assertEqual(self.stock().remaining_per_character, 0)
        self.use(self.challenges[1].id)
        self.assertIsNone(self.stock())
        with self.assertRaises(HTTPException):
            self.purchase()
        self.assertEqual(self.character.gold, 80)
        self.assertEqual(self.db.query(ItemUsage).count(), 2)

    def test_acquired_image_and_regular_image_are_selected_per_character(self):
        self.db.query(ChallengeProgress).filter_by(challenge_id=self.challenges[1].id).one().achieved = True
        self.db.commit()
        self.purchase()
        detail = self.use(self.challenges[0].id)
        images = {entry.challenge_id: (entry.image_url, entry.acquired_via_item) for entry in detail.achieved_challenges}
        self.assertEqual(images[self.challenges[0].id], ("https://example.com/purchased.webp", True))
        self.assertEqual(images[self.challenges[1].id], ("https://example.com/original.webp", False))
        self.assertEqual(crud.get_item_history(self.db, self.character.id)[0].item_name, "도전과제 획득권 - 도전 A")
        self.assertEqual(self.db.query(Reward).count(), 0)  # 보상 지급은 기존 관리자 흐름 유지
        self.challenges[0].purchase_image_url = None
        self.db.commit()
        entry = next(c for c in crud.get_character_detail(self.db, self.character.id).achieved_challenges if c.challenge_id == self.challenges[0].id)
        self.assertEqual(entry.image_url, "https://example.com/original.webp")
        other = Character(name="다른 러너")
        self.db.add(other)
        self.db.flush()
        self.db.add(ChallengeProgress(character_id=other.id, challenge_id=self.challenges[1].id, achieved=True))
        self.db.commit()
        self.assertFalse(crud.get_character_detail(self.db, other.id).achieved_challenges[0].acquired_via_item)

    def test_invalid_duplicate_hidden_and_other_chapter_selection_does_not_consume(self):
        hidden = self.challenge("비공개", public=False)
        other = self.challenge("다른 챕터", chapter="2장")
        self.db.commit()
        self.purchase(2)
        for challenge_id in (None, 9999, hidden.id, other.id):
            with self.assertRaises(HTTPException):
                self.use(challenge_id)
        self.assertEqual(self.db.query(ItemUsage).count(), 0)
        self.use(self.challenges[0].id)
        with self.assertRaises(HTTPException):
            self.use(self.challenges[0].id)
        self.assertEqual(self.db.query(CharacterItemState).one().used_quantity, 1)
        self.use(self.challenges[1].id)

    def test_completed_and_rewarded_challenges_cannot_be_acquired(self):
        self.challenge("비공개", public=False)
        self.challenge("다른 챕터", chapter="2장")
        self.db.query(ChallengeProgress).filter_by(challenge_id=self.challenges[0].id).one().achieved = True
        self.db.commit()
        self.assertEqual(self.stock().remaining_per_character, 1)
        self.assertEqual([c["id"] for c in crud.get_acquisition_challenges(self.db, self.character.id, self.item.id)], [self.challenges[1].id])
        self.db.add(Reward(type="challenge", source_id=self.challenges[1].id, character_id=self.character.id, reward_items=[], rewarded_at=date.today()))
        self.db.commit()
        self.assertIsNone(self.stock())
        self.assertIn(self.item.id, [i.id for i in crud.get_items_with_stock(self.db, admin=True)])
        self.assertNotIn(self.item.id, [i.id for i in crud.get_items_with_stock(self.db)])

    def test_same_chapter_items_and_duplicate_cart_rows_share_limit(self):
        sibling = self.create_item("다른 획득권")
        for rows in ([{"item_id": self.item.id, "quantity": 2}, {"item_id": self.item.id, "quantity": 1}],
                     [{"item_id": self.item.id, "quantity": 2}, {"item_id": sibling.id, "quantity": 1}]):
            with self.assertRaises(HTTPException):
                crud.bulk_purchase(self.db, BulkPurchaseRequest(character_id=self.character.id, items=rows))
        self.assertEqual(self.db.query(Purchase).count(), 0)
        self.assertEqual(self.character.gold, 100)
        self.purchase()
        self.assertEqual(self.stock(sibling).remaining_per_character, 1)
        self.purchase(item=sibling)
        self.use(self.challenges[0].id)
        self.assertEqual(self.stock(sibling).remaining_per_character, 0)
        crud.use_item(self.db, self.character.id, sibling.id, challenge_id=self.challenges[1].id)
        with self.assertRaises(HTTPException):
            self.purchase(item=sibling)

    def test_manual_reset_does_not_allow_second_acquisition(self):
        self.purchase()
        self.use(self.challenges[0].id)
        self.db.query(ChallengeProgress).filter_by(challenge_id=self.challenges[0].id).one().achieved = False
        self.db.commit()
        self.assertEqual(self.stock().remaining_per_character, 1)
        self.assertEqual([c["id"] for c in crud.get_acquisition_challenges(self.db, self.character.id, self.item.id)], [self.challenges[1].id])

    def test_chapter_and_effect_configuration_validation(self):
        for kwargs in ({"effects": [{"stat": "challenge_acquisition", "delta": 0}]},
                       {"battle_only": True},
                       {"effects": [{"stat": "challenge_acquisition", "delta": 0, "chapter": "1장"}] * 2},
                       {"special_merchant": True, "item_type": "accessory"}):
            values = {"name": "잘못된 설정", "price_gold": 1, "effects": [{"stat": "challenge_acquisition", "delta": 0, "chapter": "1장"}], **kwargs}
            with self.assertRaises(ValidationError):
                ItemCreate(**values)
        with self.assertRaises(HTTPException):
            crud.create_item(self.db, ItemCreate(name="없는 챕터", price_gold=1, effects=[{"stat": "challenge_acquisition", "delta": 0, "chapter": "없는 챕터"}]))

    def test_migration_preserves_existing_records_and_is_repeatable(self):
        self.purchase()
        character_id, item_id, challenge_id = self.character.id, self.item.id, self.challenges[0].id
        self.db.close()
        with self.engine.begin() as connection:
            connection.execute(text("ALTER TABLE challenges DROP COLUMN purchase_image_url"))
            connection.execute(text("ALTER TABLE challenge_progress DROP COLUMN acquired_via_item"))
            connection.execute(text("DROP INDEX uq_usage_character_acquired_challenge"))
            connection.execute(text("ALTER TABLE item_usages DROP COLUMN selected_challenge_id"))
            connection.execute(text("ALTER TABLE item_usages DROP COLUMN selected_challenge_name"))
        ensure_schema(self.engine)
        ensure_schema(self.engine)
        with self.engine.connect() as connection:
            self.assertEqual(connection.execute(text("SELECT count(*) FROM purchases")).scalar(), 1)
            self.assertEqual(connection.execute(text("SELECT count(*) FROM challenge_progress WHERE acquired_via_item = false")).scalar(), 2)
            self.assertEqual(connection.execute(text("SELECT count(*) FROM challenges WHERE purchase_image_url IS NULL")).scalar(), 2)
        detail = crud.use_item(self.db, character_id, item_id, challenge_id=challenge_id)
        self.assertTrue(detail.achieved_challenges[0].acquired_via_item)


if __name__ == "__main__":
    unittest.main()
