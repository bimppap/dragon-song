import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.models import BattleSession, Character, CharacterSkillUnlock, SkillNode
from app.schemas import BattleAllyTurnRequest, CharacterActionInput


class SkillMultiTargetTest(unittest.TestCase):
    """단일 대상으로 구현돼 있던 기술도 기술 노드의 '기술 대상' 수만큼 적용된다."""

    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

        self.caster = Character(name="시전자", faction="치유", hp=100, hp_max=100, mp=10, mp_max=10)
        self.ally_a = Character(name="아군 A", faction="공격", hp=50, hp_max=100, mp=0, mp_max=10)
        self.ally_b = Character(name="아군 B", faction="수비", hp=50, hp_max=100, mp=0, mp_max=10)
        self.db.add_all([self.caster, self.ally_a, self.ally_b])
        self.db.flush()

        self.cure = self._skill_node("헌신의 서", 0, "회복", "회복", "ab_cure", power=0.5, target="2")
        self.charge = self._skill_node("탐구의 서", 1, "충전", "회복", "ab_charge", power=2, target="2")
        self.db.add_all([
            CharacterSkillUnlock(character_id=self.caster.id, node_id=self.cure.id),
            CharacterSkillUnlock(character_id=self.caster.id, node_id=self.charge.id),
        ])

        self.battle = BattleSession(
            mode="practice",
            chapter="1장",
            status="in_progress",
            phase="ally",
            round=1,
            participants=[
                crud._snapshot_combatant(self.caster),
                crud._snapshot_combatant(self.ally_a),
                crud._snapshot_combatant(self.ally_b),
            ],
            enemies=[{
                "enemy_id": 1, "name": "훈련용 에너미", "hp": 100, "max_hp": 100,
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

    def _skill_node(self, book, branch, name, category, var_name, *, power, target):
        node = SkillNode(
            book=book, branch=branch, col=0, tier=1, default_name=name,
            trigger_type="즉발형", category=category, stackable=False, var_name=var_name,
            cost=1, power=power, target=target, target_side="ALLY", activation_order=1, is_public=True,
        )
        self.db.add(node)
        self.db.flush()
        return node

    def _resolve(self, skill, keys):
        return crud.resolve_battle_ally_turn(
            self.db,
            self.battle.id,
            BattleAllyTurnRequest(character_actions=[CharacterActionInput(
                character_id=self.caster.id,
                kind="skill",
                skill_node_id=skill.id,
                skill_target_keys=keys,
                target_character_id=self.ally_a.id,
            )]),
        )

    def test_single_target_heal_skill_applies_to_configured_target_count(self):
        result = self._resolve(self.cure, [f"ally:{self.ally_a.id}", f"ally:{self.ally_b.id}"])

        healed = [p for p in result.participants if p["character_id"] in (self.ally_a.id, self.ally_b.id)]
        self.assertTrue(all(p["hp"] > 50 for p in healed))
        heal_events = [event for event in result.log[-1]["events"] if "치유" in event]
        self.assertEqual(len(heal_events), 2)
        # 여러 명을 치유하면 통합 회복값이 아니라 평균 회복값으로 주목도가 오른다.
        caster = next(p for p in result.participants if p["character_id"] == self.caster.id)
        self.assertEqual(caster["attn"], 100)

    def test_charge_restores_mana_to_each_target_and_excludes_caster(self):
        result = self._resolve(self.charge, [f"ally:{self.ally_a.id}", f"ally:{self.ally_b.id}"])

        by_id = {p["character_id"]: p for p in result.participants}
        self.assertEqual(by_id[self.ally_a.id]["mp"], 2)
        self.assertEqual(by_id[self.ally_b.id]["mp"], 2)
        # 시전자는 기술 비용만 소모하고 충전 대상이 되지 않는다.
        self.assertEqual(by_id[self.caster.id]["mp"], 9)

    def test_charge_rejects_caster_as_target(self):
        with self.assertRaises(HTTPException):
            self._resolve(self.charge, [f"ally:{self.caster.id}", f"ally:{self.ally_a.id}"])


if __name__ == "__main__":
    unittest.main()
