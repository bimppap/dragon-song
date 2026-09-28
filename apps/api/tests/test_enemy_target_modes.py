"""에너미 스킬의 대상 선정: 포지션 광역 공격과 자동 선정 방식(주목도/무작위/체력 높은 순)."""
import copy
import unittest

from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.models import BattleSession, Character
from app.schemas import BattleTelegraphRequest, EnemySkill
from fastapi import HTTPException


class EnemyTargetModeTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        # 체력·주목도를 서로 다르게 둬서 선정 방식마다 다른 대상이 뽑히게 한다.
        rows = [
            ("공격수", "공격", 100, 10),
            ("방패", "수비", 60, 50),
            ("치유사", "치유", 80, 5),
            ("공격수2", "공격", 40, 1),
        ]
        characters = [Character(name=name, faction=faction, hp=hp, hp_max=100, atk=10) for name, faction, hp, _ in rows]
        self.db.add_all(characters)
        self.db.flush()
        self.party = []
        for (name, _faction, _hp, attn), character in zip(rows, characters):
            participant = crud._snapshot_combatant(character)
            participant.update(attn=attn, presence=0.0, dmg_r=0.0, def_=0)
            participant["def"] = 0
            self.party.append(participant)
        self.by_name = {p["name"]: p["character_id"] for p in self.party}

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def battle(self, skills):
        enemy = {"enemy_id": 1, "name": "에너미", "hp": 1000, "max_hp": 1000, "attack": 100,
                 "skills": [skill.model_dump() for skill in skills], "status_effects": [], "joined_round": 0}
        battle = BattleSession(mode="practice", chapter="1장", phase="telegraph", round=1,
                               participants=copy.deepcopy(self.party), enemies=[enemy], summons=[], log=[])
        self.db.add(battle)
        self.db.commit()
        return battle

    def telegraph(self, battle, **action):
        battle.phase = "telegraph"
        self.db.commit()
        return crud.resolve_battle_telegraph(self.db, battle.id, BattleTelegraphRequest(
            enemy_actions=[{"enemy_id": 1, "kind": "attack", **action}],
        ))

    def names(self, character_ids):
        by_id = {p["character_id"]: p["name"] for p in self.party}
        return [by_id[character_id] for character_id in character_ids]

    def test_position_aoe_hits_every_character_in_the_chosen_position(self):
        battle = self.battle([EnemySkill(skill_type="포지션 광역 공격", name="전열 강타", damage_percent=100)])
        result = self.telegraph(battle, skill_index=0, target_faction="공격")
        pending = result.pending_enemy_actions[0]
        self.assertEqual(pending["target_faction"], "공격")
        self.assertEqual(sorted(self.names(pending["target_character_ids"])), ["공격수", "공격수2"])
        self.assertIn("이번 차례 공격 대상 : 공격 포지션 전원 / 예상 피해 : 100", result.log[-1]["events"])

        battle.phase = "enemy"
        self.db.commit()
        turn = crud.resolve_battle_enemy_turn(self.db, battle.id)
        hit = {p["name"]: p["hp"] for p in turn.participants}
        self.assertEqual(hit["공격수"], 0)
        self.assertEqual(hit["공격수2"], 0)
        # 다른 포지션은 피해를 받지 않는다.
        self.assertEqual(hit["방패"], 60)
        self.assertEqual(hit["치유사"], 80)

    def test_position_aoe_requires_a_position(self):
        battle = self.battle([EnemySkill(skill_type="포지션 광역 공격", name="전열 강타", damage_percent=100)])
        with self.assertRaises(HTTPException) as blocked:
            self.telegraph(battle, skill_index=0)
        self.assertIn("포지션", blocked.exception.detail)

    def test_auto_target_modes_pick_different_characters(self):
        skill = EnemySkill(skill_type="지정 공격", name="노려보기", target_count=1, damage_percent=100)
        battle = self.battle([skill])
        # 기술 기본값(주목도 순) → 주목도가 가장 높은 방패.
        result = self.telegraph(battle, skill_index=0)
        self.assertEqual(self.names(result.pending_enemy_actions[0]["target_character_ids"]), ["방패"])
        # 행동 암시에서 체력 높은 순으로 바꾸면 체력이 가장 많은 공격수.
        result = self.telegraph(battle, skill_index=0, auto_target_mode="hp")
        self.assertEqual(self.names(result.pending_enemy_actions[0]["target_character_ids"]), ["공격수"])
        self.assertEqual(result.pending_enemy_actions[0]["auto_target_mode"], "hp")

    def test_skill_can_default_to_the_highest_hp(self):
        skill = EnemySkill(skill_type="지정 공격", name="큰 사냥감", target_count=2,
                           damage_percent=100, auto_target_mode="hp")
        battle = self.battle([skill])
        result = self.telegraph(battle, skill_index=0)
        self.assertEqual(self.names(result.pending_enemy_actions[0]["target_character_ids"]), ["공격수", "치유사"])

    def test_position_aoe_can_carry_an_on_hit_debuff(self):
        skill = EnemySkill(skill_type="포지션 광역 공격", name="전열 부식", damage_percent=50,
                           on_hit_dot=True, dot_name="부식", dot_damage=3)
        self.assertEqual(skill.skill_type, "포지션 광역 공격")
        with self.assertRaises(ValidationError):
            EnemySkill(skill_type="환경", name="안개", on_hit_dot=True, dot_name="부식", environment_id=1)


if __name__ == "__main__":
    unittest.main()
