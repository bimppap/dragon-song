import copy
import unittest
from unittest.mock import patch
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app import crud
from app.db import Base
from app.models import BattleSession, Character, CharacterSkillUnlock, SkillNode
from app.schemas import BattleAllyTurnRequest, CharacterActionInput, BattleTelegraphRequest, SkillNodeUpdate


class DevotionDerivedTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite:///:memory:')
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        crud.get_skill_nodes(self.db, '헌신의 서')
        self.caster = Character(name='시전자', faction='치유', hp=70, hp_max=100, mp=100, mp_max=100, skill_eff_true=12)
        self.ally = Character(name='아군', faction='공격', hp=50, hp_max=100)
        self.db.add_all([self.caster, self.ally])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def node(self, branch, tier=2):
        return self.db.query(SkillNode).filter_by(book='헌신의 서', branch=branch, col=1, tier=tier).one()

    def battle(self, node):
        self.db.add(CharacterSkillUnlock(character_id=self.caster.id, node_id=node.id))
        self.db.commit()
        battle = BattleSession(mode='practice', chapter='1장', status='in_progress', phase='ally', round=1,
            participants=[crud._snapshot_combatant(self.caster), crud._snapshot_combatant(self.ally)],
            enemies=[{'enemy_id': i, 'name': f'적{i}', 'hp': 1000, 'max_hp': 1000, 'attack': 0, 'skills': [], 'status_effects': [], 'joined_round': 0} for i in (1, 2)], summons=[], log=[])
        self.db.add(battle)
        self.db.commit()
        return battle

    def cast(self, battle, node):
        battle.phase = 'ally'
        self.db.commit()
        return crud.resolve_battle_ally_turn(self.db, battle.id, BattleAllyTurnRequest(character_actions=[
            CharacterActionInput(character_id=self.caster.id, kind='skill', skill_node_id=node.id, target_character_id=self.ally.id)
        ]))

    def test_regeneration_persists_replaces_and_has_formula(self):
        node = self.node(0)
        battle = self.battle(node)
        result = self.cast(battle, node)
        target = result.participants[1]
        self.assertEqual(target['hp_regen_true'], 7)
        event = next(e for e in result.log[-1]['events'] if '체력 재생력(고정)' in e)
        self.assertIn('12 / 4', result.log[-1]['calculations'][event])
        self.cast(battle, node)
        self.assertEqual(battle.participants[1]['hp_regen_true'], 7)
        battle.phase = 'telegraph'
        self.db.commit()
        result = crud.resolve_battle_telegraph(self.db, battle.id, BattleTelegraphRequest())
        self.assertEqual(result.participants[1]['hp'], 57)
        self.assertEqual(result.participants[1]['hp_regen_true'], 7)
        target = copy.deepcopy(result.participants[1])
        crud._remove_status_effects_by_affinity(target, 'buff', 1)
        self.assertEqual(target['hp_regen_true'], 0)

    def test_halo_heals_every_ally_and_records_each_formula(self):
        node = self.node(1)
        battle = self.battle(node)
        result = self.cast(battle, node)
        self.assertEqual([p['hp'] for p in result.participants], [77, 57])
        healing_events = [e for e in result.log[-1]['events'] if ' 치유' in e]
        self.assertEqual(len(healing_events), 2)
        for event in healing_events:
            self.assertIn('12 / 4', result.log[-1]['calculations'][event])

    def test_hex_uses_depth_and_actual_capped_healing_for_random_damage(self):
        node = self.node(2)
        self.ally.hp = 95
        self.caster.skill_eff_fixed = 0.5
        self.caster.heal_eff = 0.2
        self.db.commit()
        battle = self.battle(node)
        with patch('app.crud.random.choice', side_effect=lambda enemies: enemies[-1]):
            result = self.cast(battle, node)
        self.assertEqual(result.participants[1]['hp'], 100)
        self.assertEqual([e['hp'] for e in result.enemies], [1000, 995])
        heal_event = next(e for e in result.log[-1]['events'] if '5 치유' in e)
        damage_event = next(e for e in result.log[-1]['events'] if '5 피해' in e)
        self.assertIn('스킬레벨 2 × 0.15 + 0.10', result.log[-1]['calculations'][heal_event])
        self.assertIn('실제 회복량 5', result.log[-1]['calculations'][damage_event])

    def test_per_depth_power_only_and_legacy_placeholder_resolution(self):
        node = self.node(0, 4)
        updated = crud.update_skill_node(self.db, node.id, SkillNodeUpdate(default_name='임의 이름', description='임의 설명', power=10, target='SELF'))
        self.assertEqual((updated.default_name, updated.power, updated.target), ('재생', 10, '1'))
        self.assertIn('+10', updated.description)
        self.assertEqual(crud._to_skill_node_read(self.node(0, 2)).power, 4)
        hex_node = self.node(2, 5)
        updated = crud.update_skill_node(self.db, hex_node.id, SkillNodeUpdate(default_name='주술', power=0.99))
        self.assertEqual(updated.power, 0.15)
        self.assertIn('85%', updated.description)
        legacy = self.node(1)
        legacy.default_name = '헌혈'
        legacy.var_name = None
        legacy.power = 0
        self.db.commit()
        resolved = crud._to_skill_node_read(legacy)
        self.assertEqual((resolved.default_name, resolved.power), ('후광', 4))
