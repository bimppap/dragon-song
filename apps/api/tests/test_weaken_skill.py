import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.models import BattleSession, Character, CharacterSkillUnlock, SkillNode
from app.schemas import BattleAllyTurnRequest, CharacterActionInput


class WeakenSkillTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

        self.caster = Character(
            name="주술사", faction="치유", hp=100, hp_max=100, mp=10, mp_max=10, skill_eff_fixed=0.1,
        )
        self.attacker = Character(
            name="검사", faction="공격", hp=100, hp_max=100, atk=10, atk_p=0.0, mp=10, mp_max=10,
        )
        self.db.add_all([self.caster, self.attacker])
        self.db.flush()

        # 쇠약: 탐구의 서 파생(col 1), depth 2 → skill_lv=2, 기술 위력 2%.
        self.weaken = SkillNode(
            book="탐구의 서", branch=1, col=1, tier=2, default_name="쇠약 II",
            trigger_type="즉발형", category="약화", stackable=True, var_name="ab_weaken",
            cost=3, power=0.02, target="1", target_side="ENEMY", activation_order=1, is_public=True,
        )
        self.db.add(self.weaken)
        self.db.flush()
        self.db.add(CharacterSkillUnlock(character_id=self.caster.id, node_id=self.weaken.id))

        self.battle = BattleSession(
            mode="practice", chapter="1장", status="in_progress", phase="ally", round=1,
            participants=[
                crud._snapshot_combatant(self.caster),
                crud._snapshot_combatant(self.attacker),
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

    def _weaken_action(self):
        return CharacterActionInput(
            character_id=self.caster.id, kind="skill",
            skill_node_id=self.weaken.id, target_enemy_id=1,
        )

    def test_weaken_amplifies_ally_damage_same_round(self):
        result = self._resolve([
            self._weaken_action(),
            CharacterActionInput(character_id=self.attacker.id, kind="attack", target_enemy_id=1),
        ])
        events = result.log[-1]["events"]
        calcs = result.log[-1]["calculations"]

        weaken_event = next(e for e in events if e.startswith("🩸 주술사의 쇠약 II → 허수아비"))
        # 받는 피해 증가 = skill_lv 2 × 0.02 + 시전자 0.1 = 0.14 → +14%
        self.assertIn("받는 피해 +14%", weaken_event)

        attack_event = next(e for e in events if e.startswith("⚔️ 검사 공격:"))
        # 기본 피해 10 → floor(10 × (1 + 0.14)) = 11
        self.assertIn("11 피해", attack_event)
        self.assertIn("받는 피해 증가 0.14", calcs[attack_event])

    def test_weaken_amplifies_hex_heal_enemy_damage(self):
        """주술(회복량만큼 무작위 적 피해)처럼 아군 턴의 다른 피해원도 쇠약 증폭을 받아야 한다."""
        from unittest.mock import patch
        from app.models import SkillNode as Node

        crud.get_skill_nodes(self.db, "헌신의 서")
        hex_node = (
            self.db.query(Node)
            .filter_by(book="헌신의 서", branch=2, col=1, tier=2)
            .one()
        )
        healer = Character(
            name="주술사2", faction="치유", hp=100, hp_max=100, mp=20, mp_max=20,
            skill_eff_fixed=0.0, skill_eff_true=0, heal_eff=0.0,
        )
        wounded = Character(name="환자", faction="공격", hp=1, hp_max=100)
        self.db.add_all([healer, wounded])
        self.db.flush()
        self.db.add(CharacterSkillUnlock(character_id=healer.id, node_id=hex_node.id))

        participants = list(self.battle.participants)
        participants.extend([crud._snapshot_combatant(healer), crud._snapshot_combatant(wounded)])
        self.battle.participants = participants
        self.db.commit()

        with patch("app.crud.random.choice", side_effect=lambda enemies: enemies[0]):
            result = self._resolve([
                self._weaken_action(),
                CharacterActionInput(
                    character_id=healer.id, kind="skill",
                    skill_node_id=hex_node.id, target_character_id=wounded.id,
                ),
            ])

        events = result.log[-1]["events"]
        hex_event = next(e for e in events if e.startswith("🔮 주술사2의"))
        # 회복량 40(최대 체력 100 × (스킬레벨 2 × 15% + 10%))에 쇠약 14%가 곱해진다.
        self.assertIn("45 피해", hex_event)
        self.assertIn("받는 피해 증가 0.14", result.log[-1]["calculations"][hex_event])

    def _add_curser(self):
        curser = Character(name="저주술사", faction="치유", hp=100, hp_max=100, mp=10, mp_max=10, skill_eff_fixed=0.0)
        curse = SkillNode(
            book="탐구의 서", branch=1, col=0, tier=1, default_name="저주 I",
            trigger_type="즉발형", category="약화", stackable=False, var_name="ab_curse",
            cost=3, power=0.5, target="1", target_side="ENEMY", activation_order=3, is_public=True,
        )
        self.db.add_all([curser, curse])
        self.db.flush()
        self.db.add(CharacterSkillUnlock(character_id=curser.id, node_id=curse.id))
        self.battle.participants = [*self.battle.participants, crud._snapshot_combatant(curser)]
        self.db.commit()
        return CharacterActionInput(character_id=curser.id, kind="skill", skill_node_id=curse.id, target_enemy_id=1)

    def test_curse_increases_ally_damage_taken_this_round(self):
        curse_action = self._add_curser()
        result = self._resolve([
            curse_action,
            CharacterActionInput(character_id=self.attacker.id, kind="attack", target_enemy_id=1),
        ])
        events = result.log[-1]["events"]
        calcs = result.log[-1]["calculations"]

        curse_event = next(e for e in events if e.startswith("🔮 저주술사의 저주 I → 허수아비"))
        self.assertIn("받는 데미지 +50%", curse_event)
        attack_event = next(e for e in events if e.startswith("⚔️ 검사 공격:"))
        # 기본 피해 10 → floor(10 × (1 + 0.5)) = 15
        self.assertIn("15 피해", attack_event)
        self.assertIn("받는 피해 증가 0.5", calcs[attack_event])

        self.battle.phase = "enemy"
        self.battle.pending_enemy_actions = []
        self.db.commit()
        after_enemy_turn = crud.resolve_battle_enemy_turn(self.db, self.battle.id)
        self.assertFalse(any(
            effect.get("var_name") == "ab_curse" for effect in after_enemy_turn.enemies[0]["status_effects"]
        ))

    def test_curse_and_weaken_bonuses_are_summed(self):
        curse_action = self._add_curser()
        result = self._resolve([
            curse_action,
            self._weaken_action(),
            CharacterActionInput(character_id=self.attacker.id, kind="attack", target_enemy_id=1),
        ])
        attack_event = next(e for e in result.log[-1]["events"] if e.startswith("⚔️ 검사 공격:"))
        # 저주 0.5 + 쇠약 0.14 = 0.64 → floor(10 × 1.64) = 16 (곱연산이면 17)
        self.assertIn("16 피해", attack_event)
        self.assertIn("받는 피해 증가 0.64", result.log[-1]["calculations"][attack_event])

    def test_weaken_survives_ally_turn_and_expires_after_enemy_turn(self):
        """분출 반응·반격 피해까지 증폭해야 하므로 쇠약은 에너미 턴이 끝날 때 소멸한다."""
        result = self._resolve([
            self._weaken_action(),
            CharacterActionInput(character_id=self.attacker.id, kind="attack", target_enemy_id=1),
        ])
        # 아군 턴이 끝나도 적에게 남아 있어야 한다.
        self.assertTrue(any(
            effect.get("effect_type") == "incoming_damage_bonus_round"
            for effect in result.enemies[0]["status_effects"]
        ))

        self.battle.phase = "enemy"
        self.battle.pending_enemy_actions = []
        self.db.commit()
        after_enemy_turn = crud.resolve_battle_enemy_turn(self.db, self.battle.id)
        self.assertFalse(any(
            effect.get("effect_type") == "incoming_damage_bonus_round"
            for effect in after_enemy_turn.enemies[0]["status_effects"]
        ))


if __name__ == "__main__":
    unittest.main()
