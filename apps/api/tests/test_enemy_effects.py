import copy
import unittest
from unittest.mock import patch
from pydantic import ValidationError
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app import crud
from app.db import Base
from app.models import BattleSession, Character
from app.schemas import EnvironmentCreate, EnemySkill, BattleTelegraphRequest, BattleAllyTurnRequest
from app.migrations import ensure_schema


class EnemyEffectsTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        characters = [Character(name=name, hp=100, hp_max=100, atk=100) for name in ("A", "B", "C")]
        self.db.add_all(characters)
        self.db.flush()
        self.party = [crud._snapshot_combatant(c) for c in characters]
        for participant in self.party:
            participant.update(dmg_r=0.0, hp_regen_true=0, hp_regen_fixed=0.0, mp_regen=0)
        self.enemy = {"enemy_id": 1, "name": "에너미", "hp": 1000, "max_hp": 1000, "attack": 10, "skills": [], "status_effects": []}

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def battle(self, skills=None, summons=None):
        enemy = {**self.enemy, "skills": [skill.model_dump() for skill in skills or []]}
        battle = BattleSession(mode="practice", chapter="1장", phase="telegraph", round=1,
                              participants=copy.deepcopy(self.party), enemies=[enemy], summons=summons or [], log=[])
        self.db.add(battle)
        self.db.commit()
        return battle

    def telegraph(self, battle, index=None, targets=None, kind="attack"):
        battle.phase = "telegraph"
        self.db.commit()
        actions = [] if index is None else [{"enemy_id": 1, "kind": kind, "skill_index": index, "target_character_ids": targets or []}]
        return crud.resolve_battle_telegraph(self.db, battle.id, BattleTelegraphRequest(enemy_actions=actions))

    def enemy_turn(self, battle):
        battle.phase = "enemy"
        self.db.commit()
        return crud.resolve_battle_enemy_turn(self.db, battle.id)

    def test_environment_alive_dead_conditions_and_existing_stacks(self):
        alive = crud.create_environment(self.db, EnvironmentCreate(chapter="1장", name="생존", enemy_condition="alive", condition_enemy_id=1, stacks_per_round=2, damage_per_stack=3))
        dead = crud.create_environment(self.db, EnvironmentCreate(chapter="1장", name="사망", enemy_condition="dead", condition_enemy_id=1))
        battle = self.battle()
        battle.enemies = [battle.enemies[0], {**self.enemy, "enemy_id": 2}]
        self.db.commit()
        first = self.telegraph(battle)
        self.assertEqual(first.participants[0]["env_stacks"], {str(alive.id): 2})
        self.assertEqual(first.participants[0]["hp"], 100)
        battle.enemies = [{**enemy, "hp": 0 if enemy["enemy_id"] == 1 else 1000} for enemy in battle.enemies]
        self.db.commit()
        second = self.telegraph(battle)
        self.assertEqual(second.participants[0]["env_stacks"], {str(alive.id): 2, str(dead.id): 1})
        self.assertEqual(second.participants[0]["hp"], 100)

    def test_cleanse_protects_default_environment_and_restores_stat(self):
        locked = crud.create_environment(self.db, EnvironmentCreate(chapter="1장", name="해제 불가"))
        removable = crud.create_environment(self.db, EnvironmentCreate(chapter="1장", name="해제 가능", dispellable=True))
        participant = self.party[0]
        participant["env_stacks"] = {str(locked.id): 3, str(removable.id): 4}
        crud._add_combat_stat_stack(participant, source="test", name="약화", stat="atk", amount=20, percent=True, stackable=True)
        removed, names = crud._cleanse_combat_debuffs(self.db, participant, 2)
        self.assertEqual(removed, 2)
        self.assertEqual(participant["atk"], 100)
        self.assertEqual(participant["env_stacks"], {str(locked.id): 3, str(removable.id): 3})
        crud._apply_item_effects_to_snapshot(self.db, participant, [{"stat": "cleanse_debuffs", "delta": 1}], 1)
        self.assertEqual(participant["env_stacks"], {str(locked.id): 3})

    def test_explosion_timing_each_phase_and_one_shot(self):
        for phase in ("telegraph", "ally", "enemy"):
            with self.subTest(phase=phase):
                skill = EnemySkill(skill_type="소환", name="폭발", summon_name="폭탄", summon_hp=20, summon_attack=7, summon_count=1, summon_action_type="explosion", summon_trigger_phase=phase)
                battle = self.battle([skill])
                result = self.telegraph(battle, 0, kind="summon")
                self.assertEqual(result.participants[0]["hp"], 100)
                crud.resolve_battle_ally_turn(self.db, battle.id, BattleAllyTurnRequest())
                self.assertEqual(battle.participants[0]["hp"], 93 if phase == "ally" else 100)
                result = self.enemy_turn(battle)
                self.assertEqual(result.participants[0]["hp"], 100 if phase == "telegraph" else 93)
                result = self.telegraph(battle)
                self.assertEqual([p["hp"] for p in result.participants], [93, 93, 93])
                self.assertEqual(result.summons, [])
                self.enemy_turn(battle)
                self.assertEqual(battle.participants[0]["hp"], 93)

    def test_minion_debuff_repeats_and_stops_after_death(self):
        skill = EnemySkill(skill_type="소환", name="약화", summon_hp=20, summon_action_type="debuff", summon_trigger_phase="ally", summon_effect_stat="atk", summon_effect_percent=10)
        battle = self.battle([skill])
        self.telegraph(battle, 0, kind="summon")
        crud.resolve_battle_ally_turn(self.db, battle.id, BattleAllyTurnRequest())
        self.assertEqual([p["atk"] for p in battle.participants], [90, 90, 90])
        self.enemy_turn(battle)
        self.telegraph(battle)
        crud.resolve_battle_ally_turn(self.db, battle.id, BattleAllyTurnRequest())
        self.assertEqual(battle.participants[0]["atk"], 80)
        battle.summons = [{**minion, "hp": 0} for minion in battle.summons]
        self.db.commit()
        self.enemy_turn(battle)
        self.telegraph(battle)
        crud.resolve_battle_ally_turn(self.db, battle.id, BattleAllyTurnRequest())
        self.assertEqual(battle.participants[0]["atk"], 80)

    def test_buff_targets_specific_enemy_and_changes_damage(self):
        for stat in ("attack", "damage"):
            with self.subTest(stat=stat):
                summon = EnemySkill(skill_type="소환", name="강화", summon_action_type="buff", summon_trigger_phase="enemy", summon_buff_stat=stat, summon_buff_enemy_id=2, summon_effect_percent=100)
                attack = EnemySkill(skill_type="광역 공격", name="공격", damage_percent=100)
                battle = self.battle([summon])
                battle.enemies = [battle.enemies[0], {**self.enemy, "enemy_id": 2, "skills": [attack.model_dump()]}]
                self.db.commit()
                self.telegraph(battle, 0, kind="summon")
                battle.pending_enemy_actions = [{"enemy_id": 2, "kind": "attack", "skill_index": 0, "target_character_ids": []}]
                self.db.commit()
                self.enemy_turn(battle)
                self.assertEqual(battle.participants[0]["hp"], 80)
                self.assertEqual(battle.enemies[0]["attack"], 10)
                self.telegraph(battle)
                self.enemy_turn(battle)
                self.assertEqual(len(battle.enemies[1]["status_effects"]), 2)

    def test_persistent_debuff_units_and_nonstackable(self):
        for stat, amount, expected in (("atk", 7, 93), ("dmg_r", 5, 0.15)):
            with self.subTest(stat=stat):
                skill = EnemySkill(skill_type="지속 디버프", name="지속 약화", target_count=1, debuff_stat=stat, debuff_amount=amount)
                battle = self.battle([skill])
                battle.participants = [{**p, "dmg_r": 0.2} for p in battle.participants]
                self.db.commit()
                target = self.party[0]["character_id"]
                for _ in range(2):
                    self.telegraph(battle, 0, [target])
                    self.enemy_turn(battle)
                self.assertAlmostEqual(battle.participants[0][stat], expected)
                self.assertEqual(len(battle.participants[0]["status_effects"]), 1)
                self.assertEqual(battle.participants[1]["atk"], 100)

    def test_stackable_debuff_and_manual_counts_change_each_round(self):
        skill = EnemySkill(skill_type="지속 디버프", name="약화", target_count=1, manual_target_count=True, debuff_stat="atk", debuff_amount=5, debuff_stackable=True)
        battle = self.battle([skill])
        ids = [p["character_id"] for p in self.party]
        self.telegraph(battle, 0, ids)
        self.enemy_turn(battle)
        self.assertEqual([p["atk"] for p in battle.participants], [95, 95, 95])
        self.telegraph(battle, 0, ids[:1])
        self.enemy_turn(battle)
        self.assertEqual([p["atk"] for p in battle.participants], [90, 95, 95])
        with self.assertRaises(HTTPException):
            self.telegraph(battle, 0, [])

    def test_manual_aoe_uses_only_selected_targets(self):
        skill = EnemySkill(skill_type="광역 공격", name="수동 광역", target_count=1, manual_target_count=True, damage_percent=100)
        battle = self.battle([skill])
        self.telegraph(battle, 0, [self.party[1]["character_id"]])
        self.enemy_turn(battle)
        self.assertEqual([p["hp"] for p in battle.participants], [100, 90, 100])

    def test_automatic_target_mode_supports_attention_and_random(self):
        self.party[0]["attn"] = 1
        self.party[1]["attn"] = 10
        self.party[2]["attn"] = 5
        attention = EnemySkill(skill_type="지정 공격", name="주목", target_count=2, damage_percent=100)
        battle = self.battle([attention])
        result = self.telegraph(battle, 0)
        self.assertEqual(
            result.pending_enemy_actions[0]["target_character_ids"],
            [self.party[1]["character_id"], self.party[2]["character_id"]],
        )

        random_skill = EnemySkill(skill_type="지정 공격", name="무작위", target_count=2, damage_percent=100, auto_target_mode="random")
        battle = self.battle([random_skill])
        with patch("app.crud.random.sample", return_value=[battle.participants[2], battle.participants[0]]) as sample:
            result = self.telegraph(battle, 0)
        sample.assert_called_once()
        self.assertEqual(
            result.pending_enemy_actions[0]["target_character_ids"],
            [self.party[2]["character_id"], self.party[0]["character_id"]],
        )

    def test_environment_skill_adds_stacks_without_immediate_damage_and_honors_cap(self):
        env = crud.create_environment(self.db, EnvironmentCreate(chapter="1장", name="독", stacks_per_round=0, max_stacks=3, damage_per_stack=5))
        skill = EnemySkill(skill_type="환경", name="독 분사", target_count=1, environment_id=env.id, environment_stack_count=2)
        battle = self.battle([skill])
        battle.participants = [{**battle.participants[0], "env_stacks": {str(env.id): 2}}, *battle.participants[1:]]
        self.db.commit()

        self.telegraph(battle, 0, [self.party[0]["character_id"]])
        hp_after_telegraph = battle.participants[0]["hp"]
        self.enemy_turn(battle)

        self.assertEqual(battle.participants[0]["env_stacks"][str(env.id)], 3)
        self.assertEqual([p["hp"] for p in battle.participants], [hp_after_telegraph, 100, 100])

    def test_snapshot_is_not_mutated_and_guard_blocks(self):
        original = copy.deepcopy(self.party[0])
        original["status_effects"] = [{"effect_type": "purification_guard", "stacks": 1}]
        snapshot = {**original}
        self.assertFalse(crud._add_combat_stat_stack(snapshot, source="x", name="약화", stat="atk", amount=50, percent=True, stackable=True))
        self.assertEqual(original["status_effects"][0]["stacks"], 1)
        self.assertEqual(snapshot["atk"], 100)

    def test_validates_stat_and_condition(self):
        self.assertEqual(EnemySkill(skill_type="광역 공격A", name="레거시").skill_type, "광역 공격")
        with self.assertRaises(ValidationError):
            EnemySkill(skill_type="지속 디버프", name="잘못된 능력치", debuff_stat="gold")
        with self.assertRaises(ValidationError):
            EnemySkill(skill_type="환경", name="환경 누락")
        with self.assertRaises(ValidationError):
            EnvironmentCreate(chapter="1장", name="조건 없음", enemy_condition="alive")

    def test_existing_environment_migration_preserves_values(self):
        with self.engine.begin() as connection:
            connection.execute(text("DROP TABLE environments"))
            connection.execute(text("CREATE TABLE environments (id INTEGER PRIMARY KEY, chapter VARCHAR, name VARCHAR, stacks_per_round INTEGER, damage_per_stack INTEGER, created_at DATETIME)"))
            connection.execute(text("INSERT INTO environments (id, chapter, name, stacks_per_round, damage_per_stack) VALUES (1, '1장', '독', 2, 3)"))
        ensure_schema(self.engine)
        ensure_schema(self.engine)
        with self.engine.connect() as connection:
            row = connection.execute(text("SELECT stacks_per_round, damage_per_stack, stackable, max_stacks, dispellable, enemy_condition, condition_enemy_id FROM environments")).one()
            self.assertEqual(tuple(row), (2, 3, 1, 0, 0, "always", None))


if __name__ == "__main__":
    unittest.main()
