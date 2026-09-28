"""전투 API 경로가 의도한 핸들러로 잡히는지 확인한다.

"/battles/finished"처럼 고정된 경로는 "/battles/{session_id}"보다 먼저 선언돼야 하며,
순서가 어긋나면 "finished"가 session_id로 해석돼 422가 난다.
"""
import unittest

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from types import SimpleNamespace

from app.auth import get_current_member
from app.db import Base, get_db
from app.main import app
from app.models import BattleSession


class BattleRouteTest(unittest.TestCase):
    def setUp(self):
        # TestClient는 핸들러를 작업 스레드에서 돌리므로 같은 인메모리 연결을 공유하게 둔다.
        self.engine = create_engine(
            "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.db.add(BattleSession(
            mode="real", chapter="1장", status="victory", round=3,
            participants=[], enemies=[{"enemy_id": 1, "name": "용", "hp": 0, "max_hp": 10,
                                       "attack": 1, "skills": [], "status_effects": []}],
            summons=[], log=[],
        ))
        self.db.add(BattleSession(
            mode="real", chapter="1장", status="in_progress", round=1,
            participants=[], enemies=[], summons=[], log=[],
        ))
        self.db.commit()
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_member] = lambda: SimpleNamespace(id=1, role="RUNNER")
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()

    def test_finished_list_is_not_swallowed_by_the_session_id_route(self):
        response = self.client.get("/battles/finished")
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual([entry["status"] for entry in body], ["victory"])
        self.assertEqual(body[0]["enemy_names"], ["용"])

    def test_numeric_session_id_still_reaches_the_session_route(self):
        finished_id = self.client.get("/battles/finished").json()[0]["id"]
        self.assertEqual(self.client.get(f"/battles/{finished_id}").status_code, 200)


if __name__ == "__main__":
    unittest.main()
