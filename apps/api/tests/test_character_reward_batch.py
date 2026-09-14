import unittest
from unittest.mock import patch
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app import crud
from app.db import Base
from app.models import Character, Mission, Challenge, MissionProgress, ChallengeProgress, Reward


class CharacterRewardBatchTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.character = Character(name="대상", gold=0)
        self.other = Character(name="다른 달성자", gold=0)
        self.db.add_all([self.character, self.other])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def sources(self, kind):
        model, progress = (Mission, MissionProgress) if kind == "mission" else (Challenge, ChallengeProgress)
        sources = [model(chapter="1장", name=f"보상 {i}", description="", reward="", reward_gold=10) for i in range(2)]
        self.db.add_all(sources)
        self.db.flush()
        self.db.add_all([progress(character_id=self.other.id, achieved=True, **{f"{kind}_id": source.id}) for source in sources])
        self.db.commit()
        return sources, progress

    def test_only_selected_character_receives_each_reward_once(self):
        for kind in ("mission", "challenge"):
            with self.subTest(kind=kind):
                sources, progress = self.sources(kind)
                ids = [source.id for source in sources]
                before = self.character.gold
                result = crud.grant_character_reward_batch(self.db, self.character.id, kind, ids + ids)
                self.assertEqual(result.paid_count, 2)
                self.assertEqual(self.character.gold, before + 20)
                self.assertEqual(self.other.gold, 0)
                self.assertEqual(self.db.query(progress).filter_by(character_id=self.character.id, achieved=True).count(), 2)
                self.assertEqual(set(crud.get_character_paid_source_ids(self.db, self.character.id, kind)), set(ids))
                self.assertEqual(crud.grant_character_reward_batch(self.db, self.character.id, kind, ids).paid_count, 0)
                self.assertEqual(self.character.gold, before + 20)

    def test_invalid_source_does_not_partially_complete_or_pay(self):
        sources, progress = self.sources("mission")
        with self.assertRaises(HTTPException):
            crud.grant_character_reward_batch(self.db, self.character.id, "mission", [sources[0].id, 9999])
        self.assertEqual(self.character.gold, 0)
        self.assertEqual(self.db.query(Reward).count(), 0)
        self.assertEqual(self.db.query(progress).filter_by(character_id=self.character.id).count(), 0)

    def test_later_failure_rolls_back_all_changes(self):
        sources, progress = self.sources("challenge")
        ids = [source.id for source in sources]
        original = crud.pay_challenge_rewards
        def pay(db, source_id, **kwargs):
            if source_id == ids[1]:
                raise RuntimeError("두 번째 지급 실패")
            return original(db, source_id, **kwargs)
        with patch.object(crud, "pay_challenge_rewards", side_effect=pay), self.assertRaises(RuntimeError):
            crud.grant_character_reward_batch(self.db, self.character.id, "challenge", ids)
        self.assertEqual(self.character.gold, 0)
        self.assertEqual(self.db.query(Reward).count(), 0)
        self.assertEqual(self.db.query(progress).filter_by(character_id=self.character.id).count(), 0)
