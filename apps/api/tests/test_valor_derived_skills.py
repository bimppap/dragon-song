import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.game_data import build_skill_node_specs, dynamic_derived_description
from app.models import BattleSession, Character, CharacterSkillUnlock, SkillNode
from app.schemas import BattleAllyTurnRequest, BattleTelegraphRequest, CharacterActionInput


class ValorDerivedBattleTest(unittest.TestCase):
    """용맹의 서 파생 3종(주입·제압·살포)의 전투 동작."""

    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

        # 자애 3 + 지혜 4 = 7, 기술 효율 고정 10.
        self.caster = Character(
            name="주입자", faction="공격", hp=100, hp_max=100, mp=30, mp_max=30,
            atk=10, atk_p=0.0, stat_charity=3, stat_wisdom=4, skill_eff_true=10,
        )
        self.db.add(self.caster)
        self.db.flush()

        self.battle = BattleSession(
            mode="practice", chapter="1장", status="in_progress", phase="ally", round=1,
            participants=[crud._snapshot_combatant(self.caster)],
            enemies=[{
                "enemy_id": i, "name": f"적{i}", "hp": 1000, "max_hp": 1000, "attack": 0,
                "skills": [], "status_effects": [], "joined_round": 0,
            } for i in (1, 2)],
            summons=[], log=[],
        )
        self.db.add(self.battle)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def node(self, branch: int, name: str, var_name: str, **kwargs) -> SkillNode:
        node = SkillNode(
            book="용맹의 서", branch=branch, col=1, tier=2, default_name=name,
            var_name=var_name, cost=0, power=0, is_public=True, **kwargs,
        )
        self.db.add(node)
        self.db.flush()
        self.db.add(CharacterSkillUnlock(character_id=self.caster.id, node_id=node.id))
        self.db.commit()
        return node

    def cast(self, node: SkillNode, **action_kwargs):
        self.battle.phase = "ally"
        self.db.commit()
        return crud.resolve_battle_ally_turn(self.db, self.battle.id, BattleAllyTurnRequest(
            character_actions=[CharacterActionInput(
                character_id=self.caster.id, kind="skill", skill_node_id=node.id, **action_kwargs,
            )],
        ))

    def me(self, result):
        return next(p for p in result.participants if p["character_id"] == self.caster.id)

    # ── 주입 ────────────────────────────────────────────────
    def test_enchant_damages_enemy_and_stacks_attack(self):
        node = self.node(
            0, "주입", "ab_enchant", trigger_type="즉발형", category="복합",
            stackable=True, target="1", target_side="ENEMY", activation_order=1,
        )
        result = self.cast(node, target_enemy_id=1)
        # 피해 = (자애 3 + 지혜 4) × 2 + 기술 효율 고정 10 = 24
        self.assertEqual(result.enemies[0]["hp"], 976)
        # 공격력 버프 = 7 × 2 + 10/2 = 19 → 10 + 19 = 29
        self.assertEqual(self.me(result)["atk"], 29)
        buff_event = next(e for e in result.log[-1]["events"] if "공격력 +19" in e)
        self.assertIn("기술 효율 고정 10 / 2", result.log[-1]["calculations"][buff_event])

    def test_enchant_attack_buff_stacks(self):
        node = self.node(
            0, "주입", "ab_enchant", trigger_type="즉발형", category="복합",
            stackable=True, target="1", target_side="ENEMY", activation_order=1,
        )
        self.cast(node, target_enemy_id=1)
        result = self.cast(node, target_enemy_id=1)
        self.assertEqual(self.me(result)["atk"], 10 + 19 + 19)
        stacks = [
            e for e in self.me(result)["status_effects"]
            if e.get("var_name") == "ab_enchant" and e.get("stat") == "atk"
        ]
        self.assertEqual(len(stacks), 2)

    def test_enchant_does_not_scale_with_depth(self):
        """주입은 고정 2배라 depth가 깊어져도 배율이 그대로다."""
        deep = dynamic_derived_description("ab_enchant", 5)
        self.assertIn("× 2", deep)
        self.assertEqual(deep, dynamic_derived_description("ab_enchant", 2))

    # ── 제압 ────────────────────────────────────────────────
    def test_suppressing_hits_all_enemies(self):
        node = self.node(
            1, "제압", "ab_suppressing", trigger_type="즉발형", category="피해",
            stackable=False, target_side="ENEMY", activation_order=4,
        )
        result = self.cast(node)
        # 피해 = 스킬레벨 2 × 5 + 기술 효율 고정 10 = 20 (모든 에너미)
        self.assertEqual([enemy["hp"] for enemy in result.enemies], [980, 980])

    def test_suppressing_passive_attack_applies_without_casting(self):
        """보유만으로 공격력이 오른다: 기술을 쓰지 않고 무반응해도 적용된다."""
        self.node(
            1, "제압", "ab_suppressing", trigger_type="즉발형", category="피해",
            stackable=False, target_side="ENEMY", activation_order=4,
        )
        self.battle.phase = "ally"
        self.db.commit()
        result = crud.resolve_battle_ally_turn(self.db, self.battle.id, BattleAllyTurnRequest(
            character_actions=[CharacterActionInput(character_id=self.caster.id, kind="none")],
        ))
        # 상시 공격력 = 스킬레벨 2 × 2 + 기술 효율 고정 10 = 14 → 10 + 14 = 24
        self.assertEqual(self.me(result)["atk"], 24)

    def test_suppressing_passive_is_not_applied_twice(self):
        node = self.node(
            1, "제압", "ab_suppressing", trigger_type="즉발형", category="피해",
            stackable=False, target_side="ENEMY", activation_order=4,
        )
        self.cast(node)
        result = self.cast(node)
        self.assertEqual(self.me(result)["atk"], 24)
        passives = [
            e for e in self.me(result)["status_effects"] if e.get("var_name") == "ab_suppressing"
        ]
        self.assertEqual(len(passives), 1)

    def test_suppressing_passive_refreshes_when_efficiency_changes(self):
        """기술 효율(고정)이 바뀌면 상시 공격력도 이전 값을 되돌리고 새 값으로 갱신된다."""
        import copy

        self.node(
            1, "제압", "ab_suppressing", trigger_type="즉발형", category="피해",
            stackable=False, target_side="ENEMY", activation_order=4,
        )
        self.battle.phase = "ally"
        self.db.commit()
        crud.resolve_battle_ally_turn(self.db, self.battle.id, BattleAllyTurnRequest(
            character_actions=[CharacterActionInput(character_id=self.caster.id, kind="none")],
        ))

        party = copy.deepcopy(self.battle.participants)
        party[0]["skill_eff_true"] = 20
        self.battle.participants = party
        self.battle.phase = "ally"
        self.db.commit()
        result = crud.resolve_battle_ally_turn(self.db, self.battle.id, BattleAllyTurnRequest(
            character_actions=[CharacterActionInput(character_id=self.caster.id, kind="none")],
        ))
        # 상시 공격력 = 2 × 2 + 20 = 24 → 기본 10 + 24 = 34 (이전 14는 되돌려짐)
        self.assertEqual(self.me(result)["atk"], 34)
        passives = [
            e for e in self.me(result)["status_effects"] if e.get("var_name") == "ab_suppressing"
        ]
        self.assertEqual(len(passives), 1)
        self.assertEqual(passives[0]["applied_delta"], 24)

    # ── 살포 ────────────────────────────────────────────────
    def test_sparge_damages_all_targets_on_telegraph(self):
        node = self.node(
            2, "살포", "ab_sparge", trigger_type="지속형", category="강화",
            stackable=True, target="SELF", target_side="ALLY", activation_order=2,
        )
        self.cast(node)
        self.battle.summons = [{
            "id": 1, "name": "하수인", "hp": 50, "max_hp": 50, "attack": 0,
            "action_type": "attack", "trigger_phase": "enemy", "spawn_round": 0,
        }]
        self.battle.phase = "telegraph"
        self.db.commit()
        result = crud.resolve_battle_telegraph(self.db, self.battle.id, BattleTelegraphRequest(
            enemy_actions=[{"enemy_id": 1, "kind": "none"}, {"enemy_id": 2, "kind": "none"}],
        ))
        # 스택당 피해 = 스킬레벨 2 × 6 + 기술 효율 고정 10 = 22 (에너미 + 하수인 전부)
        self.assertEqual([enemy["hp"] for enemy in result.enemies], [978, 978])
        self.assertEqual(result.summons[0]["hp"], 28)

    def test_sparge_stacks_add_up(self):
        node = self.node(
            2, "살포", "ab_sparge", trigger_type="지속형", category="강화",
            stackable=True, target="SELF", target_side="ALLY", activation_order=2,
        )
        self.cast(node)
        self.cast(node)
        self.battle.phase = "telegraph"
        self.db.commit()
        result = crud.resolve_battle_telegraph(self.db, self.battle.id, BattleTelegraphRequest(
            enemy_actions=[{"enemy_id": 1, "kind": "none"}, {"enemy_id": 2, "kind": "none"}],
        ))
        # 2중첩 → 44
        self.assertEqual([enemy["hp"] for enemy in result.enemies], [956, 956])


class ValorDerivedSpecTest(unittest.TestCase):
    def _spec(self, branch: int, tier: int) -> dict:
        return next(
            spec for spec in build_skill_node_specs("용맹의 서")
            if spec.get("branch") == branch and spec.get("col") == 1 and spec.get("tier") == tier
        )

    def test_var_names_and_names(self):
        self.assertEqual((self._spec(0, 2)["default_name"], self._spec(0, 2)["var_name"]), ("주입", "ab_enchant"))
        self.assertEqual((self._spec(1, 2)["default_name"], self._spec(1, 2)["var_name"]), ("제압", "ab_suppressing"))
        self.assertEqual((self._spec(2, 2)["default_name"], self._spec(2, 2)["var_name"]), ("살포", "ab_sparge"))

    def test_depth_scaling_descriptions(self):
        # 제압: 스킬레벨×5 피해 / 스킬레벨×2 상시 공격력
        self.assertIn("10 + 기술 효율(고정)만큼 피해", dynamic_derived_description("ab_suppressing", 2))
        self.assertIn("4 + 기술 효율(고정)만큼 상시", dynamic_derived_description("ab_suppressing", 2))
        self.assertIn("25 + 기술 효율(고정)만큼 피해", dynamic_derived_description("ab_suppressing", 5))
        # 살포: 스킬레벨×6
        self.assertIn("12 + 기술 효율(고정)", dynamic_derived_description("ab_sparge", 2))
        self.assertIn("30 + 기술 효율(고정)", dynamic_derived_description("ab_sparge", 5))


if __name__ == "__main__":
    unittest.main()
