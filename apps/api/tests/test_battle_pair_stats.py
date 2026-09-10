"""페어의 전투 능력치/기술만 빌리고 아이템 및 최종 HP는 본인 기준인지 검증한다."""

import unittest
from types import SimpleNamespace

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.models import BattleSession, Character, CharacterItemState, CharacterSkillUnlock, Enemy, Item, ItemUsage, Purchase, SkillNode
from app.schemas import BattleAllyTurnRequest, BattleJoinRequest, BattlePairsRequest, BattleStartRequest, BattleTelegraphRequest, CharacterActionInput


class BattlePairStatsTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        crud.invalidate_active_battle_skills_cache()
        self.moa = Character(name="뫄", faction="공격", hp=100, hp_max=200, hp_max_p=0.5,
                             mp=40, mp_max=50, atk=10, def_=5, stat_courage=11, stat_endurance=12,
                             stat_charity=13, stat_wisdom=14, sh=10, start_sh=5, lv=2,
                             image_url="https://example.com/moa.png")
        self.soa = Character(name="솨", faction="수비", hp=400, hp_max=800, hp_max_p=0.25,
                             mp=100, mp_max=120, atk=100, def_=80, stat_courage=21, stat_endurance=22,
                             stat_charity=23, stat_wisdom=24, sh=30, start_sh=20, lv=5,
                             heal_eff=0.4, dmg_r=0.5, presence=0.2, revive_hp=0.2, act_time=2,
                             image_url="https://example.com/soa.png")
        self.third = Character(name="세번째", faction="치유", hp=150, hp_max=500, mp=20, mp_max=200, atk=30)
        self.enemy = Enemy(name="용", base_hp=50000, attack=10, skills=[])
        self.db.add_all([self.moa, self.soa, self.third, self.enemy])
        self.db.commit()
        self.admin = SimpleNamespace(id=None, role="ADMIN")

    def tearDown(self):
        crud.invalidate_active_battle_skills_cache()
        self.db.close()
        self.engine.dispose()

    def start(self, *, mode="real", third=False, paired=True):
        ids = [self.moa.id, self.soa.id] + ([self.third.id] if third else [])
        return crud.start_battle(self.db, self.admin, BattleStartRequest(
            mode=mode, enemy_ids=[self.enemy.id], character_ids=ids, pair_battle=paired,
            pairs=([ids[:2], *([ids[2:]] if third else [])]) if paired else None,
        ))

    def participant(self, result, character):
        return next(p for p in result.participants if p["character_id"] == character.id)

    def change_state(self, session_id, **changes):
        session = self.db.get(BattleSession, session_id)
        session.participants = [{**p, **changes} if p["character_id"] == self.moa.id else p for p in session.participants]
        self.db.commit()
        return session

    def test_all_combat_stats_swap_but_identity_and_original_character_do_not(self):
        moa_original = crud._snapshot_combatant(self.moa)
        soa_original = crud._snapshot_combatant(self.soa)
        result = self.start()
        for character, donor, expected in [(self.moa, self.soa, soa_original), (self.soa, self.moa, moa_original)]:
            participant = self.participant(result, character)
            for key in crud._PAIR_STAT_FIELDS:
                self.assertEqual(participant[key], expected[key], key)
            self.assertEqual(participant["name"], character.name)
            self.assertEqual(participant["image_url"], character.image_url)
            self.assertEqual(participant["pair_source_character_id"], donor.id)
            self.assertFalse(any(key.startswith("_pair_") for key in participant))
        self.db.expire_all()
        self.assertEqual(crud._snapshot_combatant(self.moa), moa_original)
        self.assertEqual(crud._snapshot_combatant(self.soa), soa_original)
        reloaded = crud.get_battle_session(self.db, result.id, self.admin)
        self.assertEqual(self.participant(reloaded, self.moa)["faction"], "수비")

    def test_ten_percent_hp_returns_as_ten_percent_of_own_hp_and_mp_restores(self):
        result = self.start()
        self.change_state(result.id, hp=100, mp=3)
        crud.terminate_battle(self.db, result.id)
        self.db.refresh(self.moa)
        self.assertEqual(self.moa.hp, 20)  # 100/1000 × 본래 최대 HP 200
        self.assertEqual(self.moa.mp, 50)
        self.assertEqual(self.moa.faction, "공격")
        self.assertEqual(self.moa.hp_max, 200)
        self.assertEqual(self.moa.atk, 10)

    def test_practice_does_not_persist_borrowed_or_final_values(self):
        result = self.start(mode="practice")
        self.change_state(result.id, hp=100, mp=3)
        crud.terminate_battle(self.db, result.id)
        self.db.refresh(self.moa)
        self.assertEqual((self.moa.hp, self.moa.mp, self.moa.faction), (100, 40, "공격"))

    def test_normal_battle_keeps_absolute_hp_rule(self):
        result = self.start(paired=False)
        self.change_state(result.id, hp=30)
        crud.terminate_battle(self.db, result.id)
        self.db.refresh(self.moa)
        self.assertEqual(self.moa.hp, 30)

    def test_zero_overheal_and_tiny_positive_health(self):
        for value, expected in [(0, 0), (2000, 200), (1, 1)]:
            with self.subTest(value=value):
                result = self.start()
                self.change_state(result.id, hp=value, max_hp=1000)
                crud.terminate_battle(self.db, result.id)
                self.db.refresh(self.moa)
                self.assertEqual(self.moa.hp, expected)

    def test_repair_uses_original_donor_stats_and_keeps_resource_ratios_and_effects(self):
        result = self.start(third=True)
        effect = {"effect_type": "stat_modifier", "stat": "atk", "applied_delta": 7, "affinity": "buff"}
        self.change_state(result.id, hp=100, mp=60, shield=9, attn=50, atk=107,
                          env_stacks={"1": 2}, status_effects=[effect])
        updated = crud.update_battle_pairs(self.db, result.id, BattlePairsRequest(pairs=[[self.moa.id, self.third.id], [self.soa.id]]))
        moa = self.participant(updated, self.moa)
        self.assertEqual((moa["faction"], moa["atk"]), ("치유", 37))
        self.assertEqual((moa["hp"], moa["max_hp"], moa["mp"], moa["max_mp"]), (50, 500, 100, 200))
        self.assertEqual((moa["attn"], moa["shield"], moa["env_stacks"], moa["status_effects"]), (50, 9, {"1": 2}, [effect]))
        third = self.participant(updated, self.third)
        self.assertEqual((third["faction"], third["atk"]), ("공격", 10))
        # 원래 솨의 값을 빌린 뫄가 아니라, 뫄 본래 능력치를 다시 빌려야 한다.
        returned = crud.update_battle_pairs(self.db, result.id, BattlePairsRequest(pairs=[[self.moa.id, self.soa.id], [self.third.id]]))
        moa = self.participant(returned, self.moa)
        self.assertEqual((moa["hp"], moa["mp"], moa["shield"], moa["atk"]), (100, 60, 9, 107))

    def test_downed_character_is_not_revived_by_repair(self):
        result = self.start(third=True)
        self.change_state(result.id, hp=0, downed=True)
        updated = crud.update_battle_pairs(self.db, result.id, BattlePairsRequest(pairs=[[self.moa.id, self.third.id], [self.soa.id]]))
        self.assertEqual(self.participant(updated, self.moa)["hp"], 0)
        self.assertTrue(self.participant(updated, self.moa)["downed"])

    def test_repair_caps_debuff_and_cleansing_restores_new_base(self):
        result = self.start(third=True)
        self.change_state(result.id, atk=20, status_effects=[{
            "effect_type": "stat_modifier", "stat": "atk", "applied_delta": -80, "affinity": "debuff",
            "skill_name": "약화",
        }])
        updated = crud.update_battle_pairs(self.db, result.id, BattlePairsRequest(pairs=[[self.moa.id, self.third.id], [self.soa.id]]))
        moa = self.participant(updated, self.moa)
        self.assertEqual(moa["atk"], 0)
        self.assertEqual(moa["status_effects"][0]["applied_delta"], -30)
        crud._remove_status_effects_by_affinity(moa, "debuff", 1)
        self.assertEqual(moa["atk"], 30)

    def test_undo_restores_matching_stats_for_the_current_pair(self):
        result = self.start(third=True)
        crud.resolve_battle_telegraph(self.db, result.id, BattleTelegraphRequest(enemy_actions=[{"enemy_id": self.enemy.id, "kind": "none"}]))
        crud.update_battle_pairs(self.db, result.id, BattlePairsRequest(pairs=[[self.moa.id, self.third.id], [self.soa.id]]))
        restored = crud.undo_last_turn(self.db, result.id)
        moa = self.participant(restored, self.moa)
        self.assertEqual((moa["faction"], moa["atk"], moa["max_hp"]), ("치유", 30, 500))
        self.assertEqual(moa["hp"], 200)  # 스냅샷의 400/1000 비율 유지
        self.assertEqual(moa["pair_source_character_id"], self.third.id)

    def test_join_fills_waiter_with_borrowed_stats(self):
        result = crud.start_battle(self.db, self.admin, BattleStartRequest(
            mode="real", enemy_ids=[self.enemy.id], character_ids=[self.moa.id], pair_battle=True,
        ))
        joined = crud.join_battle(self.db, result.id, BattleJoinRequest(character_id=self.soa.id))
        self.assertEqual(self.participant(joined, self.moa)["faction"], "수비")
        self.assertEqual(self.participant(joined, self.soa)["faction"], "공격")
        self.assertEqual(self.participant(joined, self.soa)["joined_round"], 1)

    def give_skills(self):
        nodes = []
        for owner, book, cost, power in [(self.moa, "용맹의 서", 7, 2), (self.soa, "불굴의 서", 11, 3)]:
            node = SkillNode(book=book, branch=1, col=0, tier=2, default_name=f"{owner.name} 기술",
                             var_name="ab_strike", cost=cost, power=power, target="1", target_side="ENEMY",
                             trigger_type="즉발형", category="피해", activation_order=8, is_public=True)
            self.db.add(node)
            self.db.flush()
            self.db.add(CharacterSkillUnlock(character_id=owner.id, node_id=node.id,
                                             custom_name=f"{owner.name}의 고유기술", custom_image_url=f"https://example.com/{owner.id}.png"))
            nodes.append(node)
        self.db.commit()
        return nodes

    def test_skill_menu_and_execution_use_partner_unlocks_and_customizations(self):
        own_skill, borrowed_skill = self.give_skills()
        result = self.start()
        skills = crud.get_battle_active_skills(self.db, result.id)["skills_by_character"]
        self.assertEqual([s["id"] for s in skills[self.moa.id]], [borrowed_skill.id])
        self.assertIn("솨의 고유기술", skills[self.moa.id][0]["display_name"])
        self.assertEqual(skills[self.moa.id][0]["image_url"], f"https://example.com/{self.soa.id}.png")
        self.assertEqual([s["id"] for s in skills[self.soa.id]], [own_skill.id])
        session = self.db.get(BattleSession, result.id)
        session.phase = "ally"
        self.db.commit()
        resolved = crud.resolve_battle_ally_turn(self.db, result.id, BattleAllyTurnRequest(character_actions=[
            CharacterActionInput(character_id=self.moa.id, kind="skill", skill_node_id=borrowed_skill.id, target_enemy_id=self.enemy.id),
        ]))
        self.assertEqual(self.participant(resolved, self.moa)["mp"], 89)
        self.assertEqual(resolved.enemies[0]["hp"], 49700)  # 솨의 공격력 100 × 솨 기술 위력 3
        self.assertTrue(any("뫄의 솨의 고유기술" in event for event in resolved.log[-1]["events"]))
        self.assertEqual(self.db.query(CharacterSkillUnlock).filter_by(character_id=self.moa.id).one().node_id, own_skill.id)

    def test_skill_mapping_changes_after_repair_even_with_server_cache(self):
        own_skill, borrowed_skill = self.give_skills()
        result = self.start(third=True)
        crud.get_battle_active_skills(self.db, result.id)
        crud.update_battle_pairs(self.db, result.id, BattlePairsRequest(pairs=[[self.moa.id, self.third.id], [self.soa.id]]))
        skills = crud.get_battle_active_skills(self.db, result.id)["skills_by_character"]
        self.assertEqual(skills[self.moa.id], [])
        self.assertEqual([s["id"] for s in skills[self.third.id]], [own_skill.id])
        self.assertEqual([s["id"] for s in skills[self.soa.id]], [borrowed_skill.id])

    def test_own_or_stale_skill_cannot_be_used_when_partner_does_not_own_it(self):
        own_skill, borrowed_skill = self.give_skills()
        result = self.start(third=True)
        session = self.db.get(BattleSession, result.id)
        session.phase = "ally"
        self.db.commit()
        with self.assertRaises(HTTPException) as error:
            crud.resolve_battle_ally_turn(self.db, result.id, BattleAllyTurnRequest(character_actions=[
                CharacterActionInput(character_id=self.moa.id, kind="skill", skill_node_id=own_skill.id),
            ]))
        self.assertEqual(error.exception.status_code, 400)
        self.db.rollback()
        crud.update_battle_pairs(self.db, result.id, BattlePairsRequest(pairs=[[self.moa.id, self.third.id], [self.soa.id]]))
        for skill_id in (borrowed_skill.id, None):
            with self.subTest(skill_id=skill_id), self.assertRaises(HTTPException):
                crud.resolve_battle_ally_turn(self.db, result.id, BattleAllyTurnRequest(character_actions=[
                    CharacterActionInput(character_id=self.moa.id, kind="skill", skill_node_id=skill_id),
                ]))
            self.db.rollback()
        self.assertEqual(self.db.get(BattleSession, result.id).enemies[0]["hp"], 50000)

    def test_item_list_and_consumption_belong_to_the_actor_not_partner(self):
        potion = Item(name="뫄 전용 물약", item_type="consumable", effects=[{"stat": "hp", "delta": 30}])
        other = Item(name="솨 전용 물약", item_type="consumable", effects=[])
        self.db.add_all([potion, other])
        self.db.flush()
        self.db.add_all([Purchase(character_id=self.moa.id, item_id=potion.id, quantity=1, source="reward"),
                         Purchase(character_id=self.soa.id, item_id=other.id, quantity=1, source="reward")])
        self.db.commit()
        result = self.start()
        items = crud.get_battle_available_items(self.db, result.id).items_by_character
        self.assertEqual([item.item_id for item in items[self.moa.id]], [potion.id])
        self.assertEqual([item.item_id for item in items[self.soa.id]], [other.id])
        session = self.db.get(BattleSession, result.id)
        session.phase = "ally"
        self.db.commit()
        resolved = crud.resolve_battle_ally_turn(self.db, result.id, BattleAllyTurnRequest(character_actions=[
            CharacterActionInput(character_id=self.moa.id, kind="item", item_id=potion.id),
            CharacterActionInput(character_id=self.soa.id, kind="item", item_id=potion.id),
        ]))
        self.assertEqual(self.participant(resolved, self.moa)["hp"], 430)
        usages = self.db.query(ItemUsage).all()
        self.assertEqual([(u.character_id, u.item_id) for u in usages], [(self.moa.id, potion.id)])
        state = self.db.query(CharacterItemState).filter_by(character_id=self.soa.id, item_id=potion.id).one()
        self.assertEqual(state.used_quantity, 0)
        self.assertTrue(any("솨: 뫄 전용 물약을(를) 보유하고 있지 않습니다" in e for e in resolved.log[-1]["events"]))

    def test_victory_defeat_and_rollback_apply_to_original_character(self):
        result = self.start()
        session = self.change_state(result.id, hp=100)
        session.phase = "ally"
        session.enemies = [{**e, "hp": 0} for e in session.enemies]
        self.db.commit()
        resolved = crud.resolve_battle_ally_turn(self.db, result.id, BattleAllyTurnRequest())
        self.assertEqual(resolved.status, "victory")
        self.db.refresh(self.moa)
        self.assertEqual(self.moa.hp, 20)
        crud.rollback_battle_session(self.db, result.id)
        self.db.refresh(self.moa)
        self.assertEqual((self.moa.hp, self.moa.mp), (100, 40))
        result = self.start()
        session = self.db.get(BattleSession, result.id)
        session.participants = [{**p, "hp": 0, "downed": True} for p in session.participants]
        self.db.commit()
        resolved = crud.resolve_battle_telegraph(self.db, result.id, BattleTelegraphRequest(enemy_actions=[{"enemy_id": self.enemy.id, "kind": "none"}]))
        self.assertEqual(resolved.status, "defeat")
        self.db.refresh(self.moa)
        self.assertEqual(self.moa.hp, 0)
