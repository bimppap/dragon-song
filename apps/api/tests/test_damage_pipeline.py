"""피해 파이프라인과 기술 대상 능력치가 명세대로 적용되는지 검증한다.

- 피해는 (공격력 계산 → 대상 방어력 차감 → 피해 감소 적용) 순서로 계산한다.
- 방어력과 캐릭터가 쌓아 둔 피해 감소는 방어 행동을 했는지와 무관하게 늘 적용된다.
- 역할별 방어 감소(수비 50%, 그 외 30%)는 방어 행동을 한 라운드에만 더해진다.
- 인원 지정 기술의 대상 수에는 캐릭터의 "기술 대상" 능력치가 더해진다.
"""
import re
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

    def take_hit(self, defending: bool, *, faction: str = "수비", **stats) -> int:
        target = Character(name="대상", faction=faction, hp=500, hp_max=500, mp=10, mp_max=10, **stats)
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

    def test_stat_reduction_applies_without_defending(self):
        # 방어하지 않아도 캐릭터가 쌓아 둔 피해 감소(0.25)는 그대로 적용된다.
        self.assertEqual(self.take_hit(False, def_=20, dmg_r=0.25), 60)

    def test_defending_adds_the_role_reduction_for_that_round(self):
        # 수비가 방어하면 +50%p → (100 - 20) × (1 - 0.75) = 20.
        self.assertEqual(self.take_hit(True, def_=20, dmg_r=0.25), 20)
        # 방어하지 않은 같은 캐릭터는 역할 감소를 받지 않는다.
        self.assertEqual(self.take_hit(False, def_=20, dmg_r=0.25), 60)

    def test_non_defender_roles_get_a_smaller_defend_reduction(self):
        # 공격/치유는 방어해도 +30%p다: (100 - 20) × (1 - 0.3) = 56.
        self.assertEqual(self.take_hit(True, faction="공격", def_=20), 56)
        self.assertEqual(self.take_hit(True, faction="수비", def_=20), 40)

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
        # 시전자도 체력이 빈 상태여야 늘어난 대상이 실제로 치유된다(치유량 0은 로그에 남지 않는다).
        self.caster = Character(name="치유사", faction="치유", hp=10, hp_max=100, mp=20, mp_max=20,
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

    def healed_events(self):
        # 대상이 여럿이면 시전자 줄 아래로 대상별 줄이 붙으므로 치유량이 적힌 줄만 센다.
        return [event for event in self.cast().log[-1]["events"] if re.search(r"\d+ 치유", event)]

    def test_stat_adds_targets_to_a_single_target_skill(self):
        self.assertEqual(len(self.healed_events()), 2)

    def test_zero_stat_keeps_the_skill_target_count(self):
        self.caster.skill_target = 0
        self.db.commit()
        self.assertEqual(len(self.healed_events()), 1)


if __name__ == "__main__":
    unittest.main()


class OverkillLogTest(unittest.TestCase):
    """오버킬이면 남은 체력에 잘리기 전 실제 피해도 함께 적는다."""

    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.hero = Character(name="서틴", faction="공격", hp=100, hp_max=100, mp=10, mp_max=10, atk=500)
        self.db.add(self.hero)
        self.db.flush()
        self.node = SkillNode(
            book="용맹의 서", branch=0, col=None, tier=1, default_name="강타", trigger_type="즉발형",
            category="피해", stackable=False, var_name="ab_strike", cost=1, power=2.0,
            target="1", target_side="ENEMY", activation_order=6, is_public=True,
        )
        self.db.add(self.node)
        self.db.flush()
        self.db.add(CharacterSkillUnlock(character_id=self.hero.id, node_id=self.node.id))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def strike(self, **action) -> list[str]:
        battle = BattleSession(
            mode="practice", chapter="1장", status="in_progress", phase="ally", round=1,
            participants=[crud._snapshot_combatant(self.hero)],
            enemies=[{"enemy_id": 1, "name": "오버그로스", "hp": 1, "max_hp": 666, "attack": 0,
                      "skills": [], "status_effects": [], "joined_round": 0}],
            summons=[], log=[],
        )
        self.db.add(battle)
        self.db.commit()
        result = crud.resolve_battle_ally_turn(self.db, battle.id, BattleAllyTurnRequest(
            character_actions=[CharacterActionInput(character_id=self.hero.id, target_enemy_id=1, **action)],
        ))
        return result.log[-1]["events"]

    def test_basic_attack_reports_the_damage_before_the_cap(self):
        event = next(e for e in self.strike(kind="attack") if e.startswith("⚔️"))
        self.assertEqual(event, "⚔️ 서틴 공격: 1 피해 · 오버그로스 [0/666] (오버킬 - 가해진 피해 500)")

    def test_skill_reports_the_damage_before_the_cap(self):
        event = next(e for e in self.strike(kind="skill", skill_node_id=self.node.id) if e.startswith("✨"))
        self.assertIn("(오버킬 - 가해진 피해 1000)", event)

    def test_no_note_when_the_target_survives(self):
        self.hero.atk = 1
        self.db.commit()
        event = next(e for e in self.strike(kind="attack") if e.startswith("⚔️"))
        self.assertNotIn("오버킬", event)
