import unittest
from datetime import date

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.models import BattleSession, Chapter, Character, Member
from app.schemas import BattleAllyTurnRequest, CharacterActionInput


class BattleRewardEligibilityTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

        self.chapter = Chapter(
            name="1장",
            start_date=date(2026, 1, 1),
            end_date=date(2026, 1, 31),
            battle_victory_reward_gold=100,
            battle_action_reward_gold=10,
            battle_participation_reward_exp=5,
        )
        members = [
            Member(login_id=f"runner-{index}", password_hash="test")
            for index in range(6)
        ]
        self.db.add_all([self.chapter, *members])
        self.db.flush()
        self.characters = [
            Character(name=name, member_id=member.id)
            for name, member in zip(
                ("행동함", "무반응", "난입만", "난입 후 행동", "늦은 난입 후 행동", "미참가"),
                members,
                strict=True,
            )
        ]
        self.db.add_all(self.characters)
        self.db.flush()

        self.battle = BattleSession(
            mode="real",
            chapter=self.chapter.name,
            status="victory",
            participants=[
                {
                    "character_id": self.characters[0].id,
                    "name": self.characters[0].name,
                    "action_reward_rounds": 2,
                    "action_reward_version": 2,
                    "joined_round": 0,
                },
                {
                    "character_id": self.characters[1].id,
                    "name": self.characters[1].name,
                    "action_reward_rounds": 0,
                    "action_reward_version": 2,
                    "joined_round": 0,
                },
                {
                    "character_id": self.characters[2].id,
                    "name": self.characters[2].name,
                    "action_reward_rounds": 1,
                    "joined_round": 2,
                },
                {
                    "character_id": self.characters[3].id,
                    "name": self.characters[3].name,
                    "action_reward_rounds": 3,
                    "joined_round": 2,
                },
                {
                    "character_id": self.characters[4].id,
                    "name": self.characters[4].name,
                    "action_reward_rounds": 1,
                    "joined_round": 2,
                },
            ],
            enemies=[],
            summons=[],
            log=[],
            round_snapshots=[{
                "round": 2,
                "phase": "ally",
                "participants": [
                    {"character_id": self.characters[2].id},
                    {"character_id": self.characters[3].id},
                ],
            }],
        )
        self.db.add(self.battle)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_only_characters_with_a_meaningful_action_receive_victory_and_action_rewards(self):
        rewards = {
            entry.character_id: entry
            for entry in crud._compute_battle_rewards(self.db, self.battle)
        }

        acted = rewards[self.characters[0].id]
        self.assertEqual((acted.victory_gold, acted.action_rounds, acted.action_gold, acted.total_gold), (100, 2, 20, 120))
        self.assertEqual(acted.participation_exp, 5)

        no_action = rewards[self.characters[1].id]
        self.assertEqual((no_action.victory_gold, no_action.action_rounds, no_action.action_gold, no_action.total_gold), (0, 0, 0, 0))
        self.assertEqual(no_action.participation_exp, 5)

        legacy_join_only = rewards[self.characters[2].id]
        self.assertEqual(
            (legacy_join_only.victory_gold, legacy_join_only.action_rounds, legacy_join_only.action_gold, legacy_join_only.total_gold),
            (0, 0, 0, 0),
        )
        self.assertEqual(legacy_join_only.participation_exp, 5)

        legacy_join_then_acted = rewards[self.characters[3].id]
        self.assertEqual(
            (
                legacy_join_then_acted.victory_gold,
                legacy_join_then_acted.action_rounds,
                legacy_join_then_acted.action_gold,
                legacy_join_then_acted.total_gold,
            ),
            (100, 2, 20, 120),
        )
        self.assertEqual(legacy_join_then_acted.participation_exp, 5)

        late_join_then_acted = rewards[self.characters[4].id]
        self.assertEqual(
            (
                late_join_then_acted.victory_gold,
                late_join_then_acted.action_rounds,
                late_join_then_acted.action_gold,
                late_join_then_acted.total_gold,
            ),
            (100, 1, 10, 110),
        )
        self.assertEqual(late_join_then_acted.participation_exp, 5)

        nonparticipant = rewards[self.characters[5].id]
        self.assertEqual((nonparticipant.victory_gold, nonparticipant.action_rounds, nonparticipant.action_gold, nonparticipant.total_gold), (0, 0, 0, 0))
        self.assertEqual(nonparticipant.participation_exp, 5)

    def test_join_round_without_an_action_does_not_count_as_an_action_reward_round(self):
        participant = crud._snapshot_combatant(self.characters[1])
        participant["joined_round"] = 2
        battle = BattleSession(
            mode="practice",
            chapter=self.chapter.name,
            status="in_progress",
            phase="ally",
            round=2,
            participants=[participant],
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
        self.db.add(battle)
        self.db.commit()

        result = crud.resolve_battle_ally_turn(self.db, battle.id, BattleAllyTurnRequest())

        self.assertEqual(result.participants[0]["action_reward_rounds"], 0)
        self.assertEqual(result.participants[0]["action_reward_version"], 2)

    def test_explicit_no_response_does_not_count_as_an_action_reward_round(self):
        participant = crud._snapshot_combatant(self.characters[1])
        battle = BattleSession(
            mode="practice",
            chapter=self.chapter.name,
            status="in_progress",
            phase="ally",
            round=1,
            participants=[participant],
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
        self.db.add(battle)
        self.db.commit()

        result = crud.resolve_battle_ally_turn(
            self.db,
            battle.id,
            BattleAllyTurnRequest(character_actions=[CharacterActionInput(
                character_id=self.characters[1].id,
                kind="none",
            )]),
        )

        self.assertEqual(result.participants[0]["action_reward_rounds"], 0)


if __name__ == "__main__":
    unittest.main()
