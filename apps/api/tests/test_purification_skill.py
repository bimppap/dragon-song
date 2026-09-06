import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.models import BattleSession, Character, CharacterSkillUnlock, SkillNode
from app.schemas import BattleAllyTurnRequest, CharacterActionInput, EnvironmentCreate


class PurificationSkillTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

        self.environment = crud.create_environment(
            self.db,
            EnvironmentCreate(chapter="1장", name="늪의 저주", dispellable=True),
        )
        self.character = Character(
            name="정화 요정",
            faction="치유",
            hp=100,
            hp_max=100,
            mp=10,
            mp_max=10,
        )
        self.db.add(self.character)
        self.db.flush()

        # 구버전 정화 데이터는 실제 해제 수를 powers에 저장하면서,
        # 별도 환경 스택 제거 수 컬럼에는 기본값 0을 저장했다.
        self.skill = SkillNode(
            book="헌신의 서",
            branch=2,
            col=None,
            tier=1,
            default_name="정화",
            trigger_type="즉발형",
            category="회복",
            stackable=False,
            var_name="ab_purification",
            cost=2,
            power=0.15,
            powers={"cleanse_count": 2},
            target="1",
            target_side="ALLY",
            activation_order=2,
            cleanse_count=0,
            is_public=True,
        )
        self.db.add(self.skill)
        self.db.flush()
        self.db.add(CharacterSkillUnlock(character_id=self.character.id, node_id=self.skill.id))

        participant = crud._snapshot_combatant(self.character)
        participant.update(
            env_stacks={str(self.environment.id): 3},
            env_stack_order=[str(self.environment.id)] * 3,
        )
        self.battle = BattleSession(
            mode="practice",
            chapter="1장",
            status="in_progress",
            phase="ally",
            round=1,
            participants=[participant],
            enemies=[{
                "enemy_id": 1,
                "name": "훈련용 에너미",
                "hp": 1000,
                "max_hp": 1000,
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

    def test_legacy_cleanse_count_removes_environment_stacks(self):
        result = crud.resolve_battle_ally_turn(
            self.db,
            self.battle.id,
            BattleAllyTurnRequest(character_actions=[CharacterActionInput(
                character_id=self.character.id,
                kind="skill",
                skill_node_id=self.skill.id,
                target_character_id=self.character.id,
            )]),
        )

        participant = result.participants[0]
        self.assertEqual(participant["env_stacks"], {str(self.environment.id): 1})
        self.assertEqual(participant["env_stack_order"], [str(self.environment.id)])
        self.assertTrue(any("약화 2개 해제 (늪의 저주 × 2)" in event for event in result.log[-1]["events"]))


if __name__ == "__main__":
    unittest.main()
