"""피해 파이프라인과 기술 대상 능력치가 명세대로 적용되는지 검증한다.

- 피해는 (공격력 계산 → 대상 방어력 차감 → 피해 감소 적용) 순서로 계산한다.
- 방어력과 피해 감소는 방어 행동을 했는지와 무관하게 늘 적용된다.
- 인원 지정 기술의 대상 수에는 캐릭터의 "기술 대상" 능력치가 더해진다.
"""
import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.models import BattleSession, Character, CharacterSkillUnlock, SkillNode
from app.schemas import BattleAllyTurnRequest, CharacterActionInput


def enemy(attack=100):
    return {
        "enemy_id": 1, "name": "적", "hp": 1000, "max_hp": 1000, "attack": attack,
        "skills": [{"name": "공격", "skill_type": "지정 공격", "target_count": 1, "damage_percent": 100}],
        "status_effects": [], "joined_round": 0,
    }


class DamagePipelineTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def take_hit(self, defending: bool, **stats) -> int:
        target = Character(name="대상", faction="수비", hp=500, hp_max=500, mp=10, mp_max=10, **stats)
        self.db.add(target)
        self.db.commit()
        snapshot = crud._snapshot_combatant(target)
        snapshot["defending"] = defending
        battle = BattleSession(
            mode="practice", chapter="1장", status="in_progress", phase="enemy", round=1,
            participants=[snapshot], enemies=[enemy()], summons=[], log=[],
            pending_enemy_actions=[{
                "enemy_id": 1, "kind": "attack", "skill_index": 0,
                "target_character_ids": [target.id],
            }],
        )
        self.db.add(battle)
        self.db.commit()
        result = crud.resolve_battle_enemy_turn(self.db, battle.id)
        return 500 - result.participants[0]["hp"]

    def test_defense_is_subtracted_before_damage_reduction(self):
        # (100 - 20) × (1 - 0.25) = 60. 감소를 먼저 적용하면 55가 된다.
        self.assertEqual(self.take_hit(False, def_=20, dmg_r=0.25), 60)

    def test_defense_and_reduction_apply_without_defending(self):
        self.assertEqual(self.take_hit(False, def_=20, dmg_r=0.25),
                         self.take_hit(True, def_=20, dmg_r=0.25))

    def test_defense_amplifiers_apply_to_the_subtracted_value(self):
        # 방어력 20 × (1 + 0.5) × (1 + 0.2) = 36 → 100 - 36 = 64
        self.assertEqual(self.take_hit(False, def_=20, def_p=0.5, def_eff=0.2), 64)

    def test_damage_never_goes_below_zero(self):
        self.assertEqual(self.take_hit(False, def_=999), 0)


class SkillTargetStatTest(unittest.TestCase):
    """기술 대상 능력치만큼 인원 지정 기술의 대상이 늘어난다."""

    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.caster = Character(name="치유사", faction="치유", hp=100, hp_max=100, mp=20, mp_max=20,
                                skill_target=1)
        self.allies = [Character(name=f"아군{index}", faction="공격", hp=10, hp_max=100) for index in range(3)]
        self.db.add_all([self.caster, *self.allies])
        self.db.flush()
        self.node = SkillNode(
            book="헌신의 서", branch=0, col=0, tier=2, default_name="회복 II",
            trigger_type="즉발형", category="회복", stackable=False, var_name="ab_cure",
            cost=1, power=0.5, target="1", target_side="ALLY", activation_order=5, is_public=True,
        )
        self.db.add(self.node)
        self.db.flush()
        self.db.add(CharacterSkillUnlock(character_id=self.caster.id, node_id=self.node.id))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def cast(self):
        battle = BattleSession(
            mode="practice", chapter="1장", status="in_progress", phase="ally", round=1,
            participants=[crud._snapshot_combatant(c) for c in (self.caster, *self.allies)],
            enemies=[enemy()], summons=[], log=[],
        )
        self.db.add(battle)
        self.db.commit()
        return crud.resolve_battle_ally_turn(self.db, battle.id, BattleAllyTurnRequest(
            character_actions=[CharacterActionInput(
                character_id=self.caster.id, kind="skill",
                skill_node_id=self.node.id, target_character_id=self.allies[0].id,
            )],
        ))

    def test_stat_adds_targets_to_a_single_target_skill(self):
        healed = [event for event in self.cast().log[-1]["events"] if "치유" in event]
        self.assertEqual(len(healed), 2)

    def test_zero_stat_keeps_the_skill_target_count(self):
        self.caster.skill_target = 0
        self.db.commit()
        healed = [event for event in self.cast().log[-1]["events"] if "치유" in event]
        self.assertEqual(len(healed), 1)


if __name__ == "__main__":
    unittest.main()
