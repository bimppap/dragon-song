"""회고록 아이템의 노출, 경험치 지급, 중복 구매 및 이력 표시를 검증한다."""

import unittest
from datetime import date

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.models import Chapter, Character, Mission, MissionProgress, Reward
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
            Mission(chapter="1장", name="임무 A", description="", reward="", reward_experience=7, is_public=True),
            Mission(chapter="1장", name="임무 B", description="", reward="", reward_experience=9, is_public=True),
        ]
        self.db.add_all(self.missions)
        self.db.flush()
        self.db.add_all([
            MissionProgress(mission_id=mission.id, character_id=self.character.id)
            for mission in self.missions
        ])
        self.item = crud.create_item(self.db, ItemCreate(
            name="회고록 I",
            price_gold=10,
            description_user="이전 챕터 미완료 임무의 경험치 취득",
            effects=[{"stat": "mission_exp_recollection", "delta": 0, "chapter": "1장"}],
        ))

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def purchase(self, mission_id: int):
        return crud.bulk_purchase(self.db, BulkPurchaseRequest(
            character_id=self.character.id,
            items=[{"item_id": self.item.id, "quantity": 1, "mission_id": mission_id}],
        ))[0]

    def test_grants_only_experience_without_completing_mission(self):
        purchase = self.purchase(self.missions[0].id)
        self.db.refresh(self.character)
        progress = self.db.query(MissionProgress).filter_by(
            character_id=self.character.id, mission_id=self.missions[0].id,
        ).one()

        self.assertEqual(self.character.exp, 7)
        self.assertFalse(progress.achieved)
        self.assertEqual(self.db.query(Reward).filter_by(type="mission").count(), 0)
        self.assertEqual(purchase.selected_mission_name, "임무 A")
        self.assertEqual(purchase.granted_experience, 7)
        self.assertEqual(crud.get_purchases(self.db, self.character.id, None)[0].item_name, "회고록 I - 임무 A")
        self.assertEqual(crud.get_item_history(self.db, self.character.id)[0].item_name, "회고록 I - 임무 A")

    def test_used_or_completed_missions_are_hidden_and_cannot_be_bought_again(self):
        self.purchase(self.missions[0].id)
        visible = crud.get_items_with_stock(self.db, self.character.id, admin=False)[0]
        self.assertEqual([mission.id for mission in visible.eligible_missions], [self.missions[1].id])

        with self.assertRaises(HTTPException):
            self.purchase(self.missions[0].id)

        progress = self.db.query(MissionProgress).filter_by(
            character_id=self.character.id, mission_id=self.missions[1].id,
        ).one()
        progress.achieved = True
        self.db.commit()
        hidden = crud.get_items_with_stock(self.db, self.character.id, admin=False)[0]
        self.assertFalse(hidden.purchasable)
        self.assertEqual(hidden.eligible_missions, [])


if __name__ == "__main__":
    unittest.main()
