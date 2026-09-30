import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.models import BattleSession, Character, CharacterSkillUnlock, SkillNode
from app.schemas import BattleAllyTurnRequest, CharacterActionInput, EnemySkill


def _debuff(name: str) -> dict:
    return {"effect_type": "ongoing_damage", "affinity": "debuff", "trigger_phase": "telegraph",
            "damage": 1, "skill_name": name, "stackable": True}


class Tier6SkillEffectTest(unittest.TestCase):
    """6단계 기술에만 붙는 추가 효과를 확인한다."""

    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.caster = Character(name="시전자", faction="수비", hp=50, hp_max=100, mp=5, mp_max=10,
                                atk=10, def_=5, skill_eff_true=10)
        self.ally = Character(name="아군", faction="공격", hp=50, hp_max=100, mp=2, mp_max=5, atk=10)
        self.db.add_all([self.caster, self.ally])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def unlock(self, character, book, branch, col, **fields):
        crud.get_skill_nodes(self.db, book)
        node = self.db.query(SkillNode).filter_by(book=book, branch=branch, col=col, tier=6).one()
        for key, value in fields.items():
            setattr(node, key, value)
        self.db.add(CharacterSkillUnlock(character_id=character.id, node_id=node.id))
        self.db.commit()
        return node

    def battle(self, *, caster=None, ally=None, enemy=None, summons=None, pending=None):
        participants = [crud._snapshot_combatant(self.caster), crud._snapshot_combatant(self.ally)]
        participants[0].update(caster or {})
        participants[1].update(ally or {})
        battle = BattleSession(
            mode="practice", chapter="1장", status="in_progress", phase="ally", round=1,
            participants=participants,
            enemies=[{"enemy_id": 1, "name": "적", "hp": 1000, "max_hp": 1000, "attack": 10,
                      "skills": [], "status_effects": [], "joined_round": 0, **(enemy or {})}],
            summons=summons or [], pending_enemy_actions=pending or [], log=[],
        )
        self.db.add(battle)
        self.db.commit()
        return battle

    def ally_turn(self, battle, *actions):
        return crud.resolve_battle_ally_turn(self.db, battle.id, BattleAllyTurnRequest(character_actions=list(actions)))

    def skill(self, node, character=None, **fields):
        return CharacterActionInput(character_id=(character or self.caster).id, kind="skill", skill_node_id=node.id, **fields)

    # ── 용맹의 서 ──
    def test_strike_normal_attack_adds_tier_bonus_and_restores_mana(self):
        self.unlock(self.caster, "용맹의 서", 0, 0)
        result = self.ally_turn(self.battle(), CharacterActionInput(character_id=self.caster.id, kind="attack"))
        # floor(10 + 6 × 0.2) = 11
        self.assertEqual(result.enemies[0]["hp"], 989)
        self.assertEqual(result.participants[0]["mp"], 6)

    def test_crushing_marks_enemy_and_acts_before_same_order_valor_skill(self):
        crushing = self.unlock(self.caster, "용맹의 서", 1, 0)
        strike = self.unlock(self.ally, "용맹의 서", 0, 0, activation_order=crushing.activation_order)
        result = self.ally_turn(
            self.battle(ally={"mp": 10}),
            self.skill(strike, self.ally, target_enemy_id=1),
            self.skill(crushing, target_enemy_id=1),
        )
        events = result.log[-1]["events"]
        crushing_index = next(i for i, e in enumerate(events) if e.startswith("🌊"))
        strike_index = next(i for i, e in enumerate(events) if e.startswith("✨"))
        self.assertLess(crushing_index, strike_index)
        self.assertIn("받는 피해 증가 0.05", result.log[-1]["calculations"][events[strike_index]])
        marks = [e for e in result.enemies[0]["status_effects"] if e["effect_type"] == "incoming_damage_bonus_round"]
        self.assertEqual([e["value"] for e in marks], [0.05])

    def test_suppressing_spills_minion_kill_damage_to_enemy(self):
        node = self.unlock(self.caster, "용맹의 서", 1, 1)
        battle = self.battle(summons=[{"id": 1, "name": "하수인", "hp": 5, "max_hp": 5, "attack": 1}])
        result = self.ally_turn(battle, self.skill(node))
        # 기술 피해(6단계 즉발 피해 0 + 기술 효율 고정 10) 10에, 하수인에게 입힌 5가 추가로 들어간다.
        self.assertEqual(result.enemies[0]["hp"], 1000 - 10 - 5)

    def test_sparge_tier6_bursts_double_damage_on_use(self):
        node = self.unlock(self.caster, "용맹의 서", 2, 1, settings_overrides={"power": 36})
        battle = self.battle(summons=[{"id": 1, "name": "하수인", "hp": 500, "max_hp": 500, "attack": 1}])
        result = self.ally_turn(battle, self.skill(node))
        # (36 + 기술 효율 고정 10) × 2 = 92, 에너미와 하수인 모두
        self.assertEqual(result.enemies[0]["hp"], 1000 - 92)
        self.assertEqual(result.summons[0]["hp"], 500 - 92)

    def test_harm_normal_attack_applies_ongoing_damage(self):
        self.unlock(self.caster, "용맹의 서", 2, 0)
        result = self.ally_turn(self.battle(), CharacterActionInput(character_id=self.caster.id, kind="attack"))
        dots = [e for e in result.enemies[0]["status_effects"] if e["effect_type"] == "ongoing_damage"]
        self.assertEqual([e["damage"] for e in dots], [10])

    # ── 불굴의 서 ──
    def test_anvil_overheals_and_shields_defenders(self):
        node = self.unlock(self.caster, "불굴의 서", 0, 0)
        result = self.ally_turn(self.battle(caster={"hp": 95}), self.skill(node))
        caster = result.participants[0]
        self.assertEqual(caster["hp"], 110)  # 95 + floor(100 × 0.15), 오버힐
        self.assertEqual(caster["shield"], 3)  # floor(15 × 0.25), 수비만
        self.assertEqual(result.participants[1]["shield"], 0)
        self.assertEqual(caster["attn"], 15 * 6 + 18)  # 회복 주목도 90 + floor(90 × 0.2)

    def test_escort_heals_caster_by_ten_percent(self):
        node = self.unlock(self.caster, "불굴의 서", 0, 1)
        result = self.ally_turn(self.battle(), self.skill(node, target_character_id=self.ally.id))
        caster = result.participants[0]
        # floor(100 × 0.1) = 10 회복 → 60, 이후 최대 체력 +30(100 × 0.3) → 90/130
        self.assertEqual((caster["hp"], caster["max_hp"]), (90, 130))

    def test_counter_passive_strikes_back_when_defending(self):
        self.unlock(self.caster, "불굴의 서", 1, 0)
        enemy_skill = EnemySkill(skill_type="지정 공격", name="내리치기", target_count=1, damage_percent=100)
        battle = self.battle(enemy={"skills": [enemy_skill.model_dump()]}, pending=[{
            "enemy_id": 1, "kind": "attack", "skill_index": 0, "target_character_ids": [self.caster.id],
        }])
        self.ally_turn(battle, CharacterActionInput(character_id=self.caster.id, kind="defend"))
        result = crud.resolve_battle_enemy_turn(self.db, battle.id)
        # (공격력 10 + 방어력 5) × 200% = 30, 마나 5 → 7
        self.assertEqual(result.enemies[0]["hp"], 970)
        self.assertEqual(result.participants[0]["mp"], 7)

    def test_counter_passive_restores_mana_once_after_all_hits(self):
        self.unlock(self.caster, "불굴의 서", 1, 0)
        enemy_skill = EnemySkill(skill_type="지정 공격", name="내리치기", target_count=1, damage_percent=100)
        action = {"enemy_id": 1, "kind": "attack", "skill_index": 0, "target_character_ids": [self.caster.id]}
        battle = self.battle(enemy={"skills": [enemy_skill.model_dump()], "action_count": 3},
                             pending=[dict(action) for _ in range(3)])
        self.ally_turn(battle, CharacterActionInput(character_id=self.caster.id, kind="defend"))
        result = crud.resolve_battle_enemy_turn(self.db, battle.id)
        # 세 번 맞아 세 번 반격하지만, 마나는 피격이 모두 끝난 뒤 한 번만 5 → 7
        self.assertEqual(result.enemies[0]["hp"], 1000 - 30 * 3)
        self.assertEqual(result.participants[0]["mp"], 7)
        events = result.log[-1]["events"]
        mana_index = next(i for i, e in enumerate(events) if e.startswith("💧"))
        last_counter_index = max(i for i, e in enumerate(events) if e.startswith("↩️"))
        self.assertGreater(mana_index, last_counter_index)

    def test_counter_passive_needs_defend_action(self):
        self.unlock(self.caster, "불굴의 서", 1, 0)
        enemy_skill = EnemySkill(skill_type="지정 공격", name="내리치기", target_count=1, damage_percent=100)
        battle = self.battle(enemy={"skills": [enemy_skill.model_dump()]}, pending=[{
            "enemy_id": 1, "kind": "attack", "skill_index": 0, "target_character_ids": [self.caster.id],
        }])
        self.ally_turn(battle)
        result = crud.resolve_battle_enemy_turn(self.db, battle.id)
        self.assertEqual(result.enemies[0]["hp"], 1000)

    def test_eruption_tier6_bursts_triple_reaction_damage_on_use(self):
        node = self.unlock(self.caster, "불굴의 서", 1, 1, settings_overrides={"power": 5})
        result = self.ally_turn(self.battle(), self.skill(node))
        # 사용 즉시 (반응 피해 5 + 기술 효율 고정 10) × 3 = 45
        self.assertEqual(result.enemies[0]["hp"], 1000 - 45)
        self.assertTrue(any("45 피해" in e for e in result.log[-1]["events"]))

    def test_eruption_reaction_is_not_tripled(self):
        enemies = [{"enemy_id": 1, "name": "적", "hp": 1000, "max_hp": 1000, "status_effects": [], "joined_round": 0}]
        recipient = {"name": "시전자", "skill_eff_true": 10, "attn": 0, "presence": 0, "faction": "수비", "status_effects": [
            {"reaction": "eruption", "damage": 5, "skill_lv": 6},
        ]}
        crud._apply_eruption_reaction(recipient, enemies, 1, [], {})
        self.assertEqual(enemies[0]["hp"], 1000 - 15)

    def test_protect_gives_caster_same_shield(self):
        node = self.unlock(self.caster, "불굴의 서", 2, 0)
        result = self.ally_turn(self.battle(), self.skill(node, target_character_id=self.ally.id))
        # floor(시전자 최대 체력 100 × 0.05) = 5
        self.assertEqual([p["shield"] for p in result.participants], [5, 5])

    def test_veil_adds_full_flat_efficiency(self):
        node = self.unlock(self.caster, "불굴의 서", 2, 1, powers={"shield": 6})
        result = self.ally_turn(self.battle(caster={"hp": 100}), self.skill(node))
        self.assertEqual(result.participants[1]["shield"], 16)  # 6 + 기술 효율 고정 10

    # ── 헌신의 서 ──
    def test_cure_overheals_and_cleanses_two_oldest_debuffs(self):
        node = self.unlock(self.caster, "헌신의 서", 0, 0)
        battle = self.battle(ally={"hp": 95, "status_effects": [_debuff("첫째"), _debuff("둘째"), _debuff("셋째")]})
        result = self.ally_turn(battle, self.skill(node, target_character_id=self.ally.id))
        ally = result.participants[1]
        self.assertGreater(ally["hp"], 100)
        self.assertEqual([e["skill_name"] for e in ally["status_effects"]], ["셋째"])

    def test_regeneration_raises_max_hp_without_stacking(self):
        node = self.unlock(self.caster, "헌신의 서", 0, 1)
        result = self.ally_turn(self.battle(), self.skill(node, target_character_id=self.ally.id))
        ally = result.participants[1]
        self.assertEqual((ally["hp"], ally["max_hp"]), (55, 105))  # 기술 효율 고정 10 / 2
        crud._set_single_stat_stack(ally, {"var_name": "ab_regeneration_max_hp"}, stat="max_hp", pool="hp", amount=5)
        self.assertEqual((ally["hp"], ally["max_hp"]), (55, 105))

    def test_aid_grants_round_damage_bonus(self):
        node = self.unlock(self.caster, "헌신의 서", 1, 0)
        result = self.ally_turn(self.battle(), self.skill(node))
        self.assertTrue(any("이번 라운드 피해 증폭 +10%" in e for e in result.log[-1]["events"]))

    def test_halo_cleanses_one_debuff_from_each_ally(self):
        node = self.unlock(self.caster, "헌신의 서", 1, 1)
        battle = self.battle(ally={"status_effects": [_debuff("첫째"), _debuff("둘째")]})
        result = self.ally_turn(battle, self.skill(node))
        self.assertEqual([e["skill_name"] for e in result.participants[1]["status_effects"]], ["둘째"])

    def test_purification_offset_stack_amplifies_four_percent(self):
        node = self.unlock(self.caster, "헌신의 서", 2, 0)
        battle = self.battle(ally={"status_effects": [_debuff("첫째")]})
        result = self.ally_turn(battle, self.skill(node, target_character_id=self.ally.id))
        guards = [e for e in result.participants[1]["status_effects"] if e["effect_type"] == "purification_guard"]
        self.assertEqual([(g["stacks"], g["damage_bonus_per_stack"]) for g in guards], [(1, 0.04)])

    def test_hex_heal_overheals(self):
        node = self.unlock(self.caster, "헌신의 서", 2, 1)
        result = self.ally_turn(self.battle(ally={"hp": 100}), self.skill(node, target_character_id=self.ally.id))
        self.assertGreater(result.participants[1]["hp"], 100)

    # ── 탐구의 서 ──
    def test_encourage_adds_round_attack_amplification(self):
        node = self.unlock(self.caster, "탐구의 서", 0, 0)
        result = self.ally_turn(
            self.battle(),
            self.skill(node, target_character_id=self.ally.id),
            CharacterActionInput(character_id=self.ally.id, kind="attack"),
        )
        # floor(공격력 10 × (1 + 0.2) × (1 + 피해 증폭 0.2)) = 14
        self.assertEqual(result.enemies[0]["hp"], 986)
        self.assertEqual(result.participants[1]["atk_p"], 0)  # 라운드가 끝나면 해제

    def test_curse_lowers_enemy_attack_for_the_round(self):
        node = self.unlock(self.caster, "탐구의 서", 1, 0)
        battle = self.battle()
        result = self.ally_turn(battle, self.skill(node, target_enemy_id=1))
        self.assertEqual(result.enemies[0]["attack"], 5)
        result = crud.resolve_battle_enemy_turn(self.db, battle.id)
        self.assertEqual(result.enemies[0]["attack"], 10)

    def test_improve_tier6_reduces_target_skill_cost_by_one(self):
        improve = self.unlock(self.caster, "탐구의 서", 0, 1)
        strike = self.unlock(self.ally, "용맹의 서", 0, 0, cost=3, activation_order=improve.activation_order + 1)
        result = self.ally_turn(
            self.battle(caster={"mp": 10}, ally={"mp": 2}),
            self.skill(improve, target_character_id=self.ally.id),
            self.skill(strike, self.ally, target_enemy_id=1),
        )
        # 강타 비용 3에서 1 줄어든 2를 낸다(마나 2로도 쓸 수 있다).
        self.assertEqual(result.participants[1]["mp"], 0)
        self.assertTrue(any(e.startswith("✨ 아군의") for e in result.log[-1]["events"]))
        self.assertTrue(any("기술 비용 -1" in e for e in result.log[-1]["events"]))

    def test_improve_tier6_cost_reduction_never_goes_below_zero(self):
        target = {"skill_cost": 0, "status_effects": [
            {"effect_type": "skill_eff_bonus_round", "cost_reduction": 1},
            {"effect_type": "skill_eff_bonus_round", "cost_reduction": 1},
        ]}
        self.assertEqual(crud._battle_skill_cost(target, {"cost": 0}), 0)
        self.assertEqual(crud._battle_skill_cost(target, {"cost": 3}), 2)

    def test_charge_raises_max_mana_once(self):
        node = self.unlock(self.caster, "탐구의 서", 2, 0)
        result = self.ally_turn(self.battle(), self.skill(node, target_character_id=self.ally.id))
        ally = result.participants[1]
        self.assertEqual(ally["max_mp"], 6)
        self.assertTrue(any("아군 최대 MP +1" in e for e in result.log[-1]["events"]))
        crud._set_single_stat_stack(ally, {"var_name": "ab_charge_max_mp"}, stat="max_mp", pool="mp", amount=1)
        self.assertEqual(ally["max_mp"], 6)

    # ── 공통 ──
    def test_overhealed_target_is_not_healed_or_trimmed_without_overheal_skill(self):
        target = {"hp": 110, "max_hp": 100, "downed": False}
        healed, _revived = crud._apply_skill_heal({}, target, 20, grant_attention=False)
        self.assertEqual((healed, target["hp"]), (0, 110))


if __name__ == "__main__":
    unittest.main()
