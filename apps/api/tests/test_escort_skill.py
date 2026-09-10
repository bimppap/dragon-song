import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.models import BattleSession, Character, CharacterSkillUnlock, SkillNode
from app.schemas import BattleAllyTurnRequest, CharacterActionInput


class EscortSkillTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

        # depth 2 → 피해 감소 = 2 × 5% + 기술 효율 비례 0.1 = 0.2 (스택당)
        self.caster = Character(
            name="경호원", faction="수비", hp=100, hp_max=100, mp=20, mp_max=20, skill_eff_fixed=0.1,
        )
        self.ally = Character(name="요인", faction="치유", hp=100, hp_max=100)
        self.ally2 = Character(name="요인2", faction="치유", hp=100, hp_max=100)
        self.db.add_all([self.caster, self.ally, self.ally2])
        self.db.flush()

        self.node = SkillNode(
            book="불굴의 서", branch=0, col=1, tier=2, default_name="경호",
            trigger_type="지속형", category="강화", stackable=True, var_name="ab_escort",
            cost=0, power=0.05, target="1", target_side="ALLY", activation_order=4, is_public=True,
        )
        self.db.add(self.node)
        self.db.flush()
        self.db.add(CharacterSkillUnlock(character_id=self.caster.id, node_id=self.node.id))

        self.battle = BattleSession(
            mode="practice", chapter="1장", status="in_progress", phase="ally", round=1,
            participants=[
                crud._snapshot_combatant(self.caster),
                crud._snapshot_combatant(self.ally),
                crud._snapshot_combatant(self.ally2),
            ],
            enemies=[{
                "enemy_id": 1, "name": "적1", "hp": 1000, "max_hp": 1000, "attack": 100,
                "skills": [{"name": "공격", "skill_type": "지정 공격", "target_count": 1, "damage_percent": 100}],
                "status_effects": [], "joined_round": 0,
            }],
            summons=[], log=[],
        )
        self.db.add(self.battle)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def cast(self, target_id=None):
        self.battle.phase = "ally"
        self.db.commit()
        return crud.resolve_battle_ally_turn(self.db, self.battle.id, BattleAllyTurnRequest(
            character_actions=[CharacterActionInput(
                character_id=self.caster.id, kind="skill",
                skill_node_id=self.node.id, target_character_id=target_id or self.ally.id,
            )],
        ))

    def hit(self, target_id=None):
        self.battle.phase = "enemy"
        self.battle.pending_enemy_actions = [{
            "enemy_id": 1, "kind": "attack", "skill_index": 0,
            "target_character_ids": [target_id or self.ally.id],
        }]
        self.db.commit()
        return crud.resolve_battle_enemy_turn(self.db, self.battle.id)

    def participant(self, result, character_id):
        return next(p for p in result.participants if p["character_id"] == character_id)

    def test_grants_guard_to_ally_and_reduction_to_self(self):
        result = self.cast()
        ally = self.participant(result, self.ally.id)
        caster = self.participant(result, self.caster.id)
        self.assertTrue(any(e.get("effect_type") == "escort_guard" for e in ally["status_effects"]))
        reductions = [e for e in caster["status_effects"] if e.get("effect_type") == "escort_damage_reduction"]
        self.assertEqual(len(reductions), 1)
        self.assertAlmostEqual(reductions[0]["value"], 0.2)

        event = next(e for e in result.log[-1]["events"] if "피해 감소 +20%" in e)
        self.assertIn("스킬레벨 2 × 기술 위력 0.05", result.log[-1]["calculations"][event])

    def test_escorted_ally_hit_is_redirected_and_reduced(self):
        self.cast()
        result = self.hit(self.ally.id)
        # 요인은 맞지 않고, 경호원이 대신 맞으며 피해 감소 20%가 적용된다.
        self.assertEqual(self.participant(result, self.ally.id)["hp"], 100)
        self.assertEqual(self.participant(result, self.caster.id)["hp"], 20)
        self.assertTrue(any("대신 방어" in e for e in result.log[-1]["events"]))

    def test_reduction_applies_without_defending(self):
        """경호 버프의 피해 감소는 방어 행동 여부와 무관하게 항상 적용된다."""
        self.cast()
        result = self.hit(self.caster.id)
        self.assertEqual(self.participant(result, self.caster.id)["hp"], 20)

    def test_self_reduction_caps_at_two_stacks(self):
        self.cast(self.ally.id)
        self.cast(self.ally2.id)
        result = self.cast(self.ally.id)
        caster = self.participant(result, self.caster.id)
        reductions = [e for e in caster["status_effects"] if e.get("effect_type") == "escort_damage_reduction"]
        self.assertEqual(len(reductions), 2)
        self.assertTrue(any("최대치" in e for e in result.log[-1]["events"]))

    def test_ally_keeps_single_guard_stack(self):
        self.cast(self.ally.id)
        result = self.cast(self.ally.id)
        ally = self.participant(result, self.ally.id)
        guards = [e for e in ally["status_effects"] if e.get("effect_type") == "escort_guard"]
        self.assertEqual(len(guards), 1)

    def test_two_stacks_stack_damage_reduction(self):
        self.cast(self.ally.id)
        self.cast(self.ally2.id)
        result = self.hit(self.ally.id)
        # 스택 2개 → 피해 감소 40% → floor(100 × 0.6) = 60
        self.assertEqual(self.participant(result, self.caster.id)["hp"], 40)

    def test_guard_persists_across_rounds(self):
        self.cast()
        first = self.hit(self.ally.id)
        self.assertEqual(self.participant(first, self.ally.id)["hp"], 100)
        # 다음 라운드에도 경호가 유지되어 여전히 경호원이 대신 맞는다.
        second = self.hit(self.ally.id)
        self.assertEqual(self.participant(second, self.ally.id)["hp"], 100)
        self.assertEqual(self.participant(second, self.caster.id)["hp"], 0)


class EscortSpecTest(unittest.TestCase):
    """경호 스펙과 depth별 설명."""

    def _spec(self, tier: int) -> dict:
        from app.game_data import build_skill_node_specs
        return next(
            spec for spec in build_skill_node_specs("불굴의 서")
            if spec.get("branch") == 0 and spec.get("col") == 1 and spec.get("tier") == tier
        )

    def test_escort_replaces_anvil_derived_path(self):
        for tier in range(2, 7):
            spec = self._spec(tier)
            self.assertEqual(spec["default_name"], "경호")
            self.assertEqual(spec["var_name"], "ab_escort")
            self.assertEqual(spec["power"], 0.05)
            self.assertEqual(spec["target_side"], "ALLY")

    def test_description_scales_with_depth(self):
        from app.game_data import dynamic_derived_description
        self.assertIn("10%", dynamic_derived_description("ab_escort", 2))
        self.assertIn("25%", dynamic_derived_description("ab_escort", 5))
        self.assertIn("최대 2스택", dynamic_derived_description("ab_escort", 2))

    def test_legacy_resolution_row_resolves_to_escort(self):
        """기존 DB에 '결의'로 시드된 행도 읽을 때 경호 스펙으로 해석된다."""
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        db = Session(engine)
        try:
            legacy = SkillNode(
                book="불굴의 서", branch=0, col=1, tier=2, default_name="결의",
                description="설명 준비 중입니다.", is_placeholder=True, is_public=True,
            )
            db.add(legacy)
            db.commit()
            self.assertEqual(crud._resolved_skill_node_value(legacy, "default_name"), "경호")
            self.assertEqual(crud._resolved_skill_node_value(legacy, "var_name"), "ab_escort")
            self.assertIn("경호 스택", crud._resolved_skill_node_value(legacy, "description"))
        finally:
            db.close()
            engine.dispose()


if __name__ == "__main__":
    unittest.main()
