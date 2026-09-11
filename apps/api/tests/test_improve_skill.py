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
            cost=2, power=0.10, target="1", target_side="ALLY", activation_order=1, is_public=True,
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
        self.assertIn("스킬레벨 2 × 기술 위력 0.1", calcs[improve_event])

        strike_event = next(e for e in events if e.startswith("✨ 검사의") and "허수아비" in e)
        # 강타는 기술 효율 고정을 쓰지 않으므로 비례 보정만 반영된다: floor(10 × (1.5 × (1 + 0.30))) = 19
        self.assertIn("19 피해", strike_event)

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


if __name__ == "__main__":
    unittest.main()
