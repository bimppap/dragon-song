"""전투 조회가 커지는 JSON 상태를 불필요하게 읽거나 전송하지 않는지 검증한다."""

import unittest
from datetime import timezone

from sqlalchemy import create_engine, event, inspect
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.models import BattleSession


class BattlePerformanceTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def battle(self) -> BattleSession:
        session = BattleSession(
            mode="real",
            chapter="chapter",
            status="in_progress",
            participants=[],
            enemies=[{"name": "enemy", "hp": 10}],
            summons=[],
            log=[{"round": 1, "events": ["large log"]}],
            round_snapshots=[{"round": 1, "participants": [], "enemies": [], "summons": []}],
            rollback_state={"version": 1},
        )
        self.db.add(session)
        self.db.commit()
        self.db.refresh(session)
        return session

    def test_live_poll_returns_unchanged_without_loading_full_snapshot(self):
        session = self.battle()
        first, unchanged = crud.get_live_real_battle(self.db)
        self.assertFalse(unchanged)
        self.assertIsNotNone(first)

        known_updated_at = session.updated_at
        if known_updated_at.tzinfo is None:
            known_updated_at = known_updated_at.replace(tzinfo=timezone.utc)
        second, unchanged = crud.get_live_real_battle(self.db, session.id, known_updated_at)

        self.assertTrue(unchanged)
        self.assertIsNone(second)

    def test_battle_list_query_excludes_large_history_columns(self):
        self.battle()
        statements: list[str] = []

        def record_statement(_conn, _cursor, statement, _parameters, _context, _executemany):
            statements.append(statement.lower())

        event.listen(self.engine, "before_cursor_execute", record_statement)
        try:
            summaries = crud.get_battle_sessions(self.db, mode="real")
        finally:
            event.remove(self.engine, "before_cursor_execute", record_statement)

        battle_select = next(statement for statement in statements if "from battle_sessions" in statement)
        self.assertEqual(len(summaries), 1)
        self.assertNotIn("round_snapshots", battle_select)
        self.assertNotIn("rollback_state", battle_select)
        self.assertNotIn("battle_sessions.log", battle_select)

    def test_battle_hot_path_indexes_exist(self):
        inspector = inspect(self.engine)
        battle_indexes = {index["name"] for index in inspector.get_indexes("battle_sessions")}
        reward_indexes = {index["name"] for index in inspector.get_indexes("rewards")}
        self.assertIn("ix_battle_sessions_mode_status_id", battle_indexes)
        self.assertIn("ix_rewards_type_source_id", reward_indexes)


if __name__ == "__main__":
    unittest.main()
