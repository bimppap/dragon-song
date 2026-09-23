"""장착한 동반자·장신구의 전투 패시브(전투 당 1회 부활, 전투 후 자동 부활, 기술 재발동)를 검증한다."""
import unittest

from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.models import BattleSession, Character, CharacterItemState, CharacterSkillUnlock, Item, Purchase, SkillNode
from app.schemas import BattleAllyTurnRequest, CharacterActionInput, EnemySkill, ItemCreate


class ItemBattlePassivesTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        crud.invalidate_active_battle_skills_cache()
        self.hero = Character(name="용사", faction="공격", hp=100, hp_max=100, mp=50, mp_max=50, atk=100, revive_hp=0.3)
        self.ally = Character(name="동료", faction="공격", hp=100, hp_max=100, mp=10, mp_max=10, atk=10)
        self.db.add_all([self.hero, self.ally])
        self.db.flush()

    def tearDown(self):
        crud.invalidate_active_battle_skills_cache()
        self.db.close()
        self.engine.dispose()

    def equip(self, character, name, effects, item_type="accessory"):
        item = Item(name=name, price_gold=1, special_merchant=True, item_type=item_type, effects=effects)
        self.db.add(item)
        self.db.flush()
        self.db.add_all([
            Purchase(character_id=character.id, item_id=item.id, quantity=1),
            CharacterItemState(character_id=character.id, item_id=item.id, used_quantity=0, equipped=True),
        ])
        self.db.commit()
        return item

    def learn(self, character, **kwargs):
        values = dict(book="용맹의 서", branch=1, col=0, tier=2, default_name="강타", var_name="ab_strike", cost=1,
                      power=2, target="1", target_side="ENEMY", trigger_type="즉발형", category="피해",
                      activation_order=8, is_public=True)
        values.update(kwargs)
        node = SkillNode(**values)
        self.db.add(node)
        self.db.flush()
        self.db.add(CharacterSkillUnlock(character_id=character.id, node_id=node.id))
        self.db.commit()
        return node

    def battle(self, mode="practice", **overrides):
        participants = [crud._snapshot_combatant(self.hero), crud._snapshot_combatant(self.ally)]
        values = dict(
            mode=mode, chapter="1장", status="in_progress", phase="ally", round=1,
            participants=participants,
            enemies=[{"enemy_id": 1, "name": "용", "hp": 50000, "max_hp": 50000, "attack": 0, "skills": [],
                      "status_effects": [], "joined_round": 0}],
            summons=[], log=[],
        )
        values.update(overrides)
        session = BattleSession(**values)
        self.db.add(session)
        self.db.commit()
        return session

    def cast(self, session, node, **kwargs):
        return crud.resolve_battle_ally_turn(self.db, session.id, BattleAllyTurnRequest(character_actions=[
            CharacterActionInput(character_id=self.hero.id, kind="skill", skill_node_id=node.id, **kwargs),
        ]))

    def test_recast_repeats_damage_with_item_ratio_right_after_skill(self):
        node = self.learn(self.hero)
        self.equip(self.hero, "메아리 반지", [{"stat": "skill_recast", "delta": 0.2}])
        result = self.cast(self.battle(), node, target_enemy_id=1)
        events = result.log[-1]["events"]
        self.assertEqual(result.enemies[0]["hp"], 50000 - 200 - 40)
        strike_index = events.index("✨ 용사의 강타 I → 용 200 피해 · [49800/50000] · MP -1 [49/50]")
        self.assertEqual(events[strike_index + 1:strike_index + 3], [
            "🔁 용사의 메아리 반지 → 강타 I 재발동 (20% 위력)",
            "　↳ 용 40 피해 [49760/50000]",
        ])

    def test_each_recast_item_applies_separately_based_on_original_result(self):
        node = self.learn(self.hero)
        self.equip(self.hero, "메아리 반지", [{"stat": "skill_recast", "delta": 0.2}])
        self.equip(self.hero, "메아리 정령", [{"stat": "skill_recast", "delta": 0.5}], item_type="companion")
        result = self.cast(self.battle(), node, target_enemy_id=1)
        self.assertEqual(result.enemies[0]["hp"], 50000 - 200 - 40 - 100)
        self.assertEqual(sum(event.startswith("🔁 용사의") for event in result.log[-1]["events"]), 2)

    def test_recast_scales_buff_amount(self):
        node = self.learn(self.hero, book="탐구의 서", branch=0, col=None, tier=1, default_name="격려", var_name="ab_encourage",
                          power=0.2, target="1", target_side="ALLY", category="강화", activation_order=2)
        self.equip(self.hero, "메아리 반지", [{"stat": "skill_recast", "delta": 0.2}])
        session = self.battle()
        result = crud.resolve_battle_ally_turn(self.db, session.id, BattleAllyTurnRequest(character_actions=[
            CharacterActionInput(character_id=self.hero.id, kind="skill", skill_node_id=node.id, target_character_id=self.ally.id),
            CharacterActionInput(character_id=self.ally.id, kind="attack", target_enemy_id=1),
        ]))
        events = result.log[-1]["events"]
        recast_index = events.index("🔁 용사의 메아리 반지 → 격려 재발동 (20% 위력)")
        self.assertEqual(events[recast_index + 1], "　↳ 동료 격려 +4%p")
        # 격려 피해 증폭 20% → 재발동으로 24%: 공격력 10 × 1.24 = 12
        self.assertIn("⚔️ 동료 공격: 12 피해 · 용 [49988/50000]", events)

    def test_no_recast_without_equipped_item(self):
        node = self.learn(self.hero)
        result = self.cast(self.battle(), node, target_enemy_id=1)
        self.assertEqual(result.enemies[0]["hp"], 49800)
        self.assertFalse(any(event.startswith("🔁") for event in result.log[-1]["events"]))

    def test_revive_once_per_battle(self):
        self.equip(self.hero, "불사조 깃털", [{"stat": "battle_revive_once", "delta": 0}])
        participant = crud._snapshot_combatant(self.hero)
        crud._ensure_combatant_snapshot_defaults(participant)
        crud._attach_battle_item_passives(self.db, [participant])
        participant["hp"] = 0
        self.assertTrue(crud._mark_combatant_downed(participant))
        self.assertEqual((participant["downed"], participant["hp"]), (False, 30))
        events: list[str] = []
        crud._flush_battle_revive_events([participant], events)
        self.assertEqual(events, ["✨ 용사의 불사조 깃털 발동 → 부활 [HP 30/100]"])
        participant["hp"] = 0
        crud._mark_combatant_downed(participant)
        self.assertEqual((participant["downed"], participant["hp"]), (True, 0))

    def test_revive_log_uses_the_custom_spirit_stone_name(self):
        item = self.equip(self.hero, "불꽃의 정령석", [{"stat": "battle_revive_once", "delta": 0}])
        state = self.db.query(CharacterItemState).filter_by(character_id=self.hero.id, item_id=item.id).one()
        state.custom_name = "화염"
        self.db.commit()
        participant = crud._snapshot_combatant(self.hero)
        crud._ensure_combatant_snapshot_defaults(participant)
        crud._attach_battle_item_passives(self.db, [participant])
        participant["hp"] = 0
        crud._mark_combatant_downed(participant)
        events: list[str] = []
        crud._flush_battle_revive_events([participant], events)
        self.assertEqual(events, ["✨ 용사의 화염 발동 → 부활 [HP 30/100]"])

    def test_revive_once_during_enemy_turn_logs_right_after_faint(self):
        self.equip(self.hero, "불사조 깃털", [{"stat": "battle_revive_once", "delta": 0}])
        skill = EnemySkill(skill_type="지정 공격", name="내리치기", target_count=1, damage_percent=100)
        session = self.battle(
            phase="enemy",
            pending_enemy_actions=[{"enemy_id": 1, "kind": "attack", "skill_index": 0, "target_character_ids": [self.hero.id]}],
        )
        session.enemies = [{**session.enemies[0], "attack": 500, "skills": [skill.model_dump()]}]
        self.db.commit()
        result = crud.resolve_battle_enemy_turn(self.db, session.id)
        hero = next(p for p in result.participants if p["character_id"] == self.hero.id)
        self.assertEqual((hero["downed"], hero["hp"], hero["revive_once_used"]), (False, 30, True))
        events = result.log[-1]["events"]
        faint_index = events.index("💫 용사 기절")
        self.assertEqual(events[faint_index + 1], "✨ 용사의 불사조 깃털 발동 → 부활 [HP 30/100]")
        self.assertEqual(result.status, "in_progress")

    def test_auto_revive_after_real_battle_ends(self):
        self.equip(self.hero, "귀환의 부적", [{"stat": "battle_auto_revive", "delta": 0}])
        session = self.battle(mode="real")
        session.participants = [{**p, "hp": 0, "downed": True} for p in session.participants]
        self.db.commit()
        result = crud.terminate_battle(self.db, session.id)
        self.db.refresh(self.hero)
        self.db.refresh(self.ally)
        self.assertEqual((self.hero.hp, self.ally.hp), (30, 0))
        self.assertIn("✨ 용사의 귀환의 부적 발동 → 전투 후 부활 [HP 30/100]", result.log[-1]["events"])

    def test_passive_effects_are_only_for_equipment(self):
        for effects in ([{"stat": "battle_revive_once", "delta": 0}], [{"stat": "skill_recast", "delta": 0.2}]):
            with self.assertRaises(ValidationError):
                ItemCreate(name="소모품", price_gold=1, effects=effects)
        with self.assertRaises(ValidationError):
            ItemCreate(name="반지", price_gold=1, special_merchant=True, item_type="accessory",
                       effects=[{"stat": "skill_recast", "delta": 0}])
        ItemCreate(name="반지", price_gold=1, special_merchant=True, item_type="accessory",
                   effects=[{"stat": "skill_recast", "delta": 0.2}, {"stat": "battle_auto_revive", "delta": 0}])


if __name__ == "__main__":
    unittest.main()
