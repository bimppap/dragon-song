import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.models import BattleSession, Character, CharacterSkillUnlock, SkillNode
from app.schemas import BattleAllyTurnRequest, CharacterActionInput, EnvironmentCreate


class AnvilSkillTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

        self.locked_environment = crud.create_environment(
            self.db,
            EnvironmentCreate(chapter="1장", name="해제 불가 안개", dispellable=False),
        )
        self.old_environment = crud.create_environment(
            self.db,
            EnvironmentCreate(chapter="1장", name="늪의 저주", dispellable=True),
        )
        self.new_environment = crud.create_environment(
            self.db,
            EnvironmentCreate(chapter="1장", name="독기", dispellable=True),
        )
        self.character = Character(
            name="실험 요정 B",
            faction="수비",
            hp=78,
            hp_max=100,
            mp=10,
            mp_max=10,
            skill_eff_fixed=0.02,
            skill_eff_true=3,
            heal_eff=0.5,
            presence=1,
        )
        self.db.add(self.character)
        self.db.flush()
        self.skill = SkillNode(
            book="불굴의 서",
            branch=0,
            col=None,
            tier=1,
            default_name="모루 I",
            trigger_type="즉발형",
            category="복합",
            stackable=False,
            var_name="ab_anvil",
            cost=3,
            power=0.15,
            target="SELF",
            activation_order=3,
            environment_stack_remove=1,
            is_public=True,
        )
        self.db.add(self.skill)
        self.db.flush()
        self.db.add(CharacterSkillUnlock(character_id=self.character.id, node_id=self.skill.id))

        participant = crud._snapshot_combatant(self.character)
        participant.update(
            attn=5,
            env_stacks={
                str(self.locked_environment.id): 1,
                str(self.old_environment.id): 2,
                str(self.new_environment.id): 1,
            },
            env_stack_order=[
                str(self.locked_environment.id),
                str(self.old_environment.id),
                str(self.new_environment.id),
                str(self.old_environment.id),
            ],
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
                "name": "오버그로스",
                "hp": 2500,
                "max_hp": 2500,
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

    def test_anvil_uses_skill_power_heals_attention_and_removes_oldest_dispellable_stack(self):
        result = crud.resolve_battle_ally_turn(
            self.db,
            self.battle.id,
            BattleAllyTurnRequest(character_actions=[CharacterActionInput(
                character_id=self.character.id,
                kind="skill",
                skill_node_id=self.skill.id,
            )]),
        )

        participant = result.participants[0]
        event = "🪨 실험 요정 B의 모루 I → 18 치유 · 늪의 저주 스택 -1"
        self.assertIn(event, result.log[-1]["events"])
        self.assertEqual(participant["hp"], 96)
        self.assertEqual(participant["attn"], 23)
        self.assertEqual(participant["env_stacks"], {
            str(self.locked_environment.id): 1,
            str(self.old_environment.id): 1,
            str(self.new_environment.id): 1,
        })
        self.assertEqual(participant["env_stack_order"], [
            str(self.locked_environment.id),
            str(self.new_environment.id),
            str(self.old_environment.id),
        ])
        self.assertEqual(
            result.log[-1]["calculations"][event],
            "min(floor(최대 체력 100 × (기술 위력 0.15 × (1 + 기술 효율 비례 0.02)) + "
            "기술 효율 고정 3), 잃은 체력 22)",
        )


if __name__ == "__main__":
    unittest.main()
