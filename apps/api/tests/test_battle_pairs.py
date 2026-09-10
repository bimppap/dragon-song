"""페어 편성 저장, 참가자 변경, 유효성 및 실시간 초안 보존 검증."""

import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.models import BattleSession, Character, Enemy
from app.migrations import ensure_schema
from app.schemas import BattleJoinRequest, BattlePairsRequest, BattleStartRequest
from app.ws import BattleConnectionManager


class BattlePairsTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.characters = [Character(name=f"캐릭터 {i}", hp=100, hp_max=100) for i in range(5)]
        self.enemy = Enemy(name="에너미", base_hp=1000, attack=1)
        self.db.add_all([*self.characters, self.enemy])
        self.db.commit()
        self.ids = [character.id for character in self.characters]
        self.admin = SimpleNamespace(id=None, role="ADMIN")

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def start(self, *, count=4, **kwargs):
        return crud.start_battle(self.db, self.admin, BattleStartRequest(
            mode="real", enemy_ids=[self.enemy.id], character_ids=self.ids[:count], **kwargs,
        ))

    def test_random_pairing_and_odd_waiter(self):
        with patch("app.crud.random.shuffle", side_effect=lambda ids: ids.reverse()) as shuffle:
            result = self.start(count=5, pair_battle=True)
        shuffle.assert_called_once()
        self.assertEqual(result.pairs, [[5, 4], [3, 2], [1]])
        self.assertTrue(result.pair_battle)

    def test_explicit_matching_survives_reload_and_runner_read(self):
        result = self.start(pair_battle=True, pairs=[[1, 4], [3, 2]])
        updated = crud.update_battle_pairs(self.db, result.id, BattlePairsRequest(pairs=[[1, 2], [3, 4]]))
        self.db.expire_all()
        reloaded = crud.get_battle_session(self.db, result.id, SimpleNamespace(role="RUNNER"))
        live, unchanged = crud.get_live_real_battle(self.db)
        self.assertFalse(unchanged)
        self.assertEqual(updated.pairs, [[1, 2], [3, 4]])
        self.assertEqual(reloaded.pairs, updated.pairs)
        self.assertEqual(live.pairs, updated.pairs)
        self.assertTrue(reloaded.pair_battle)

    def test_invalid_matches_are_rejected_without_changing_saved_pairs(self):
        result = self.start(pair_battle=True, pairs=[[1, 2], [3, 4]])
        invalid = [[], [[1, 2]], [[1, 2], [2, 4]], [[1, 2], [3, 99]], [[1, 2, 3, 4]], [[1], [2], [3, 4]], [[], [1, 2], [3, 4]]]
        for pairs in invalid:
            with self.subTest(pairs=pairs), self.assertRaises(HTTPException) as error:
                crud.update_battle_pairs(self.db, result.id, BattlePairsRequest(pairs=pairs))
            self.assertEqual(error.exception.status_code, 400)
        self.assertEqual(crud.get_battle_session(self.db, result.id, self.admin).pairs, result.pairs)

    def test_non_pair_battles_stay_compatible(self):
        result = self.start()
        self.assertFalse(result.pair_battle)
        self.assertEqual(result.pairs, [])
        with self.assertRaises(HTTPException):
            crud.update_battle_pairs(self.db, result.id, BattlePairsRequest(pairs=[[1, 2], [3, 4]]))
        with self.assertRaises(HTTPException):
            self.start(pairs=[[1, 2], [3, 4]])
        with self.assertRaises(HTTPException):
            self.start(pair_battle=True, pairs=[[1, 2]])

    def test_migration_defaults_existing_battles_to_normal_mode(self):
        result = self.start()
        self.db.close()
        with self.engine.begin() as connection:
            connection.execute(text("ALTER TABLE battle_sessions DROP COLUMN pairs"))
            connection.execute(text("ALTER TABLE battle_sessions DROP COLUMN pair_battle"))
        ensure_schema(self.engine)
        ensure_schema(self.engine)
        reloaded = crud.get_battle_session(self.db, result.id, self.admin)
        self.assertFalse(reloaded.pair_battle)
        self.assertEqual(reloaded.pairs, [])
        self.assertEqual(len(reloaded.participants), 4)

    def test_finished_and_missing_battles_reject_changes(self):
        result = self.start(pair_battle=True)
        session = self.db.get(BattleSession, result.id)
        session.status = "victory"
        self.db.commit()
        for session_id, status in [(result.id, 400), (99999, 404)]:
            with self.subTest(session_id=session_id), self.assertRaises(HTTPException) as error:
                crud.update_battle_pairs(self.db, session_id, BattlePairsRequest(pairs=[[1, 2], [3, 4]]))
            self.assertEqual(error.exception.status_code, status)

    def test_join_preserves_pairs_and_fills_waiting_slot(self):
        result = self.start(count=3, pair_battle=True, pairs=[[1, 2], [3]])
        fourth = crud.join_battle(self.db, result.id, BattleJoinRequest(character_id=4))
        self.assertEqual(fourth.pairs, [[1, 2], [3, 4]])
        fifth = crud.join_battle(self.db, result.id, BattleJoinRequest(character_id=5))
        self.assertEqual(fifth.pairs, [[1, 2], [3, 4], [5]])

    def test_undo_removes_joiner_without_losing_other_pairs(self):
        result = self.start(count=3, pair_battle=True, pairs=[[1, 2], [3]])
        session = self.db.get(BattleSession, result.id)
        session.round_snapshots = [{
            "round": 1, "phase": "telegraph", "participants": session.participants,
            "enemies": session.enemies, "summons": [], "pending_enemy_actions": [],
        }]
        self.db.commit()
        crud.join_battle(self.db, result.id, BattleJoinRequest(character_id=4))
        restored = crud.undo_last_turn(self.db, result.id)
        self.assertEqual(restored.pairs, [[1, 2], [3]])
        self.assertEqual([p["character_id"] for p in restored.participants], [1, 2, 3])

    def test_pair_update_clears_drafts_when_borrowed_stats_and_skills_change(self):
        result = self.start(pair_battle=True, pairs=[[1, 2], [3, 4]])
        manager = BattleConnectionManager()
        first = result.model_dump(mode="json")
        manager.remember_session(result.id, first)
        manager.apply_draft_patch(result.id, "character", 1, {"kind": "defend"})
        manager.apply_draft_patch(result.id, "enemy", 1, {"kind": "none"})
        manager._previews[result.id] = {1: {"kind": "defend"}}
        updated = crud.update_battle_pairs(self.db, result.id, BattlePairsRequest(pairs=[[1, 3], [2, 4]]))
        manager.remember_session(result.id, updated.model_dump(mode="json"))
        message = manager.session_message(result.id, is_staff=True)
        self.assertEqual(message["draft"], {})
        self.assertIsNone(message["preview"])
        self.assertEqual(message["session"]["pairs"], [[1, 3], [2, 4]])
        self.assertNotIn("draft", manager.session_message(result.id))
