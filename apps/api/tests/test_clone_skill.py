import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.models import BattleSession, Character, CharacterSkillUnlock, SkillNode
from app.schemas import (
    BattleAllyTurnRequest,
    CharacterActionInput,
    ClonedSkillSlotInput,
)


class CloneSkillTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

        # 복제 시전자: 기술 효율 0, 공격력 10.
        self.cloner = Character(
            name="복제가", faction="공격", hp=100, hp_max=100, atk=100, atk_p=0.0,
            mp=10, mp_max=10, skill_eff_fixed=0.0, skill_eff_true=0,
        )
        # 원본 기술 보유자.
        self.source = Character(
            name="검사", faction="공격", hp=100, hp_max=100, atk=99, mp=10, mp_max=10,
        )
        self.db.add_all([self.cloner, self.source])
        self.db.flush()

        # 복제: 탐구의 서 세 번째 계열 파생(branch 2, col 1), depth 2 → 슬롯 2칸.
        self.clone = SkillNode(
            book="탐구의 서", branch=2, col=1, tier=2, default_name="복제 II",
            trigger_type="즉발형", category="복합", stackable=False, var_name="ab_clone",
            cost=4, target_side="ALLY", is_public=True,
        )
        self.strike = SkillNode(
            book="용맹의 서", branch=0, col=None, tier=1, default_name="강타 I",
            trigger_type="즉발형", category="피해", stackable=False, var_name="ab_strike",
            cost=3, power=1.5, target="1", target_side="ENEMY", activation_order=6, is_public=True,
        )
        self.db.add_all([self.clone, self.strike])
        self.db.flush()
        self.db.add_all([
            CharacterSkillUnlock(character_id=self.cloner.id, node_id=self.clone.id),
            CharacterSkillUnlock(character_id=self.source.id, node_id=self.strike.id),
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def _store_slot(self):
        return crud.set_character_cloned_skills(self.db, self.cloner.id, [
            ClonedSkillSlotInput(
                slot_index=0,
                source_character_id=self.source.id,
                source_node_id=self.strike.id,
            ),
        ])

    def _make_battle(self):
        battle = BattleSession(
            mode="practice", chapter="1장", status="in_progress", phase="ally", round=1,
            participants=[crud._snapshot_combatant(self.cloner)],
            enemies=[{
                "enemy_id": 1, "name": "허수아비", "hp": 2500, "max_hp": 2500,
                "attack": 0, "skills": [], "status_effects": [], "joined_round": 0,
            }],
            summons=[], log=[],
        )
        self.db.add(battle)
        self.db.commit()
        return battle

    def test_slot_count_follows_clone_depth(self):
        result = crud.get_character_cloned_skills(self.db, self.cloner.id)
        # depth 2 → 슬롯 2칸.
        self.assertEqual(result["slot_count"], 2)
        self.assertEqual(result["slots"], [])

    def test_store_and_read_back_slot(self):
        result = self._store_slot()
        self.assertEqual(len(result["slots"]), 1)
        slot = result["slots"][0]
        self.assertEqual(slot["source_character_name"], "검사")
        self.assertEqual(slot["display_name"], "강타 I")

    def test_cannot_clone_own_skill(self):
        with self.assertRaises(Exception):
            crud.set_character_cloned_skills(self.db, self.cloner.id, [
                ClonedSkillSlotInput(
                    slot_index=0,
                    source_character_id=self.cloner.id,
                    source_node_id=self.clone.id,
                ),
            ])

    def test_clone_appears_as_battle_action(self):
        self._store_slot()
        skills = crud._query_active_battle_skills_by_character(self.db, [self.cloner.id])
        entries = list(skills[self.cloner.id].values())
        # 복제 노드 자체는 사라지고, 저장한 기술이 "복제:기술명"으로 대체된다.
        self.assertEqual(len(entries), 1)
        entry = entries[0]
        self.assertEqual(entry["display_name"], "복제:강타 I")
        self.assertEqual(entry["var_name"], "ab_strike")
        self.assertEqual(entry["cost"], 4)

    def test_cloned_skill_uses_source_formula_with_eff_penalty(self):
        self._store_slot()
        battle = self._make_battle()
        skills = crud._query_active_battle_skills_by_character(self.db, [self.cloner.id])
        clone_skill_id = next(iter(skills[self.cloner.id]))

        result = crud.resolve_battle_ally_turn(
            self.db, battle.id,
            BattleAllyTurnRequest(character_actions=[
                CharacterActionInput(
                    character_id=self.cloner.id, kind="skill",
                    skill_node_id=clone_skill_id, target_enemy_id=1,
                ),
            ]),
        )
        events = result.log[-1]["events"]
        strike_event = next(e for e in events if e.startswith("✨ 복제가의 복제:강타 I"))
        # depth 2 → 기술 효율(비례) -50% + 10%×2 = -0.30, 기술 효율(고정) -20 + 4×2 = -12.
        # 강타는 기술 효율 고정을 계산에 쓰지 않는다: 100 × (1.5 × (1 - 0.3)) = 104.99999999999999 → 내림 104.
        # (부동소수 오차로 인한 내림은 엔진의 기존 _floor_amount 동작 그대로다.)
        self.assertIn("104 피해", strike_event)
        self.assertIn("기술 효율 비례 -0.3", result.log[-1]["calculations"][strike_event])
        self.assertNotIn("기술 효율 고정", result.log[-1]["calculations"][strike_event])
        # 기술 비용은 depth와 무관하게 4다.
        actor = next(p for p in result.participants if p["character_id"] == self.cloner.id)
        self.assertEqual(actor["mp"], 6)
        # 임시 기술 효율 보정은 라운드 종료 후 남지 않는다.
        self.assertEqual(actor["skill_eff_fixed"], 0.0)
        self.assertEqual(actor["skill_eff_true"], 0)


if __name__ == "__main__":
    unittest.main()
