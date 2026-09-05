import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.models import BattleSession, Character, CharacterSkillUnlock, SkillNode
from app.schemas import BattleAllyTurnRequest, CharacterActionInput


class CrushingSkillTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

        self.caster = Character(
            name="분쇄 요정",
            faction="공격",
            hp=100,
            hp_max=100,
            mp=10,
            mp_max=10,
            atk=10,
        )
        self.db.add(self.caster)
        self.db.flush()

        self.skill = SkillNode(
            book="용맹의 서",
            branch=1,
            col=None,
            tier=1,
            default_name="분쇄",
            trigger_type="즉발형",
            category="피해",
            stackable=False,
            var_name="ab_crushing",
            cost=3,
            power=0.75,
            target="2",
            target_side="ENEMY",
            activation_order=4,
            is_public=True,
        )
        self.db.add(self.skill)
        self.db.flush()
        self.db.add(CharacterSkillUnlock(character_id=self.caster.id, node_id=self.skill.id))

        self.battle = BattleSession(
            mode="practice",
            chapter="1장",
            status="in_progress",
            phase="ally",
            round=1,
            participants=[crud._snapshot_combatant(self.caster)],
            enemies=[
                self._enemy(1, "적 A"),
                self._enemy(2, "적 B"),
            ],
            summons=[{
                "id": 11,
                "name": "방패 하수인",
                "hp": 10,
                "max_hp": 10,
                "attack": 0,
                "status_effects": [],
            }],
            log=[],
        )
        self.db.add(self.battle)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    @staticmethod
    def _enemy(enemy_id: int, name: str) -> dict:
        return {
            "enemy_id": enemy_id,
            "name": name,
            "hp": 100,
            "max_hp": 100,
            "attack": 0,
            "skills": [],
            "status_effects": [],
            "joined_round": 0,
        }

    def _action(self, keys: list[str]) -> CharacterActionInput:
        return CharacterActionInput(
            character_id=self.caster.id,
            kind="skill",
            skill_node_id=self.skill.id,
            skill_target_keys=keys,
            target_enemy_id=int(keys[0].split(":")[1]),
        )

    def test_selects_two_enemies_but_living_summon_intercepts_first_hit(self):
        result = crud.resolve_battle_ally_turn(
            self.db,
            self.battle.id,
            BattleAllyTurnRequest(character_actions=[self._action(["enemy:1", "enemy:2"])]),
        )

        self.assertEqual(result.summons[0]["hp"], 3)
        self.assertEqual(result.enemies[0]["hp"], 93)
        self.assertEqual(result.enemies[1]["hp"], 100)
        damage_events = [event for event in result.log[-1]["events"] if "분쇄" in event and "피해" in event]
        self.assertEqual(len(damage_events), 2)
        self.assertIn("하수인 방패 하수인", damage_events[0])
        self.assertIn("적 A", damage_events[1])

    def test_only_one_target_is_required_when_one_enemy_is_alive(self):
        enemies = [dict(enemy) for enemy in self.battle.enemies]
        enemies[1]["hp"] = 0
        self.battle.enemies = enemies
        self.battle.summons = []
        self.db.commit()

        result = crud.resolve_battle_ally_turn(
            self.db,
            self.battle.id,
            BattleAllyTurnRequest(character_actions=[self._action(["enemy:1"])]),
        )

        self.assertEqual(result.enemies[0]["hp"], 93)

    def test_rejects_one_selected_target_when_two_enemies_are_alive(self):
        with self.assertRaises(HTTPException) as raised:
            crud.resolve_battle_ally_turn(
                self.db,
                self.battle.id,
                BattleAllyTurnRequest(character_actions=[self._action(["enemy:1"])]),
            )

        self.assertEqual(raised.exception.status_code, 400)
        self.assertEqual(raised.exception.detail, "기술 적용 대상을 2명 선택해 주세요.")


if __name__ == "__main__":
    unittest.main()
