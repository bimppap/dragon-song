import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.models import BattleSession, Character, CharacterSkillUnlock, SkillNode
from app.schemas import BattleAllyTurnRequest, CharacterActionInput, EnemySkill


class CounterSkillTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

        self.caster = Character(
            name="실험 요정 B",
            faction="수비",
            hp=100,
            hp_max=100,
            mp=10,
            mp_max=10,
            atk=10,
            def_=5,
            def_eff=0.2,
            skill_eff_fixed=0.1,
        )
        self.target = Character(
            name="실험 요정 A",
            faction="공격",
            hp=100,
            hp_max=100,
            atk=1,
            def_=0,
        )
        self.db.add_all([self.caster, self.target])
        self.db.flush()

        self.skill = SkillNode(
            book="불굴의 서",
            branch=1,
            col=0,
            tier=2,
            default_name="반격",
            trigger_type="혼합형",
            category="강화",
            stackable=False,
            var_name="ab_counter",
            cost=3,
            power=0.1,
            powers={"counter_damage": 2.0},
            target="1",
            target_side="ALLY",
            activation_order=3,
            is_public=True,
        )
        self.db.add(self.skill)
        self.db.flush()
        self.db.add(CharacterSkillUnlock(character_id=self.caster.id, node_id=self.skill.id))

        enemy_skill = EnemySkill(
            skill_type="지정 공격",
            name="내리치기",
            target_count=1,
            damage_percent=100,
        )
        self.battle = BattleSession(
            mode="practice",
            chapter="1장",
            status="in_progress",
            phase="ally",
            round=1,
            participants=[
                crud._snapshot_combatant(self.caster),
                crud._snapshot_combatant(self.target),
            ],
            enemies=[{
                "enemy_id": 1,
                "name": "훈련용 에너미",
                "hp": 100,
                "max_hp": 100,
                "attack": 50,
                "skills": [enemy_skill.model_dump()],
                "status_effects": [],
                "joined_round": 0,
            }],
            summons=[],
            pending_enemy_actions=[{
                "enemy_id": 1,
                "kind": "attack",
                "skill_index": 0,
                "target_character_ids": [self.target.id],
            }],
            log=[],
        )
        self.db.add(self.battle)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_target_takes_reduced_damage_and_caster_counterattacks_with_own_stats(self):
        ally_result = crud.resolve_battle_ally_turn(
            self.db,
            self.battle.id,
            BattleAllyTurnRequest(character_actions=[CharacterActionInput(
                character_id=self.caster.id,
                kind="skill",
                skill_node_id=self.skill.id,
                skill_target_keys=[f"ally:{self.target.id}"],
                target_character_id=self.target.id,
            )]),
        )

        cast_event = "↩️ 실험 요정 B의 반격 I → 실험 요정 A (피해 감소 +11%) · 실험 요정 B 반격 태세"
        self.assertIn(cast_event, ally_result.log[-1]["events"])
        self.assertEqual(
            ally_result.log[-1]["calculations"][cast_event],
            "floor(기술 위력 0.1 × (1 + 기술 효율 비례 0.1) × 100)%",
        )

        enemy_result = crud.resolve_battle_enemy_turn(self.db, self.battle.id)

        caster = next(p for p in enemy_result.participants if p["character_id"] == self.caster.id)
        target = next(p for p in enemy_result.participants if p["character_id"] == self.target.id)
        self.assertEqual(caster["hp"], 100)
        self.assertEqual(target["hp"], 56)
        self.assertEqual(enemy_result.enemies[0]["hp"], 65)

        counter_event = "↩️ 실험 요정 B의 반격 I → 훈련용 에너미 35 피해 · [65/100]"
        self.assertIn(counter_event, enemy_result.log[-1]["events"])
        self.assertEqual(
            enemy_result.log[-1]["calculations"][counter_event],
            "min(floor(((공격력 10 × (1 + 공격력 증폭 0) + "
            "방어력 5 × (1 + 방어력 증폭 0) × (1 + 방어 효율 0.2)) × "
            "기술 위력 2 × (1 + 기술 효율 비례 0.1) + 기술 효율 고정 0) × "
            "(1 + 피해 증폭 0)), 남은 체력 100)",
        )


if __name__ == "__main__":
    unittest.main()
