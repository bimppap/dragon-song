import copy
import unittest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app import crud
from app.db import Base
from app.models import BattleSession, Character, CharacterSkillUnlock, SkillNode
from app.schemas import BattleAllyTurnRequest, CharacterActionInput


class EruptionSkillTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite:///:memory:')
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.caster = Character(name='시전자', hp=100, hp_max=100, mp=20, mp_max=20, skill_eff_true=7)
        self.ally = Character(name='아군', hp=100, hp_max=100)
        self.node = SkillNode(book='불굴의 서', branch=1, col=1, tier=2, default_name='분출', var_name='ab_eruption', trigger_type='지속형', category='강화', target='SELF', target_side='ALLY', stackable=True, cost=0, activation_order=4, is_public=True)
        self.db.add_all([self.caster, self.ally, self.node])
        self.db.flush()
        self.db.add(CharacterSkillUnlock(character_id=self.caster.id, node_id=self.node.id))
        self.db.commit()
        self.battle = BattleSession(mode='practice', chapter='1장', phase='ally', round=1,
            participants=[crud._snapshot_combatant(self.caster), crud._snapshot_combatant(self.ally)],
            enemies=[{'enemy_id': i, 'name': f'적{i}', 'hp': 1000, 'max_hp': 1000, 'attack': 10, 'skills': [{'name':'공격', 'skill_type':'지정 공격', 'target_count':1, 'damage_percent':100}], 'status_effects': [], 'joined_round':0} for i in (1,2)], summons=[], log=[])
        self.db.add(self.battle)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def cast(self):
        self.battle.phase = 'ally'
        self.db.commit()
        return crud.resolve_battle_ally_turn(self.db, self.battle.id, BattleAllyTurnRequest(character_actions=[CharacterActionInput(character_id=self.caster.id, kind='skill', skill_node_id=self.node.id)]))

    def hit(self, target_id=None, count=1):
        self.battle.phase = 'enemy'
        self.battle.pending_enemy_actions = [{'enemy_id':1, 'kind':'attack', 'skill_index':0, 'target_character_ids':[target_id or self.caster.id]} for _ in range(count)]
        self.db.commit()
        return crud.resolve_battle_enemy_turn(self.db, self.battle.id)

    def test_stacks_presence_and_each_hit_damages_all_enemies(self):
        self.cast()
        self.cast()
        self.assertAlmostEqual(self.battle.participants[0]['presence'], 0.4)
        result = self.hit(count=2)
        self.assertEqual([enemy['hp'] for enemy in result.enemies], [932, 932])
        self.assertEqual(len(result.participants[0]['status_effects']), 2)
        events = [e for e in result.log[-1]['events'] if '34 피해' in e]
        self.assertEqual(len(events), 4)
        for event in events:
            self.assertIn('스킬레벨 2 × 5 + 기술 효율 고정 7', result.log[-1]['calculations'][event])

    def test_unbuffed_target_does_not_trigger(self):
        self.cast()
        result = self.hit(self.ally.id)
        self.assertEqual([enemy['hp'] for enemy in result.enemies], [1000,1000])

    def test_shield_absorption_still_triggers_and_does_not_damage_minions(self):
        self.cast()
        party = copy.deepcopy(self.battle.participants)
        party[0]['shield'] = 100
        self.battle.participants = party
        self.battle.summons = [{'id':1, 'name':'하수인', 'hp':50, 'max_hp':50, 'attack':0, 'action_type':'buff', 'trigger_phase':'ally', 'trigger_round':99, 'spawn_round':0, 'effect_percent':0, 'buff_stat':'attack'}]
        self.db.commit()
        result = self.hit()
        self.assertEqual(result.participants[0]['hp'],100)
        self.assertEqual([enemy['hp'] for enemy in result.enemies], [983,983])
        self.assertEqual(result.summons[0]['hp'],50)

    def test_removing_one_stack_reverts_presence_and_reaction(self):
        self.cast()
        self.cast()
        party = copy.deepcopy(self.battle.participants)
        crud._remove_status_effects_by_affinity(party[0], 'buff', 1)
        self.battle.participants = party
        self.db.commit()
        result = self.hit()
        self.assertAlmostEqual(result.participants[0]['presence'],0.2)
        self.assertEqual([enemy['hp'] for enemy in result.enemies], [983,983])

    def test_fatal_hit_still_triggers_before_downing_clears_buffs(self):
        self.cast()
        party = copy.deepcopy(self.battle.participants)
        party[0]['hp'] = 1
        self.battle.participants = party
        self.db.commit()
        result = self.hit()
        self.assertTrue(result.participants[0]['downed'])
        self.assertEqual(result.participants[0]['status_effects'], [])
        self.assertEqual([enemy['hp'] for enemy in result.enemies], [983,983])

    def test_explosion_only_triggers_in_enemy_phase(self):
        self.cast()
        for phase in ('telegraph', 'ally', 'enemy'):
            with self.subTest(phase=phase):
                party = copy.deepcopy(self.battle.participants)
                enemies = copy.deepcopy(self.battle.enemies)
                minion = {'id': 1, 'name': '폭발 하수인', 'hp': 10, 'max_hp': 10, 'attack': 1, 'action_type': 'explosion', 'trigger_phase': phase}
                events, calculations = [], {}
                crud._apply_minion_phase(party, enemies, [minion], 1, phase, events, calculations)
                self.assertEqual([enemy['hp'] for enemy in enemies], [983, 983] if phase == 'enemy' else [1000, 1000])
                if phase == 'enemy':
                    self.assertEqual(len(calculations), 2)

    def test_reaction_uses_current_efficiency(self):
        self.cast()
        party = copy.deepcopy(self.battle.participants)
        party[0]['skill_eff_true'] = 17
        self.battle.participants = party
        self.db.commit()
        result = self.hit()
        self.assertEqual([enemy['hp'] for enemy in result.enemies], [973, 973])

    def test_buff_persists_across_rounds_until_battle_ends(self):
        """전투가 끝날 때까지 유지된다: 라운드가 넘어가고 아군 턴을 한 번 더 지나도 반응이 살아 있어야 한다."""
        self.cast()
        first = self.hit()
        self.assertEqual([enemy['hp'] for enemy in first.enemies], [983, 983])

        # 다음 라운드의 아군 턴(무반응)을 지나도 강화가 사라지면 안 된다.
        self.battle.phase = 'ally'
        self.battle.round = 2
        self.db.commit()
        crud.resolve_battle_ally_turn(self.db, self.battle.id, BattleAllyTurnRequest(character_actions=[
            CharacterActionInput(character_id=self.caster.id, kind='none'),
        ]))
        caster = next(p for p in self.battle.participants if p['character_id'] == self.caster.id)
        self.assertAlmostEqual(caster['presence'], 0.2)
        self.assertTrue(any(e.get('reaction') == 'eruption' for e in caster['status_effects']))

        second = self.hit()
        # 2라운드에도 같은 반응 피해가 다시 들어간다.
        self.assertEqual([enemy['hp'] for enemy in second.enemies], [966, 966])

    def test_weaken_amplifies_eruption_reaction_damage(self):
        """쇠약은 에너미 턴까지 유지되므로 분출 반응 피해도 증폭한다(쇠약 걸린 적만)."""
        weakener = Character(name='주술사', hp=100, hp_max=100, mp=20, mp_max=20, skill_eff_fixed=0.96)
        weaken_node = SkillNode(book='탐구의 서', branch=1, col=1, tier=2, default_name='쇠약',
                                var_name='ab_weaken', trigger_type='즉발형', category='약화',
                                target='1', target_side='ENEMY', stackable=True, cost=3,
                                activation_order=1, is_public=True)
        self.db.add_all([weakener, weaken_node])
        self.db.flush()
        self.db.add(CharacterSkillUnlock(character_id=weakener.id, node_id=weaken_node.id))
        participants = list(self.battle.participants)
        participants.append(crud._snapshot_combatant(weakener))
        self.battle.participants = participants
        self.battle.phase = 'ally'
        self.db.commit()

        crud.resolve_battle_ally_turn(self.db, self.battle.id, BattleAllyTurnRequest(character_actions=[
            CharacterActionInput(character_id=self.caster.id, kind='skill', skill_node_id=self.node.id),
            CharacterActionInput(character_id=weakener.id, kind='skill', skill_node_id=weaken_node.id, target_enemy_id=1),
        ]))
        result = self.hit()
        # 분출 1스택 = 스킬레벨 2 × 5 + 기술 효율 고정 7 = 17.
        # 쇠약(2 × 0.02 + 0.96 = 1.0)이 걸린 적1만 34, 적2는 그대로 17.
        self.assertEqual([enemy['hp'] for enemy in result.enemies], [966, 983])

    def test_eruption_replaces_counter_derived_path_only(self):
        from app.game_data import build_skill_node_specs
        specs = build_skill_node_specs('불굴의 서')
        for tier in range(2, 7):
            counter_path = next(node for node in specs if node['branch'] == 1 and node['col'] == 1 and node['tier'] == tier)
            self.assertEqual((counter_path['default_name'], counter_path['var_name'], counter_path['stackable']), ('분출', 'ab_eruption', True))
            anvil_path = next(node for node in specs if node['branch'] == 0 and node['col'] == 1 and node['tier'] == tier)
            self.assertNotEqual(anvil_path['var_name'], 'ab_eruption')
