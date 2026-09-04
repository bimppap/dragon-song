import unittest
from unittest.mock import patch
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app import crud
from app.db import Base
from app.models import BattleSession, Character


class SummonTargetsTest(unittest.TestCase):
    def test_each_summon_draws_again_from_current_eligible_allies(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        with Session(engine) as db:
            characters = [Character(name=name, hp=10, hp_max=10) for name in ("A", "B", "C", "D")]
            db.add_all(characters)
            db.flush()
            participants = [crud._snapshot_combatant(c) for c in characters]
            participants[0]["attn"] = 999
            participants[2]["retreated"] = True
            participants[3]["joined_round"] = 1
            battle = BattleSession(mode="practice", phase="enemy", round=1, participants=participants,
                enemies=[{"enemy_id": 1, "name": "적", "hp": 10}], pending_enemy_actions=[],
                summons=[{"id": i, "name": "하수인", "hp": 10, "max_hp": 10, "attack": 100} for i in (1, 2)])
            db.add(battle)
            db.commit()
            draws = []
            def choose(candidates):
                draws.append([p["name"] for p in candidates])
                return candidates[-1]
            with patch("app.crud.random.choice", side_effect=choose):
                result = crud.resolve_battle_enemy_turn(db, battle.id)
            self.assertEqual(draws, [["A", "B"], ["A"]])
            attacks = [event for event in result.log[-1]["events"] if event.startswith("👹 하수인")]
            self.assertIn("→ B", attacks[0])
            self.assertIn("→ A", attacks[1])
        engine.dispose()


if __name__ == "__main__":
    unittest.main()
