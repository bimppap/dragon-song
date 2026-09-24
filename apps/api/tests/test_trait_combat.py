import copy
import unittest

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app import crud, trait_effects as effects
from app.db import Base
from app.migrations import ensure_schema
from app.models import BattleSession, Character, CharacterSkillUnlock, SkillNode, Trait
from app.schemas import BattleAllyTurnRequest, CharacterActionInput, TraitCreate


class TraitCombatTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.actor = Character(name="특성 실험", faction="치유", hp=100, hp_max=100, mp=10, mp_max=10,
                               atk=10, lv=3, skill_eff_true=2, skill_eff_fixed=0.1)
        self.ally = Character(name="아군", faction="공격", hp=40, hp_max=100)
        self.db.add_all([self.actor, self.ally])
        self.db.flush()
        self.skill = SkillNode(book="용맹의 서", branch=0, col=None, tier=1, default_name="강타 I",
                               trigger_type="즉발형", category="피해", stackable=False, var_name="ab_strike",
                               cost=2, power=1, target="1", target_side="ENEMY", activation_order=6, is_public=True)
        self.db.add(self.skill)
        self.db.flush()
        self.db.add(CharacterSkillUnlock(character_id=self.actor.id, node_id=self.skill.id))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()
        crud.invalidate_active_battle_skills_cache()

    def equip(self, kind, **values):
        rules = effects.default_rules(kind)
        rules["values"].update(values)
        trait = crud.create_trait(self.db, TraitCreate(name=effects.CATALOG[kind][0], rules=rules))
        crud.equip_trait(self.db, self.actor.id, trait.id)
        return trait

    def battle(self, enemy_count=1):
        enemies = [dict(enemy_id=i + 1, name=f"적{i}", hp=1000, max_hp=1000, attack=100,
                        skills=[], status_effects=[], joined_round=0) for i in range(enemy_count)]
        participants = [crud._snapshot_combatant(c) for c in (self.actor, self.ally)]
        crud._sync_battle_traits(self.db, participants, enemies, [], initial=True)
        battle = BattleSession(mode="practice", chapter="1장", status="in_progress", phase="ally", round=1,
                               participants=participants, enemies=enemies, summons=[], log=[])
        self.db.add(battle)
        self.db.commit()
        return battle

    def act(self, battle, kind="skill", **kwargs):
        battle.phase = "ally"
        self.db.commit()
        return crud.resolve_battle_ally_turn(self.db, battle.id, BattleAllyTurnRequest(character_actions=[
            CharacterActionInput(character_id=self.actor.id, kind=kind, skill_node_id=self.skill.id, **kwargs)]))

    def test_all_templates_validate_and_render_from_values(self):
        for kind in effects.CATALOG:
            with self.subTest(kind=kind):
                rules = effects.default_rules(kind)
                self.assertEqual(TraitCreate(name=kind, rules=rules).rules, rules)
                self.assertNotIn("{", effects.describe(rules))
        for rules in ({"kind": [], "values": {}}, {"kind": "standard", "values": {"flat": float("nan")}},
                      {"kind": "standard", "values": {"flat": 1.5}}, {"kind": "standard", "values": {"flat": True}}):
            with self.assertRaises(ValidationError):
                TraitCreate(name="잘못된 입력", rules=rules)

    def test_edit_live_value_rename_and_unequip_never_accumulate(self):
        trait = self.equip("standard")
        battle = self.battle()
        self.assertEqual(battle.participants[0]["skill_eff_true"], 10)
        rules = effects.default_rules("standard")
        rules["values"]["flat"] = 20
        crud.update_trait(self.db, trait.id, TraitCreate(name="이름도 변경", rules=rules))
        for _ in range(3):
            view = crud._to_battle_session_read(self.db, battle)
            self.assertEqual(view.participants[0]["skill_eff_true"], 22)
        result = self.act(battle)
        self.assertEqual(result.participants[0]["skill_eff_true"], 22)
        self.assertEqual(self.actor.skill_eff_true, 2)
        crud.equip_trait(self.db, self.actor.id, None)
        self.assertEqual(crud._to_battle_session_read(self.db, battle).participants[0]["skill_eff_true"], 2)

    def test_one_slot_delete_and_live_battle_equip_lock(self):
        first = self.equip("standard")
        second = self.equip("heavy")
        self.assertEqual(self.actor.trait_id, second.id)
        battle = self.battle()
        battle.mode = "real"
        self.db.commit()
        with self.assertRaises(HTTPException):
            crud.equip_trait(self.db, self.actor.id, first.id)
        crud.delete_trait(self.db, second.id)
        self.assertIsNone(self.db.get(Character, self.actor.id).trait_id)

    def test_meditation_replaces_attack_and_buff_values_follow_edits(self):
        trait = self.equip("meditation")
        battle = self.battle()
        result = self.act(battle, "attack")
        actor = result.participants[0]
        self.assertEqual(result.enemies[0]["hp"], 1000)
        self.assertEqual((actor["max_mp"], actor["mp"], actor["hp_regen_true"]), (11, 11, 2))
        rules = effects.default_rules("meditation")
        rules["values"]["regen"] = 5
        crud.update_trait(self.db, trait.id, TraitCreate(name=trait.name, rules=rules))
        self.assertEqual(crud._to_battle_session_read(self.db, battle).participants[0]["hp_regen_true"], 5)
        self.assertEqual(self.act(battle, "attack").participants[0]["hp_regen_true"], 10)

    def test_technique_only_successful_casts_gain_stacks(self):
        self.equip("technique")
        battle = self.battle()
        result = self.act(battle)
        self.assertAlmostEqual(result.participants[0]["skill_eff_fixed"], .25)
        self.assertEqual(result.participants[0]["skill_eff_true"], 8)
        snapshots = copy.deepcopy(battle.round_snapshots)
        self.assertEqual(snapshots[0]["participants"][0]["status_effects"], [])
        battle.participants = [{**battle.participants[0], "mp": 0}, battle.participants[1]]
        result = self.act(battle)
        self.assertEqual(result.participants[0]["skill_eff_true"], 8)

    def test_distribution_cost_targets_and_efficiency(self):
        self.equip("distribution")
        battle = self.battle(2)
        available = crud.get_battle_active_skills(self.db, battle.id)["skills_by_character"][self.actor.id]
        self.assertEqual(available[0]["target"], "2")
        result = self.act(battle, skill_target_keys=["enemy:1", "enemy:2"])
        self.assertEqual(result.participants[0]["mp"], 7)
        self.assertTrue(all(e["hp"] < 1000 for e in result.enemies))
        self.assertAlmostEqual(result.participants[0]["skill_eff_fixed"], -.1)

    def test_distribution_and_charge_clone_skills_exclude_each_other(self):
        charge = SkillNode(book="탐구의 서", branch=2, col=0, tier=1, default_name="충전",
                           trigger_type="즉발형", category="회복", stackable=False, var_name="ab_charge",
                           cost=4, power=2, target="1", target_side="ALLY", activation_order=1, is_public=True)
        self.db.add(charge)
        self.db.commit()
        # 충전을 습득한 뒤에는 분배를 장착할 수 없다.
        self.db.add(CharacterSkillUnlock(character_id=self.actor.id, node_id=charge.id))
        self.db.commit()
        rules = effects.default_rules("distribution")
        trait = crud.create_trait(self.db, TraitCreate(name="분배", rules=rules))
        with self.assertRaises(HTTPException) as blocked:
            crud.equip_trait(self.db, self.actor.id, trait.id)
        self.assertIn("충전", blocked.exception.detail)
        # 다른 특성은 그대로 장착되고, 분배를 장착한 캐릭터는 충전을 습득할 수 없다.
        self.equip("standard")
        self.db.query(CharacterSkillUnlock).delete()
        self.actor.sp = 99
        self.db.commit()
        crud.equip_trait(self.db, self.actor.id, trait.id)
        with self.assertRaises(HTTPException) as blocked:
            crud.unlock_character_skill_node(self.db, self.actor.id, charge.id)
        self.assertIn("충전", blocked.exception.detail)

    def test_offense_defense_hit_consumes_only_hit_buffs(self):
        self.equip("offense_defense")
        battle = self.battle()
        self.act(battle, "defend")
        result = self.act(battle, "attack")
        actor = result.participants[0]
        self.assertAlmostEqual(actor["dmg_r"], .3)
        crud._apply_hit(actor, 5)
        self.assertAlmostEqual(actor["dmg_r"], 0)
        self.assertAlmostEqual(actor["atk_p"], .1)

    def test_prepared_guard_cancels_three_debuff_stacks_one_for_one(self):
        self.equip("prepared")
        actor = self.battle().participants[0]
        self.assertAlmostEqual(actor["skill_eff_fixed"], .35)
        applied = crud._add_status_effect(actor, dict(effect_type="ongoing_damage", affinity="debuff",
            skill_name="출혈", stacks=3, damage=7, stackable=True), participants=[actor], enemies=[])
        self.assertTrue(applied)
        self.assertEqual([(e["skill_name"], e.get("stacks")) for e in actor["status_effects"]], [("출혈", 1)])
        actor["hp"] = 99
        effects.sync(actor)
        self.assertAlmostEqual(actor["skill_eff_fixed"], .1)
        effects.start(actor)
        self.assertFalse(any(e["effect_type"] == "purification_guard" for e in actor["status_effects"]))

    def test_guard_handles_separate_stacks_and_environment(self):
        self.equip("prepared")
        actor = self.battle().participants[0]
        applied = [crud._add_combat_stat_stack(actor, source="bleed", name="출혈", stat="atk", amount=1,
                   percent=False, stackable=True) for _ in range(3)]
        self.assertEqual(applied, [False, False, True])
        self.assertEqual(actor["atk"], 9)
        actor["status_effects"] = [{"effect_type": "purification_guard", "stacks": 2}]
        self.assertEqual(crud._apply_environment_stack_delta(actor, environment_id=1, stack_delta=3,
                                                            stackable=True, max_stacks=0), (0, 1))

    def test_hero_live_enemy_count_and_cap(self):
        self.equip("hero")
        battle = self.battle(12)
        actor = battle.participants[0]
        self.assertEqual(actor["skill_eff_true"], 12)
        self.assertAlmostEqual(actor["atk_p"], .5)
        effects.sync(actor, [{"hp": 1}, {"hp": 0}])
        self.assertEqual(actor["skill_eff_true"], 3)
        self.assertAlmostEqual(actor["atk_p"], .05)

    def test_blood_hp_cost_zero_mana_and_insufficient_hp(self):
        self.equip("blood")
        battle = self.battle()
        self.assertEqual(battle.participants[0]["mp"], 0)
        result = self.act(battle)
        self.assertEqual((result.participants[0]["hp"], result.participants[0]["mp"]), (80, 0))
        battle.participants = [{**battle.participants[0], "hp": 20, "mp": 3}, battle.participants[1]]
        result = self.act(battle)
        self.assertEqual(result.participants[0]["hp"], 20)
        self.assertAlmostEqual(result.participants[0]["skill_eff_fixed"], .25)
        self.assertIn("HP 부족", " ".join(result.log[-1]["events"]))

    def test_opportunist_counts_status_stacks(self):
        self.equip("opportunist")
        actor = self.battle().participants[0]
        actor["status_effects"] = [{"affinity": "buff", "stacks": 2}, {"affinity": "debuff", "stacks": 1}]
        effects.sync(actor)
        self.assertAlmostEqual(actor["skill_eff_fixed"], .25)
        actor["status_effects"] = []
        effects.sync(actor)
        self.assertAlmostEqual(actor["skill_eff_fixed"], .1)

    def test_preparation_start_shield_never_regranted(self):
        self.equip("preparation")
        actor = self.battle().participants[0]
        self.assertEqual(actor["shield"], 10)
        self.assertAlmostEqual(actor["presence"], .2)
        crud._apply_hit(actor, 10)
        effects.start(actor)
        self.assertEqual(actor["shield"], 0)
        self.assertAlmostEqual(actor["presence"], 0)

    def test_onslaught_prohibits_defend_and_item(self):
        self.equip("onslaught")
        battle = self.battle()
        self.assertAlmostEqual(battle.participants[0]["atk_p"], .4)
        for kind in ("defend", "item"):
            with self.assertRaises(HTTPException):
                self.act(battle, kind)

    def test_peace_heal_and_protect_restore_mana_at_zero(self):
        self.equip("peace")
        self.actor.mp = 0
        self.db.commit()
        battle = self.battle()
        result = self.act(battle, "heal", target_character_id=self.ally.id)
        self.assertEqual(result.participants[0]["mp"], 1)
        self.assertEqual(result.participants[1]["hp"], 65)
        self.actor.faction = "수비"
        self.actor.mp = 0
        self.db.commit()
        battle = self.battle()
        result = self.act(battle, "defend", protect_target_character_id=self.ally.id)
        self.assertEqual(result.participants[0]["mp"], 1)
        self.assertEqual(result.participants[0]["protect_target"], self.ally.id)

    def test_optimization_and_heavy_costs(self):
        self.equip("optimization", cost=-100)
        result = self.act(self.battle())
        self.assertEqual(result.participants[0]["mp"], 10)
        self.equip("heavy")
        result = self.act(self.battle())
        self.assertEqual(result.participants[0]["mp"], 6)
        self.assertAlmostEqual(result.participants[0]["skill_eff_fixed"], .5)

    def test_undying_survives_damage_once_and_edit_does_not_reset_usage(self):
        self.equip("undying")
        actor = self.battle().participants[0]
        self.assertEqual(actor["hp_regen_true"], 3)
        crud._apply_hit(actor, 1000)
        self.assertEqual(actor["hp"], 1)
        self.assertFalse(crud._mark_combatant_downed(actor))
        actor["trait"]["rules"]["values"]["hp"] = 5
        effects.sync(actor)
        crud._apply_hit(actor, 1000)
        self.assertEqual(actor["hp"], 0)
        self.assertTrue(crud._mark_combatant_downed(actor))

    def test_migration_preserves_description_and_is_repeatable(self):
        self.db.close()
        with self.engine.begin() as conn:
            conn.execute(text("ALTER TABLE traits DROP COLUMN rules"))
            conn.execute(text("INSERT INTO traits (name, effect, description, created_at) VALUES ('만전', '원문', '설명 보존', CURRENT_TIMESTAMP)"))
        ensure_schema(self.engine)
        ensure_schema(self.engine)
        with Session(self.engine) as db:
            trait = db.query(Trait).one()
            self.assertEqual(trait.description, "설명 보존")
            self.assertEqual(trait.rules["values"]["guard"], 2)


if __name__ == "__main__":
    unittest.main()
