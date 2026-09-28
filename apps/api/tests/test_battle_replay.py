"""턴 단위 되짚어보기: 1라운드 첫 턴부터 마지막 턴까지 그 턴의 판 상태와 로그를 함께 돌려준다."""
import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.models import BattleSession, Character, Member
from app.schemas import (
    BattleAllyTurnRequest, BattleJoinRequest, BattleTelegraphRequest, CharacterActionInput, EnemySkill,
)


class BattleReplayTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.admin = Member(login_id="admin", password_hash="x", role="ADMIN")
        self.runner = Member(login_id="runner", password_hash="x", role="RUNNER")
        self.hero = Character(name="용사", faction="공격", hp=100, hp_max=100, mp=10, mp_max=10, atk=50)
        self.db.add_all([self.admin, self.runner, self.hero])
        self.db.flush()
        skill = EnemySkill(skill_type="지정 공격", name="내리치기", target_count=1, damage_percent=30)
        self.battle = BattleSession(
            mode="real", chapter="1장", status="in_progress", phase="telegraph", round=1,
            participants=[crud._snapshot_combatant(self.hero)],
            enemies=[{"enemy_id": 1, "name": "용", "hp": 300, "max_hp": 300, "attack": 20,
                      "skills": [skill.model_dump()], "status_effects": [], "joined_round": 0}],
            summons=[], log=[],
        )
        self.db.add(self.battle)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def play_round(self):
        crud.resolve_battle_telegraph(self.db, self.battle.id, BattleTelegraphRequest(
            enemy_actions=[{"enemy_id": 1, "kind": "attack", "skill_index": 0,
                            "target_character_ids": [self.hero.id]}],
        ))
        crud.resolve_battle_ally_turn(self.db, self.battle.id, BattleAllyTurnRequest(
            character_actions=[CharacterActionInput(character_id=self.hero.id, kind="attack", target_enemy_id=1)],
        ))
        crud.resolve_battle_enemy_turn(self.db, self.battle.id)

    def finish(self):
        self.battle.status = "early_terminated"
        self.db.commit()

    def test_replay_walks_every_turn_from_the_first_round(self):
        self.play_round()
        self.play_round()
        self.finish()
        replay = crud.get_battle_replay(self.db, self.battle.id, self.admin)
        self.assertEqual(
            [(turn.round, turn.phase) for turn in replay.turns],
            [(1, "telegraph"), (1, "ally"), (1, "enemy"), (2, "telegraph"), (2, "ally"), (2, "enemy")],
        )
        self.assertEqual([turn.index for turn in replay.turns], [0, 1, 2, 3, 4, 5])
        # 각 턴은 그 턴이 끝난 시점의 판을 담는다: 아군 턴이 끝나면 에너미 체력이 줄어 있다.
        first_telegraph, first_ally = replay.turns[0], replay.turns[1]
        self.assertEqual(first_telegraph.enemies[0]["hp"], 300)
        self.assertEqual(first_ally.enemies[0]["hp"], 250)
        # 암시 턴의 결과에는 확정된 에너미 예고가 들어 있다.
        self.assertEqual(first_telegraph.pending_enemy_actions[0]["target_character_ids"], [self.hero.id])
        # 마지막 턴은 현재 세션 상태와 같다.
        self.assertEqual(replay.turns[-1].enemies[0]["hp"], self.battle.enemies[0]["hp"])
        self.assertEqual(replay.turns[-1].participants[0]["hp"], self.battle.participants[0]["hp"])
        # 로그도 턴별로 나뉘어 붙는다.
        self.assertTrue(any("용사" in event for event in first_ally.events))

    def test_join_log_is_folded_into_the_next_turn(self):
        """난입은 별개의 칸이 아니라 바로 뒤따르는 턴(보통 그 라운드의 아군 턴)에 함께 들어간다."""
        newcomer = Character(name="신입", faction="치유", hp=50, hp_max=50, mp=5, mp_max=5)
        self.db.add(newcomer)
        self.db.commit()
        crud.resolve_battle_telegraph(self.db, self.battle.id, BattleTelegraphRequest(
            enemy_actions=[{"enemy_id": 1, "kind": "attack", "skill_index": 0,
                            "target_character_ids": [self.hero.id]}],
        ))
        # 암시 턴이 끝나 아군 턴을 기다리는 사이에 난입한다.
        crud.join_battle(self.db, self.battle.id, BattleJoinRequest(character_id=newcomer.id))
        crud.resolve_battle_ally_turn(self.db, self.battle.id, BattleAllyTurnRequest(
            character_actions=[CharacterActionInput(character_id=self.hero.id, kind="attack", target_enemy_id=1)],
        ))
        self.finish()
        replay = crud.get_battle_replay(self.db, self.battle.id, self.admin)
        self.assertEqual([turn.kind for turn in replay.turns], [None, None])
        ally_turn = replay.turns[1]
        self.assertEqual(ally_turn.phase, "ally")
        # 난입 줄이 아군 턴 로그 맨 앞에 붙는다.
        self.assertIn("난입", ally_turn.events[0])

    def test_ally_turn_carries_the_chosen_actions(self):
        """되짚어보기가 그 턴의 러너 카드를 다시 그릴 수 있게 고른 행동을 함께 담는다."""
        self.play_round()
        self.finish()
        replay = crud.get_battle_replay(self.db, self.battle.id, self.admin)
        ally_turn = next(turn for turn in replay.turns if turn.phase == "ally")
        preview = ally_turn.action_preview[str(self.hero.id)]
        self.assertEqual(preview["kind"], "attack")
        self.assertEqual(preview["target_names"], ["용"])
        # 암시·에너미 턴에는 아군 행동이 없다.
        telegraph_turn = next(turn for turn in replay.turns if turn.phase == "telegraph")
        self.assertEqual(telegraph_turn.action_preview, {})

    def test_only_finished_real_battles_can_be_replayed(self):
        self.play_round()
        # 진행 중인 전투는 되짚어볼 수 없다.
        with self.assertRaises(HTTPException) as blocked:
            crud.get_battle_replay(self.db, self.battle.id, self.admin)
        self.assertIn("완료된", blocked.exception.detail)
        self.finish()
        # 완료되면 러너도 볼 수 있다.
        self.assertEqual(len(crud.get_battle_replay(self.db, self.battle.id, self.runner).turns), 3)
        # 모의전은 되짚어보기 대상이 아니다.
        self.battle.mode = "practice"
        self.db.commit()
        with self.assertRaises(HTTPException) as blocked:
            crud.get_battle_replay(self.db, self.battle.id, self.runner)
        self.assertIn("실전", blocked.exception.detail)

    def test_finished_list_only_shows_completed_real_battles(self):
        practice = BattleSession(mode="practice", chapter="1장", status="victory", round=1,
                                 participants=[], enemies=[], summons=[], log=[])
        self.db.add(practice)
        self.db.commit()
        self.assertEqual(crud.get_finished_real_battles(self.db), [])
        self.finish()
        listed = crud.get_finished_real_battles(self.db)
        self.assertEqual([summary.id for summary in listed], [self.battle.id])
        self.assertEqual(listed[0].enemy_names, ["용"])

    def test_item_and_skill_actions_are_carried_with_ally_targets(self):
        """아이템·치유 행동도 아이콘과 지원 대상을 다시 그릴 수 있게 담긴다."""
        healer = Character(name="치유사", faction="치유", hp=40, hp_max=100, mp=5, mp_max=5)
        self.db.add(healer)
        self.db.flush()
        self.battle.participants = [*self.battle.participants, crud._snapshot_combatant(healer)]
        self.db.commit()
        crud.resolve_battle_telegraph(self.db, self.battle.id, BattleTelegraphRequest(
            enemy_actions=[{"enemy_id": 1, "kind": "none"}],
        ))
        crud.resolve_battle_ally_turn(self.db, self.battle.id, BattleAllyTurnRequest(character_actions=[
            CharacterActionInput(character_id=healer.id, kind="heal", target_character_id=self.hero.id),
        ]))
        crud.resolve_battle_enemy_turn(self.db, self.battle.id)
        self.finish()
        replay = crud.get_battle_replay(self.db, self.battle.id, self.admin)
        ally_turn = next(turn for turn in replay.turns if turn.phase == "ally")
        preview = ally_turn.action_preview[str(healer.id)]
        self.assertEqual(preview["kind"], "heal")
        self.assertEqual(preview["ally_target_ids"], [self.hero.id])
        self.assertEqual(preview["target_names"], ["용사"])

    def test_missing_battle_is_reported(self):
        with self.assertRaises(HTTPException) as blocked:
            crud.get_battle_replay(self.db, 999, self.admin)
        self.assertEqual(blocked.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
