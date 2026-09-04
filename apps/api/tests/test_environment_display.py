"""환경 색상 저장 및 스택 표시 데이터 검증."""
import unittest
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app import crud
from app.db import Base
from app.models import BattleSession, Character
from app.schemas import EnvironmentCreate, BattleTelegraphRequest


class EnvironmentDisplayTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_two_stack_types_keep_counts_and_colors_without_mutating_state(self):
        first = crud.create_environment(self.db, EnvironmentCreate(chapter="1장", name="독", color="#ff00ff"))
        second = crud.create_environment(self.db, EnvironmentCreate(chapter="1장", name="화상", color="#ff3300"))
        raw = [{"character_id": 1, "env_stacks": {str(first.id): 2, str(second.id): 2}}]
        session = BattleSession(mode="real", chapter="1장", participants=raw, enemies=[], summons=[], log=[])
        self.db.add(session)
        self.db.commit()
        result = crud._to_battle_session_read(self.db, session)
        self.assertEqual(result.participants[0]["environment_stacks"], [
            {"id": first.id, "name": "독", "color": "#ff00ff", "count": 2},
            {"id": second.id, "name": "화상", "color": "#ff3300", "count": 2},
        ])
        self.assertNotIn("environment_stacks", session.participants[0])
        crud.update_environment(self.db, first.id, EnvironmentCreate(chapter="1장", name="독", color="#00ff00"))
        self.assertEqual(crud._to_battle_session_read(self.db, session).participants[0]["environment_stacks"][0]["color"], "#00ff00")
        session.participants = [{"character_id": 1, "env_stacks": {}}]
        self.db.commit()
        self.assertEqual(crud._to_battle_session_read(self.db, session).participants[0]["environment_stacks"], [])

    def test_stackable_toggle_existing_empty_and_cleared_stacks(self):
        env = crud.create_environment(self.db, EnvironmentCreate(chapter="1장", name="독", stackable=False, stacks_per_round=2))
        self.assertFalse(env.stackable)
        character = Character(name="러너", hp=100, hp_max=100)
        self.db.add(character)
        self.db.flush()
        participant = crud._snapshot_combatant(character)
        battle = BattleSession(mode="practice", chapter="1장", phase="telegraph", round=1,
                              participants=[participant], enemies=[{"enemy_id": 1, "name": "적", "hp": 100, "skills": []}], summons=[], log=[])
        self.db.add(battle)
        self.db.commit()

        def tick():
            battle.phase = "telegraph"
            self.db.commit()
            result = crud.resolve_battle_telegraph(self.db, battle.id, BattleTelegraphRequest())
            return result.participants[0]["env_stacks"][str(env.id)]

        self.assertEqual(tick(), 2)
        self.assertEqual(tick(), 2)
        battle.participants = [{**battle.participants[0], "env_stacks": {str(env.id): 1}}]
        self.db.commit()
        self.assertEqual(tick(), 1)
        battle.participants = [{**battle.participants[0], "env_stacks": {}}]
        self.db.commit()
        self.assertEqual(tick(), 2)
        updated = crud.update_environment(self.db, env.id, EnvironmentCreate(chapter="1장", name="독", stackable=True, stacks_per_round=2))
        self.assertTrue(updated.stackable)
        self.assertEqual(tick(), 4)

    def test_max_stacks_caps_passive_environment_growth(self):
        env = crud.create_environment(self.db, EnvironmentCreate(chapter="1장", name="독", stacks_per_round=2, max_stacks=3))
        character = Character(name="러너", hp=100, hp_max=100)
        self.db.add(character)
        self.db.flush()
        battle = BattleSession(
            mode="practice",
            chapter="1장",
            phase="telegraph",
            round=1,
            participants=[crud._snapshot_combatant(character)],
            enemies=[{"enemy_id": 1, "name": "적", "hp": 100, "skills": []}],
            summons=[],
            log=[],
        )
        self.db.add(battle)
        self.db.commit()

        def tick():
            battle.phase = "telegraph"
            self.db.commit()
            result = crud.resolve_battle_telegraph(self.db, battle.id, BattleTelegraphRequest())
            return result.participants[0]["env_stacks"][str(env.id)]

        self.assertEqual(tick(), 2)
        self.assertEqual(tick(), 3)
        self.assertEqual(tick(), 3)

    def test_color_validation_and_default(self):
        self.assertEqual(EnvironmentCreate(chapter="1장", name="독").color, "#e879f9")
        with self.assertRaises(ValidationError):
            EnvironmentCreate(chapter="1장", name="독", color="invalid")


if __name__ == "__main__":
    unittest.main()
