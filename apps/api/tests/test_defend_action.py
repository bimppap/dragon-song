import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.models import BattleSession, Character
from app.schemas import BattleAllyTurnRequest, CharacterActionInput


class DefendActionTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

        self.defenders = [
            Character(name="방패 A", faction="수비", hp=100, hp_max=100, mp=3, mp_max=3),
            Character(name="방패 B", faction="수비", hp=100, hp_max=100, mp=3, mp_max=3),
        ]
        self.target = Character(name="보호 대상", faction="공격", hp=100, hp_max=100)
        self.db.add_all([*self.defenders, self.target])
        self.db.flush()

        self.battle = BattleSession(
            mode="practice",
            chapter="1장",
            status="in_progress",
            phase="ally",
            round=1,
            participants=[
                crud._snapshot_combatant(character)
                for character in [*self.defenders, self.target]
            ],
            enemies=[{
                "enemy_id": 1,
                "name": "적",
                "hp": 100,
                "max_hp": 100,
                "attack": 0,
                "skills": [],
                "status_effects": [],
                "joined_round": 0,
            }],
            summons=[],
            log=[],
        )
        self.db.add(self.battle)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_multiple_defenders_can_spend_mp_to_protect_an_ally(self):
        result = crud.resolve_battle_ally_turn(
            self.db,
            self.battle.id,
            BattleAllyTurnRequest(character_actions=[
                CharacterActionInput(
                    character_id=defender.id,
                    kind="defend",
                    protect_target_character_id=self.target.id,
                )
                for defender in self.defenders
            ]),
        )

        participants = {participant["name"]: participant for participant in result.participants}
        events = result.log[-1]["events"]

        for defender in self.defenders:
            snapshot = participants[defender.name]
            self.assertEqual(snapshot["mp"], 2)
            self.assertEqual(snapshot["protect_target"], self.target.id)
            self.assertIn(
                f"🛡️ {defender.name} 방어 태세 → {self.target.name} 보호 · +20 주목도 · MP -1 [2/3]",
                events,
            )


if __name__ == "__main__":
    unittest.main()
