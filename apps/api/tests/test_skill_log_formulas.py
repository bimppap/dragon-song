import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.models import BattleSession, Character, CharacterSkillUnlock, SkillNode
from app.schemas import BattleAllyTurnRequest, CharacterActionInput


class SkillLogFormulaTest(unittest.TestCase):
    """저주·구호 로그 문구와 계산식이 기술에 적힌 기술 위력을 그대로 쓰는지 확인한다."""

    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

        self.caster = Character(name="실험 요정 D", faction="치유", hp=100, hp_max=100, mp=10, mp_max=10)
        self.ally = Character(name="실험 요정 A", faction="공격", hp=50, hp_max=100, mp=10, mp_max=10)
        self.db.add_all([self.caster, self.ally])
        self.db.flush()

        self.curse = self._skill_node("탐구의 서", 0, "저주", "약화", "ab_curse", 0.05, "1", "ENEMY")
        self.aid = self._skill_node("헌신의 서", 1, "구호", "회복", "ab_aid", 0.1, "2", "ALLY")
        self.db.add_all([
            CharacterSkillUnlock(character_id=self.caster.id, node_id=self.curse.id),
            CharacterSkillUnlock(character_id=self.caster.id, node_id=self.aid.id),
        ])

        self.battle = BattleSession(
            mode="practice",
            chapter="1장",
            status="in_progress",
            phase="ally",
            round=1,
            participants=[crud._snapshot_combatant(self.caster), crud._snapshot_combatant(self.ally)],
            enemies=[{
                "enemy_id": 1, "name": "오버그로스", "hp": 100, "max_hp": 100,
                "attack": 10, "skills": [], "status_effects": [], "joined_round": 0,
            }],
            summons=[],
            log=[],
        )
        self.db.add(self.battle)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def _skill_node(self, book, branch, name, category, var_name, power, target, target_side):
        node = SkillNode(
            book=book, branch=branch, col=0, tier=1, default_name=name,
            trigger_type="즉발형", category=category, stackable=False, var_name=var_name,
            cost=1, power=power, target=target, target_side=target_side, activation_order=1, is_public=True,
        )
        self.db.add(node)
        self.db.flush()
        return node

    def _resolve(self, action: CharacterActionInput):
        return crud.resolve_battle_ally_turn(self.db, self.battle.id, BattleAllyTurnRequest(character_actions=[action]))

    def test_curse_logs_damage_amplification_with_formula(self):
        result = self._resolve(CharacterActionInput(
            character_id=self.caster.id,
            kind="skill",
            skill_node_id=self.curse.id,
            skill_target_keys=["enemy:1"],
            target_enemy_id=1,
        ))

        event = "🔮 실험 요정 D의 저주 → 오버그로스 피해 증폭 -5% · MP -1 [9/10]"
        self.assertIn(event, result.log[-1]["events"])
        self.assertEqual(
            result.log[-1]["calculations"][event],
            "floor(기술 위력 0.05 × (1 + 기술 효율 비례 0) × 100)%",
        )

    def test_aid_heal_uses_configured_skill_power(self):
        result = self._resolve(CharacterActionInput(
            character_id=self.caster.id,
            kind="skill",
            skill_node_id=self.aid.id,
            skill_target_keys=[f"ally:{self.ally.id}", f"ally:{self.caster.id}"],
            target_character_id=self.ally.id,
        ))

        heal_event = next(event for event in result.log[-1]["events"] if "실험 요정 A" in event and "치유" in event)
        self.assertIn("10 치유", heal_event)
        self.assertEqual(
            result.log[-1]["calculations"][heal_event],
            "min(floor(최대 체력 100 × (기술 위력 0.1 × (1 + 기술 효율 비례 0)) × "
            "(1 + 치유 효율 0) + 기술 효율 고정 0), 잃은 체력 50)",
        )


if __name__ == "__main__":
    unittest.main()
