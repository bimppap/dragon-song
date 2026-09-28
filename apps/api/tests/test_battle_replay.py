"""턴 단위 되짚어보기: 1라운드 첫 턴부터 마지막 턴까지 그 턴의 판 상태와 로그를 함께 돌려준다."""
import unittest
import copy

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.models import BattleSession, Character, CharacterSkillUnlock, Member, SkillNode
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

    def test_join_after_ally_is_attached_to_that_ally_without_shifting_state(self):
        self.play_round()
        original = copy.deepcopy(self.battle.log)
        self.battle.log = [*original[:2],
                           {"round": 1, "phase": "enemy", "kind": "join", "events": ["🚪 신입 난입"]},
                           original[2]]
        self.finish()
        replay = crud.get_battle_replay(self.db, self.battle.id, self.admin)
        self.assertEqual(len(replay.turns), 3)
        self.assertIn("🚪 신입 난입", replay.turns[1].events)
        self.assertNotIn("🚪 신입 난입", replay.turns[2].events)
        self.assertEqual(replay.turns[1].enemies[0]["hp"], 250)

    def test_separate_retreat_is_an_ally_action_not_an_extra_turn(self):
        self.play_round()
        log = copy.deepcopy(self.battle.log)
        log.insert(2, {"round": 1, "phase": "ally", "kind": "retreat", "events": ["🏳️ 용사 퇴각"]})
        self.battle.log = log
        self.finish()
        turns = crud.get_battle_replay(self.db, self.battle.id, self.admin).turns
        self.assertEqual(len(turns), 3)
        self.assertIn("🏳️ 용사 퇴각", turns[1].events)

    def test_legacy_summon_only_round_is_part_of_next_telegraph(self):
        self.play_round()
        self.play_round()
        log = copy.deepcopy(self.battle.log)
        snapshots = copy.deepcopy(self.battle.round_snapshots)
        # Old round 2 was used only to summon; the next actual action is stored as round 3.
        for entry in log[3:]:
            entry["round"] = 3
        summon = {"id": 1, "name": "골렘", "hp": 5, "max_hp": 5, "attack": 0}
        before_first = {key: value for key, value in snapshots[0].items() if key != "phase"}
        before_summon = {key: value for key, value in snapshots[3].items() if key != "phase"}
        before_third = {**copy.deepcopy(before_summon), "round": 3, "summons": [summon]}
        self.battle.round_snapshots = [before_first, before_summon, before_third]
        self.battle.summons = [summon]
        self.battle.log = [*log[:3],
            {"round": 2, "phase": "telegraph", "events": ["📣 적의 행동 암시!", "🔮 용 - 호출 (소환 예정: 골렘 x1)"]},
            {"round": 2, "phase": "ally", "events": ["🗡️ 조사단의 행동!"]},
            {"round": 2, "phase": "enemy", "events": ["👹 에너미의 행동!", "👹 용 소환: 골렘 x1"]},
            *log[3:]]
        self.finish()
        raw_log = copy.deepcopy(self.battle.log)
        turns = crud.get_battle_replay(self.db, self.battle.id, self.admin).turns
        self.assertEqual([(t.display_round, t.phase) for t in turns],
                         [(r, phase) for r in (1, 2) for phase in ("telegraph", "ally", "enemy")])
        self.assertEqual([t.round for t in turns], [1, 1, 1, 3, 3, 3])
        self.assertEqual(turns[0].enemies[0]["hp"], 300)
        self.assertEqual(turns[1].enemies[0]["hp"], 250)
        self.assertEqual(turns[3].summons[0]["name"], "골렘")
        self.assertIn("👹 용 소환: 골렘 x1", turns[3].events)
        self.assertEqual(self.battle.log, raw_log)

    def test_empty_ally_with_enemy_attack_is_not_removed(self):
        self.play_round()
        log = copy.deepcopy(self.battle.log)
        log[1]["events"] = ["🗡️ 조사단의 행동!"]
        log[1].pop("calculations", None)
        self.battle.log = log
        self.battle.round_snapshots = [
            {key: value for key, value in self.battle.round_snapshots[0].items() if key != "phase"}
        ]
        self.finish()
        turns = crud.get_battle_replay(self.db, self.battle.id, self.admin).turns
        self.assertEqual([t.phase for t in turns], ["telegraph", "ally", "enemy"])

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


class BattleReplayLogFallbackTest(unittest.TestCase):
    """행동 기록(action_preview)을 저장하기 전에 끝난 전투도 로그에서 아군 행동을 되살린다."""

    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.admin = Member(login_id="admin", password_hash="x", role="ADMIN")
        self.hero = Character(name="용사", faction="공격", hp=100, hp_max=100, mp=10, mp_max=10, atk=50)
        self.healer = Character(name="치유사", faction="치유", hp=40, hp_max=100, mp=10, mp_max=10)
        self.guard = Character(name="방패", faction="수비", hp=80, hp_max=100, mp=10, mp_max=10)
        self.db.add_all([self.admin, self.hero, self.healer, self.guard])
        self.db.flush()
        self.node = SkillNode(
            book="용맹의 서", branch=0, col=None, tier=1, default_name="강타", trigger_type="즉발형",
            category="피해", stackable=False, var_name="ab_strike", cost=1, power=1.5,
            target="1", target_side="ENEMY", activation_order=6, is_public=True,
        )
        self.node.image_url = "/skill/strike.png"
        self.db.add(self.node)
        self.db.flush()
        self.db.add(CharacterSkillUnlock(character_id=self.hero.id, node_id=self.node.id))
        self.battle = BattleSession(
            mode="real", chapter="1장", status="in_progress", phase="ally", round=1,
            participants=[crud._snapshot_combatant(c) for c in (self.hero, self.healer, self.guard)],
            enemies=[{"enemy_id": 1, "name": "용", "hp": 900, "max_hp": 900, "attack": 10,
                      "skills": [], "status_effects": [], "joined_round": 0}],
            summons=[], log=[],
        )
        self.db.add(self.battle)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def replay_ally_turn(self):
        """행동 기록을 지워, 예전 전투처럼 로그만 남은 상태로 되짚어본다."""
        crud.resolve_battle_ally_turn(self.db, self.battle.id, BattleAllyTurnRequest(character_actions=[
            CharacterActionInput(character_id=self.hero.id, kind="skill",
                                 skill_node_id=self.node.id, target_enemy_id=1),
            CharacterActionInput(character_id=self.healer.id, kind="heal", target_character_id=self.guard.id),
            CharacterActionInput(character_id=self.guard.id, kind="defend",
                                 protect_target_character_id=self.hero.id),
        ]))
        self.battle.round_snapshots = [
            {key: value for key, value in snapshot.items() if key != "action_preview"}
            for snapshot in self.battle.round_snapshots
        ]
        self.battle.status = "early_terminated"
        self.db.commit()
        replay = crud.get_battle_replay(self.db, self.battle.id, self.admin)
        return next(turn for turn in replay.turns if turn.phase == "ally")

    def test_skill_heal_and_defend_are_read_back_from_the_log(self):
        turn = self.replay_ally_turn()

        attacker = turn.action_preview[str(self.hero.id)]
        self.assertEqual(attacker["kind"], "skill")
        self.assertEqual(attacker["skill_name"], "강타")
        # 이름으로 현재 기술을 찾아 아이콘과 설명까지 채운다.
        self.assertEqual(attacker["skill_image_url"], "/skill/strike.png")
        self.assertEqual(attacker["target_names"], ["용"])
        self.assertEqual(attacker["ally_target_ids"], [])

        healer = turn.action_preview[str(self.healer.id)]
        self.assertEqual(healer["kind"], "heal")
        self.assertEqual(healer["target_names"], ["방패"])
        self.assertEqual(healer["ally_target_ids"], [self.guard.id])

        guard = turn.action_preview[str(self.guard.id)]
        self.assertEqual(guard["kind"], "defend")
        self.assertEqual(guard["ally_target_ids"], [self.hero.id])

    def test_stored_actions_are_preferred_over_the_log(self):
        crud.resolve_battle_ally_turn(self.db, self.battle.id, BattleAllyTurnRequest(character_actions=[
            CharacterActionInput(character_id=self.hero.id, kind="attack", target_enemy_id=1),
        ]))
        self.battle.status = "victory"
        self.db.commit()
        turn = next(t for t in crud.get_battle_replay(self.db, self.battle.id, self.admin).turns if t.phase == "ally")
        # 저장된 기록이 있으면 로그를 다시 읽지 않는다(대상 id까지 정확히 남아 있다).
        self.assertEqual(turn.action_preview[str(self.hero.id)]["kind"], "attack")
        self.assertEqual(turn.action_preview[str(self.hero.id)]["target_names"], ["용"])


class BattleReplaySkippedActionTest(unittest.TestCase):
    """앞선 공격으로 적이 전멸해 행동이 씹힌 캐릭터도 고른 행동은 그대로 남는다."""

    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.admin = Member(login_id="admin", password_hash="x", role="ADMIN")
        self.first = Character(name="선공", faction="공격", hp=100, hp_max=100, mp=10, mp_max=10, atk=500)
        self.late = Character(name="후공", faction="공격", hp=100, hp_max=100, mp=10, mp_max=10, atk=10)
        self.db.add_all([self.admin, self.first, self.late])
        self.db.flush()
        self.battle = BattleSession(
            mode="real", chapter="1장", status="in_progress", phase="ally", round=1,
            participants=[crud._snapshot_combatant(self.first), crud._snapshot_combatant(self.late)],
            enemies=[{"enemy_id": 1, "name": "용", "hp": 10, "max_hp": 10, "attack": 10,
                      "skills": [], "status_effects": [], "joined_round": 0}],
            summons=[], log=[],
        )
        self.db.add(self.battle)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_skipped_attacker_still_shows_the_chosen_action(self):
        result = crud.resolve_battle_ally_turn(self.db, self.battle.id, BattleAllyTurnRequest(character_actions=[
            CharacterActionInput(character_id=self.first.id, kind="attack", target_enemy_id=1),
            CharacterActionInput(character_id=self.late.id, kind="attack", target_enemy_id=1),
        ]))
        self.assertEqual(result.status, "victory")
        # 뒤에 행동한 캐릭터는 적이 이미 전멸해 로그가 남지 않는다.
        events = " ".join(result.log[-1]["events"])
        self.assertIn("선공", events)
        self.assertNotIn("후공", events)

        turn = next(t for t in crud.get_battle_replay(self.db, self.battle.id, self.admin).turns if t.phase == "ally")
        # 그래도 고른 행동은 기록돼 있어 되짚어보기에서 카드에 그려진다.
        self.assertEqual(turn.action_preview[str(self.late.id)]["kind"], "attack")
        self.assertEqual(turn.action_preview[str(self.first.id)]["target_names"], ["용"])


class LoggedSkillNameMatchTest(unittest.TestCase):
    """로그에 적힌 기술 이름을 단계까지 맞춰 찾는다(엉뚱한 단계의 아이콘이 붙지 않게)."""

    def skill(self, tier: int, image_url: str | None, *, default_name: str = "열격") -> dict:
        node = SkillNode(
            book="용맹의 서", branch=0, col=0, tier=tier, default_name=default_name,
            trigger_type="즉발형", category="피해", stackable=False, var_name="ab_strike",
            cost=1, power=1.0, target="1", target_side="ENEMY", activation_order=6, is_public=True,
        )
        node.id = tier
        node.image_url = image_url
        return crud._battle_skill_dict(node, skill_lv=0)

    def test_picks_the_tier_that_matches_the_logged_grade(self):
        # 뿌리 기술의 등급 숫자는 단계-1이라 "열격 II"는 3단계다.
        skills = {3: self.skill(3, "/skill/strike3.png"), 5: self.skill(5, "/skill/strike5.png")}
        matched = crud._skill_by_logged_name(skills, "열격 II")
        self.assertEqual(matched["image_url"], "/skill/strike3.png")
        self.assertEqual(crud._skill_by_logged_name(skills, "열격 IV")["image_url"], "/skill/strike5.png")

    def test_missing_tier_falls_back_to_the_latest_of_the_same_skill(self):
        # 그 단계를 더 이상 갖고 있지 않으면 같은 기술 계열의 최신 습득본 아이콘을 쓴다.
        skills = {5: self.skill(5, "/skill/strike5.png"), 4: self.skill(4, "/skill/strike4.png")}
        self.assertEqual(crud._skill_by_logged_name(skills, "열격 II")["image_url"], "/skill/strike5.png")

    def test_renamed_skill_falls_back_to_the_latest_acquired(self):
        # 이름을 아예 바꿔 못 찾으면, 아이콘이라도 보이게 가장 최근에 습득한 기술을 쓴다.
        skills = {3: self.skill(3, "/skill/old.png"), 5: self.skill(5, "/skill/new.png", default_name="분쇄")}
        self.assertEqual(crud._skill_by_logged_name(skills, "개화")["image_url"], "/skill/new.png")

    def test_nothing_to_fall_back_to(self):
        self.assertIsNone(crud._skill_by_logged_name({}, "없는 기술 II"))
        self.assertIsNone(crud._skill_by_logged_name({5: self.skill(5, "/x.png")}, None))


class AllTargetLabelTest(unittest.TestCase):
    """전원 대상 기술은 대상 이름을 늘어놓지 않고 "아군 전원"처럼 한 줄로 적는다."""

    def test_label_comes_from_the_skill_target_or_var_name(self):
        self.assertEqual(crud._all_target_label({"target": "아군 전원"}), "아군 전원")
        self.assertEqual(crud._all_target_label({"target": "에너미+하수인 전원"}), "에너미+하수인 전원")
        # 후광·장막은 기술 대상이 SELF로 적혀 있지만 실제로는 아군 전원에게 닿는다.
        self.assertEqual(crud._all_target_label({"target": "SELF", "var_name": "ab_halo"}), "아군 전원")
        self.assertIsNone(crud._all_target_label({"target": "2", "var_name": "ab_aid"}))
        self.assertIsNone(crud._all_target_label(None))

    def party(self, count: int, **overrides) -> list[dict]:
        return [{"name": f"아군{index}", "downed": False, "retreated": False,
                 "joined_round": 0, **overrides.get(f"아군{index}", {})} for index in range(count)]

    def test_full_party_coverage_is_detected_without_the_skill(self):
        party = self.party(4)
        names = [p["name"] for p in party]
        self.assertTrue(crud._covers_every_ally(names, party, 2))
        self.assertFalse(crud._covers_every_ally(names[:-1], party, 2))

    def test_characters_that_could_not_be_targeted_are_ignored(self):
        # 그 라운드에 난입했거나 퇴각한 캐릭터는 애초에 대상이 되지 않는다.
        party = self.party(4, **{"아군3": {"joined_round": 2}})
        self.assertTrue(crud._covers_every_ally([p["name"] for p in party[:3]], party, 2))
        party = self.party(4, **{"아군3": {"retreated": True}})
        self.assertTrue(crud._covers_every_ally([p["name"] for p in party[:3]], party, 2))
        # 기절만 한 캐릭터를 뺀 것도 전원 대상(강화류)으로 본다.
        party = self.party(4, **{"아군3": {"downed": True}})
        self.assertTrue(crud._covers_every_ally([p["name"] for p in party[:3]], party, 2))

    def test_two_targets_in_a_two_person_party_is_not_treated_as_everyone(self):
        party = self.party(5)
        self.assertFalse(crud._covers_every_ally([p["name"] for p in party[:2]], party, 2))
