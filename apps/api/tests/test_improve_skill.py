import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.models import BattleSession, Character, CharacterSkillUnlock, SkillNode
from app.schemas import BattleAllyTurnRequest, CharacterActionInput


class ImproveSkillTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

        self.caster = Character(
            name="개선가", faction="치유", hp=100, hp_max=100, mp=10, mp_max=10,
            skill_eff_fixed=0.1, skill_eff_true=4,
        )
        self.target = Character(
            name="검사", faction="공격", hp=100, hp_max=100, atk=10, atk_p=0.0, mp=10, mp_max=10,
        )
        self.db.add_all([self.caster, self.target])
        self.db.flush()

        # 개선: 탐구의 서 파생(col 1), depth 2 → skill_lv=2, 기술 위력 10%.
        self.improve = SkillNode(
            book="탐구의 서", branch=0, col=1, tier=2, default_name="개선 II",
            trigger_type="즉발형", category="강화", stackable=False, var_name="ab_improve",
            cost=2, power=0.2, powers={"eff_true": 4}, target="1", target_side="ALLY",
            activation_order=1, is_public=True,
        )
        self.strike = SkillNode(
            book="용맹의 서", branch=0, col=None, tier=1, default_name="강타 I",
            trigger_type="즉발형", category="피해", stackable=False, var_name="ab_strike",
            cost=3, power=1.5, target="1", target_side="ENEMY", activation_order=6, is_public=True,
        )
        self.db.add_all([self.improve, self.strike])
        self.db.flush()
        self.db.add_all([
            CharacterSkillUnlock(character_id=self.caster.id, node_id=self.improve.id),
            CharacterSkillUnlock(character_id=self.target.id, node_id=self.strike.id),
        ])

        self.battle = BattleSession(
            mode="practice", chapter="1장", status="in_progress", phase="ally", round=1,
            participants=[
                crud._snapshot_combatant(self.caster),
                crud._snapshot_combatant(self.target),
            ],
            enemies=[{
                "enemy_id": 1, "name": "허수아비", "hp": 2500, "max_hp": 2500,
                "attack": 0, "skills": [], "status_effects": [], "joined_round": 0,
            }],
            summons=[], log=[],
        )
        self.db.add(self.battle)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def _resolve(self, actions):
        return crud.resolve_battle_ally_turn(
            self.db, self.battle.id, BattleAllyTurnRequest(character_actions=actions)
        )

    def test_improve_boosts_target_skill_same_round(self):
        result = self._resolve([
            CharacterActionInput(
                character_id=self.caster.id, kind="skill",
                skill_node_id=self.improve.id, target_character_id=self.target.id,
            ),
            CharacterActionInput(
                character_id=self.target.id, kind="skill",
                skill_node_id=self.strike.id, target_enemy_id=1,
            ),
        ])
        events = result.log[-1]["events"]
        calcs = result.log[-1]["calculations"]

        improve_event = next(e for e in events if e.startswith("📈 개선가의 개선 II → 검사"))
        # 기술 효율(비례) = skill_lv 2 × 0.10 + 시전자 0.1 = 0.30 → +30%
        self.assertIn("기술 효율(비례) +30%", improve_event)
        # 기술 효율(고정) = skill_lv 2 × 2 + floor(4 / 2) = 6
        self.assertIn("기술 효율(고정) +6", improve_event)
        self.assertIn("기술 위력 0.2", calcs[improve_event])

        strike_event = next(e for e in events if e.startswith("✨ 검사의") and "허수아비" in e)
        # 강타는 기술 효율 고정을 쓰지 않으므로 비례 보정만 반영된다: floor(10 × (1.5 × (1 + 0.30))) = 19
        self.assertIn("19 피해", strike_event)

    def test_inquiry_skill_goes_first_within_same_activation_order(self):
        """발동 순서가 같으면 참가 순서가 뒤여도 탐구의 서 기술(개선)이 먼저 적용된다."""
        self.improve.activation_order = self.strike.activation_order
        self.battle.participants = list(reversed(self.battle.participants))
        self.db.commit()
        result = self._resolve([
            CharacterActionInput(
                character_id=self.target.id, kind="skill",
                skill_node_id=self.strike.id, target_enemy_id=1,
            ),
            CharacterActionInput(
                character_id=self.caster.id, kind="skill",
                skill_node_id=self.improve.id, target_character_id=self.target.id,
            ),
        ])
        events = result.log[-1]["events"]
        improve_index = next(i for i, e in enumerate(events) if e.startswith("📈 개선가의 개선 II"))
        strike_index = next(i for i, e in enumerate(events) if e.startswith("✨ 검사의"))
        self.assertLess(improve_index, strike_index)
        # 개선이 먼저 걸려 강타가 보정을 받는다.
        self.assertIn("19 피해", events[strike_index])

    def _learn_inquiry_skill(self, name, var_name, **fields):
        character = Character(name=name, faction="치유", hp=100, hp_max=100, mp=10, mp_max=10, skill_eff_fixed=0.1)
        self.db.add(character)
        self.db.flush()
        node = SkillNode(
            book="탐구의 서", col=1, tier=2, default_name=name, trigger_type="즉발형", stackable=False,
            var_name=var_name, target="1", activation_order=1, is_public=True, **fields,
        )
        self.db.add(node)
        self.db.flush()
        self.db.add(CharacterSkillUnlock(character_id=character.id, node_id=node.id))
        return character, node

    def test_improve_goes_first_among_inquiry_skills_within_same_activation_order(self):
        """탐구의 서끼리 발동 순서가 같으면 참가 순서가 뒤여도 개선이 먼저 적용된다."""
        weakener, weaken = self._learn_inquiry_skill(
            "쇠약", "ab_weaken", branch=1, category="약화", cost=3, power=0.02, target_side="ENEMY",
        )
        self.battle.participants = [crud._snapshot_combatant(weakener), *self.battle.participants]
        self.db.commit()
        result = self._resolve([
            CharacterActionInput(
                character_id=weakener.id, kind="skill", skill_node_id=weaken.id, target_enemy_id=1,
            ),
            CharacterActionInput(
                character_id=self.caster.id, kind="skill",
                skill_node_id=self.improve.id, target_character_id=weakener.id,
            ),
        ])
        events = result.log[-1]["events"]
        improve_index = next(i for i, e in enumerate(events) if e.startswith("📈 개선가의 개선 II → 쇠약"))
        weaken_index = next(i for i, e in enumerate(events) if e.startswith("🩸 쇠약의"))
        self.assertLess(improve_index, weaken_index)
        # 받는 피해 증가 = 기술 위력 0.02 + 시전자 기술 효율 비례(0.1 + 개선 0.30) = 0.42
        self.assertIn("받는 피해 +42%", events[weaken_index])

    def test_charge_still_goes_before_improve_within_same_activation_order(self):
        """충전은 개선보다도 먼저 처리되어, 충전받은 마나로 개선을 쓸 수 있다."""
        charger, charge = self._learn_inquiry_skill(
            "충전가", "ab_charge", branch=2, category="회복", cost=1, power=2, target_side="ALLY",
        )
        caster, target = self.battle.participants
        caster["mp"] = 0
        self.battle.participants = [caster, target, crud._snapshot_combatant(charger)]
        self.db.commit()
        result = self._resolve([
            CharacterActionInput(
                character_id=self.caster.id, kind="skill",
                skill_node_id=self.improve.id, target_character_id=self.target.id,
            ),
            CharacterActionInput(
                character_id=charger.id, kind="skill", skill_node_id=charge.id, target_character_id=self.caster.id,
            ),
        ])
        events = result.log[-1]["events"]
        self.assertEqual([e for e in events if "MP 부족" in e], [])
        charge_index = next(i for i, e in enumerate(events) if e.startswith("🔋 충전가의"))
        improve_index = next(i for i, e in enumerate(events) if e.startswith("📈 개선가의"))
        self.assertLess(charge_index, improve_index)

    def test_improve_bonus_expires_after_round(self):
        result = self._resolve([
            CharacterActionInput(
                character_id=self.caster.id, kind="skill",
                skill_node_id=self.improve.id, target_character_id=self.target.id,
            ),
        ])
        target = next(p for p in result.participants if p["character_id"] == self.target.id)
        self.assertFalse(any(e.get("var_name") == "ab_improve" for e in target["status_effects"]))
        # 대상이 행동하지 않았으므로 임시 보정은 적용된 적이 없다.
        self.assertEqual(target["skill_eff_fixed"], 0.0)
        self.assertNotIn("_skill_eff_fixed_temp", target)

    def test_improve_cannot_target_the_caster(self):
        """개선은 자신을 제외한 아군에게만 건다."""
        result = self._resolve([CharacterActionInput(
            character_id=self.caster.id, kind="skill",
            skill_node_id=self.improve.id, target_character_id=self.caster.id,
        )])
        improve_event = next(e for e in result.log[-1]["events"] if e.startswith("📈"))
        # 자신을 지정해도 다른 아군에게 걸린다.
        self.assertIn(self.target.name, improve_event)
        self.assertNotIn(f"→ {self.caster.name}", improve_event)


if __name__ == "__main__":
    unittest.main()
