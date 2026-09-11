"""에너미 행동횟수, 암시 순서, 스킬 실행 순서 및 이전 데이터 호환 검증."""
import copy
import unittest
from types import SimpleNamespace

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.migrations import ensure_schema
from app.models import BattleSession, Character, Enemy
from app.schemas import BattleAllyTurnRequest, BattleEnemyJoinRequest, BattleStartRequest, BattleTelegraphRequest, EnemyCreate, EnemySkill


class EnemyActionCountTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.character = Character(name="수비", faction="수비", hp=100, hp_max=100, def_=20, dmg_r=0)
        self.other = Character(name="다른 대상", hp=100, hp_max=100)
        self.skills = [
            EnemySkill(skill_type="지속 디버프", name="방어 약화", debuff_stat="def", debuff_amount=20),
            EnemySkill(skill_type="지정 공격", name="일격", damage_percent=100),
            EnemySkill(skill_type="소환", name="하수인 부르기", summon_name="하수인", summon_hp=10, summon_attack=0),
        ]
        self.enemy = Enemy(name="두 번 행동", base_hp=1000, attack=30, action_count=2, skills=[skill.model_dump() for skill in self.skills])
        self.db.add_all([self.character, self.other, self.enemy])
        self.db.commit()
        self.admin = SimpleNamespace(id=None, role="ADMIN")

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def start(self):
        result = crud.start_battle(self.db, self.admin, BattleStartRequest(
            mode="real", enemy_ids=[self.enemy.id], character_ids=[self.character.id, self.other.id],
        ))
        return self.db.get(BattleSession, result.id)

    def action(self, index, *, enemy_id=None, target=None):
        return {"enemy_id": enemy_id or self.enemy.id, "kind": "summon" if index == 2 else "attack",
                "skill_index": index, "target_character_ids": [target or self.character.id]}

    def telegraph(self, battle, indices):
        return crud.resolve_battle_telegraph(self.db, battle.id, BattleTelegraphRequest(enemy_actions=[self.action(index) for index in indices]))

    def enemy_turn(self, battle):
        crud.resolve_battle_ally_turn(self.db, battle.id, BattleAllyTurnRequest(character_actions=[
            {"character_id": self.character.id, "kind": "defend"},
            {"character_id": self.other.id, "kind": "none"},
        ]))
        return crud.resolve_battle_enemy_turn(self.db, battle.id)

    def test_only_positive_integers_are_accepted(self):
        for invalid in [0, -1, 1.5, 2.0, "2", True, None]:
            with self.subTest(value=invalid), self.assertRaises(ValidationError):
                EnemyCreate(name="적", base_hp=10, attack=1, action_count=invalid)
        self.assertEqual(EnemyCreate(name="적", base_hp=10, attack=1).action_count, 1)
        self.assertEqual(EnemyCreate(name="적", base_hp=10, attack=1, action_count=3).action_count, 3)

    def test_count_saved_updated_and_snapshotted_on_start_and_join(self):
        data = EnemyCreate(name="새 적", base_hp=50, attack=5, action_count=3)
        created = crud.create_enemy(self.db, data)
        self.assertEqual(created.action_count, 3)
        battle = self.start()
        updated = crud.update_enemy(self.db, self.enemy.id, data.model_copy(update={"action_count": 4}))
        self.assertEqual(updated.action_count, 4)
        self.assertEqual(battle.enemies[0]["action_count"], 2)  # 진행 중 전투의 설정은 고정
        joined = crud.join_battle_enemy(self.db, battle.id, BattleEnemyJoinRequest(enemy_id=created.id))
        self.assertEqual(joined.enemies[-1]["action_count"], 3)
        self.assertEqual(crud.get_enemies(self.db)[0].action_count, 4)
        # 이번 라운드에 난입한 적은 3개의 행동을 제출할 필요가 없다.
        self.assertEqual(len(self.telegraph(battle, [0, 1]).pending_enemy_actions), 2)

    def test_missing_excess_and_unselected_actions_rejected_without_turn_changes(self):
        for actions in [[], [self.action(1)], [self.action(1)] * 3,
                        [self.action(1), {"enemy_id": self.enemy.id, "kind": "attack"}],
                        [self.action(1), {**self.action(1), "skill_index": 99}],
                        [self.action(1), {**self.action(2), "kind": "attack"}]]:
            with self.subTest(actions=actions):
                battle = self.start()
                before = copy.deepcopy(battle.participants)
                with self.assertRaises(HTTPException) as error:
                    crud.resolve_battle_telegraph(self.db, battle.id, BattleTelegraphRequest(enemy_actions=actions))
                self.assertEqual(error.exception.status_code, 400)
                self.assertEqual(battle.phase, "telegraph")
                self.assertEqual(battle.round_snapshots, [])
                self.assertEqual(battle.participants, before)
                crud.terminate_battle(self.db, battle.id)

    def test_all_enemies_can_skip_all_actions_and_advance_round(self):
        battle = self.start()
        battle.enemies = [*battle.enemies, {**copy.deepcopy(battle.enemies[0]), "enemy_id": 99, "action_count": 1}]
        self.db.commit()
        actions = [{"enemy_id": enemy_id, "kind": "none"} for enemy_id in [self.enemy.id, self.enemy.id, 99]]
        result = crud.resolve_battle_telegraph(self.db, battle.id, BattleTelegraphRequest(enemy_actions=actions))
        self.assertEqual(result.phase, "ally")
        self.assertEqual([a["kind"] for a in result.pending_enemy_actions], ["none"] * 3)
        result = self.enemy_turn(battle)
        self.assertEqual((result.phase, result.round, result.status), ("telegraph", 2, "in_progress"))
        self.assertEqual([p["hp"] for p in result.participants], [100, 100])
        self.assertEqual(result.pending_enemy_actions, [])
        self.assertEqual(sum("무반응" in event for event in result.log[-1]["events"]), 3)

    def test_no_response_can_mix_with_attack(self):
        battle = self.start()
        crud.resolve_battle_telegraph(self.db, battle.id, BattleTelegraphRequest(enemy_actions=[
            {"enemy_id": self.enemy.id, "kind": "none"}, self.action(1),
        ]))
        result = self.enemy_turn(battle)
        self.assertEqual(result.participants[0]["hp"], 90)
        self.assertEqual((result.phase, result.round), ("telegraph", 2))

    def test_debuff_then_attack_uses_changed_defense_and_reversed_order_does_not(self):
        for indices, expected_hp in [([0, 1], 70), ([1, 0], 90)]:
            with self.subTest(order=indices):
                self.character.hp = 100
                self.db.commit()
                battle = self.start()
                telegraph = self.telegraph(battle, indices)
                self.assertEqual([action["skill_index"] for action in telegraph.pending_enemy_actions], indices)
                self.assertEqual(telegraph.participants[0]["hp"], 100)
                self.db.expire_all()  # 다시 읽어도 확정된 순서를 유지한다
                result = self.enemy_turn(battle)
                self.assertEqual(result.participants[0]["hp"], expected_hp)
                events = result.log[-1]["events"]
                actual = ["debuff" if "🔻" in event else "attack" for event in events if "🔻" in event or "🔥" in event]
                self.assertEqual(actual, ["debuff" if index == 0 else "attack" for index in indices])
                crud.terminate_battle(self.db, battle.id)

    def test_same_skill_can_repeat_with_independent_targets(self):
        battle = self.start()
        actions = [self.action(1), self.action(1, target=self.other.id)]
        telegraph = crud.resolve_battle_telegraph(self.db, battle.id, BattleTelegraphRequest(enemy_actions=actions))
        self.assertEqual(len(telegraph.pending_enemy_actions), 2)
        result = self.enemy_turn(battle)
        self.assertEqual([p["hp"] for p in result.participants], [90, 70])

    def test_summon_remains_in_telegraph_and_counts_as_one_action(self):
        for indices in ([2, 1], [1, 2]):
            with self.subTest(order=indices):
                battle = self.start()
                telegraph = self.telegraph(battle, indices)
                self.assertEqual(len(telegraph.summons), 1)
                self.assertEqual([a["skill_index"] for a in telegraph.pending_enemy_actions], indices)
                self.assertEqual(telegraph.participants[0]["hp"], 100)
                result = self.enemy_turn(battle)
                self.assertEqual(len(result.summons), 1)
                crud.terminate_battle(self.db, battle.id)
                self.character.hp = 100
                self.db.commit()

    def test_undo_restores_the_complete_ordered_plan(self):
        battle = self.start()
        telegraph = self.telegraph(battle, [0, 1])
        plan = telegraph.pending_enemy_actions
        self.enemy_turn(battle)
        restored = crud.undo_last_turn(self.db, battle.id)
        self.assertEqual(restored.phase, "enemy")
        self.assertEqual(restored.pending_enemy_actions, plan)
        repeated = crud.resolve_battle_enemy_turn(self.db, battle.id)
        self.assertEqual(repeated.participants[0]["hp"], 70)

    def test_order_across_enemies_is_not_sorted_by_id(self):
        battle = self.start()
        battle.enemies = [*battle.enemies, {**copy.deepcopy(battle.enemies[0]), "enemy_id": 99, "action_count": 1}]
        self.db.commit()
        actions = [self.action(0, enemy_id=99), self.action(1), self.action(1)]
        telegraph = crud.resolve_battle_telegraph(self.db, battle.id, BattleTelegraphRequest(enemy_actions=actions))
        self.assertEqual([a["enemy_id"] for a in telegraph.pending_enemy_actions], [99, self.enemy.id, self.enemy.id])
        result = self.enemy_turn(battle)
        self.assertEqual(result.participants[0]["hp"], 40)

    def test_dead_enemy_has_no_required_actions(self):
        battle = self.start()
        battle.enemies = [{**battle.enemies[0], "hp": 0}]
        self.db.commit()
        result = crud.resolve_battle_telegraph(self.db, battle.id, BattleTelegraphRequest())
        self.assertEqual(result.status, "victory")

    def test_migration_defaults_existing_enemies_to_one_and_is_repeatable(self):
        self.db.close()
        with self.engine.begin() as connection:
            connection.execute(text("ALTER TABLE enemies DROP COLUMN action_count"))
        ensure_schema(self.engine)
        ensure_schema(self.engine)
        with self.engine.connect() as connection:
            self.assertEqual(connection.execute(text("SELECT action_count FROM enemies")).scalar(), 1)
