import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.models import BattleSession, Character, CharacterSkillUnlock, SkillNode
from app.schemas import BattleAllyTurnRequest, CharacterActionInput


class EncourageSkillTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

        self.caster = Character(
            name="실험 요정 D",
            faction="치유",
            hp=100,
            hp_max=100,
            mp=10,
            mp_max=10,
            skill_eff_fixed=0.1,
        )
        self.target = Character(
            name="실험 요정 A",
            faction="공격",
            hp=100,
            hp_max=100,
            atk=10,
            atk_p=0.1,
        )
        self.db.add_all([self.caster, self.target])
        self.db.flush()

        self.skill = SkillNode(
            book="탐구의 서",
            branch=0,
            col=None,
            tier=1,
            default_name="격려 I",
            trigger_type="즉발형",
            category="강화",
            stackable=False,
            var_name="ab_encourage",
            cost=2,
            power=0.2,
            target="1",
            activation_order=2,
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
            participants=[
                crud._snapshot_combatant(self.caster),
                crud._snapshot_combatant(self.target),
            ],
            enemies=[{
                "enemy_id": 1,
                "name": "오버그로스",
                "hp": 2500,
                "max_hp": 2500,
                "attack": 0,
                "skills": [],
                "status_effects": [],
                "joined_round": 0,
            }],
            summons=[],
            log=[],
        )
        self.db.add(self.battle)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def encourage_action(self) -> CharacterActionInput:
        return CharacterActionInput(
            character_id=self.caster.id,
            kind="skill",
            skill_node_id=self.skill.id,
            target_character_id=self.target.id,
        )

    def test_encourage_increases_same_round_attack_damage(self):
        result = crud.resolve_battle_ally_turn(
            self.db,
            self.battle.id,
            BattleAllyTurnRequest(character_actions=[
                self.encourage_action(),
                CharacterActionInput(
                    character_id=self.target.id,
                    kind="attack",
                    target_enemy_id=1,
                ),
            ]),
        )

        events = result.log[-1]["events"]
        encourage_event = "📣 실험 요정 D의 격려 I → 실험 요정 A 피해 증폭 +22% · MP -2 [8/10]"
        self.assertIn(encourage_event, events)
        self.assertEqual(
            result.log[-1]["calculations"][encourage_event],
            "floor(기술 위력 0.2 × (1 + 기술 효율 비례 0.1) × 100)%",
        )
        attack_event = next(event for event in events if event.startswith("⚔️ 실험 요정 A 공격:"))
        self.assertEqual(attack_event, "⚔️ 실험 요정 A 공격: 13 피해 · 오버그로스 [2487/2500]")
        self.assertEqual(
            result.log[-1]["calculations"][attack_event],
            "min(floor(공격력 10 × (1 + 공격력 증폭률 0.1) × (1 + 피해 증폭 0.22)), 남은 체력 2500)",
        )

    def test_unused_encourage_bonus_expires_after_ally_turn(self):
        result = crud.resolve_battle_ally_turn(
            self.db,
            self.battle.id,
            BattleAllyTurnRequest(character_actions=[self.encourage_action()]),
        )

        target = next(p for p in result.participants if p["character_id"] == self.target.id)
        self.assertFalse(any(effect.get("var_name") == "ab_encourage" for effect in target["status_effects"]))


if __name__ == "__main__":
    unittest.main()
