"""공격으로 얻는 주목도는 실제로 들어간 피해(쇠약 증폭 반영, 적 남은 체력까지)를 기준으로 한다."""
import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.models import BattleSession, Character, CharacterSkillUnlock, SkillNode
from app.schemas import BattleAllyTurnRequest, CharacterActionInput

# 용맹의 서: 0번 계열 강타·주입, 1번 계열 분쇄, 2번 계열 위해
DAMAGE_SKILLS = {
    "강타": dict(branch=0, col=0, var_name="ab_strike", power=1.0, target="3"),
    "주입": dict(branch=0, col=1, var_name="ab_enchant", power=2.0, target="1"),
    "분쇄": dict(branch=1, col=0, var_name="ab_crushing", power=1.0, target="3"),
    "위해": dict(branch=2, col=0, var_name="ab_harm", power=1.0, target="3"),
}


class AttackAttentionTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def resolve(self, *, skill=None, faction="공격", presence=0.0):
        """쇠약(받는 피해 +50%)이 걸린 E1과, 체력이 5뿐인 E2·E3를 상대로 한 번 행동한다."""
        character = Character(name="A", faction=faction, hp=100, hp_max=100, mp=50, mp_max=50, atk=100,
                              stat_charity=5, stat_wisdom=5, presence=presence)
        self.db.add(character)
        self.db.flush()
        node = None
        if skill:
            spec = DAMAGE_SKILLS[skill]
            node = SkillNode(book="용맹의 서", tier=2, default_name=skill, cost=1, target_side="ENEMY", is_public=True, **spec)
            self.db.add(node)
            self.db.flush()
            self.db.add(CharacterSkillUnlock(character_id=character.id, node_id=node.id))
        participant = crud._snapshot_combatant(character)
        participant.update(hp_regen_true=0, hp_regen_fixed=0.0, mp_regen=0)
        weaken = {"effect_type": "incoming_damage_bonus_round", "affinity": "debuff", "value": 0.5, "round": 1}
        enemies = [
            {"enemy_id": i, "name": f"E{i}", "hp": hp, "max_hp": 1000, "attack": 0, "skills": [],
             "status_effects": [weaken] if i == 1 else [], "joined_round": 0}
            for i, hp in ((1, 1000), (2, 5), (3, 5))
        ]
        battle = BattleSession(mode="practice", chapter="1장", status="in_progress", phase="ally", round=1,
                               participants=[participant], enemies=enemies, summons=[], pending_enemy_actions=[], log=[])
        self.db.add(battle)
        self.db.commit()
        action = CharacterActionInput(
            character_id=character.id, kind="skill" if node else "attack",
            skill_node_id=node.id if node else None, target_enemy_id=1,
        )
        result = crud.resolve_battle_ally_turn(self.db, battle.id, BattleAllyTurnRequest(character_actions=[action]))
        dealt = sum(before["hp"] - after["hp"] for before, after in zip(enemies, result.enemies))
        return dealt, result.participants[0]["attn"]

    def test_basic_attack_counts_weakened_damage(self):
        dealt, attn = self.resolve()
        self.assertEqual(dealt, 150)
        self.assertEqual(attn, 150)

    def test_damage_skills_count_only_damage_actually_dealt(self):
        for skill in DAMAGE_SKILLS:
            with self.subTest(skill=skill):
                dealt, attn = self.resolve(skill=skill)
                self.assertGreater(dealt, 0)
                self.assertEqual(attn, dealt)

    def test_defender_multiplier_and_presence_apply_to_dealt_damage(self):
        dealt, attn = self.resolve(skill="강타", faction="수비", presence=0.5)
        self.assertEqual(attn, crud._floor_amount(dealt * 4 * 1.5))


if __name__ == "__main__":
    unittest.main()
