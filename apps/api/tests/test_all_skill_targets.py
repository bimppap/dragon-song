import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.models import BattleSession, Character, CharacterSkillUnlock, SkillNode
from app.schemas import ALL_SKILL_TARGETS, BattleAllyTurnRequest, CharacterActionInput, SkillNodeUpdate


class AllSkillTargetsTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite:///:memory:')
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.caster = Character(name='시전자', faction='공격', hp=50, hp_max=100,
                                mp=100, mp_max=100, atk=10)
        self.ally = Character(name='아군', faction='공격', hp=50, hp_max=100)
        self.db.add_all([self.caster, self.ally])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def cast(self, scope, var_name='ab_strike'):
        node = SkillNode(book='용맹의 서', branch=0, col=None, tier=1,
                         default_name='전체 기술', var_name=var_name, cost=3, power=1,
                         target=scope, target_side=ALL_SKILL_TARGETS[scope],
                         category='피해' if var_name == 'ab_strike' else '강화',
                         trigger_type='즉발형', is_public=True)
        self.db.add(node)
        self.db.flush()
        self.db.add(CharacterSkillUnlock(character_id=self.caster.id, node_id=node.id))
        enemies = [dict(enemy_id=i, name=f'적{i}', hp=1000, max_hp=1000,
                        attack=0, skills=[], status_effects=[], joined_round=0) for i in (1, 2)]
        battle = BattleSession(mode='practice', chapter='1장', status='in_progress', phase='ally', round=1,
                               participants=[crud._snapshot_combatant(p) for p in (self.caster, self.ally)],
                               enemies=enemies, summons=[dict(id=1, name='하수인', hp=1000, max_hp=1000,
                                                              attack=0, status_effects=[])], log=[])
        self.db.add(battle)
        self.db.commit()
        return crud.resolve_battle_ally_turn(self.db, battle.id, BattleAllyTurnRequest(character_actions=[
            CharacterActionInput(character_id=self.caster.id, kind='skill', skill_node_id=node.id,
                                 skill_target_keys=['enemy:999'])  # stale draft selections must be ignored
        ]))

    def test_schema_accepts_scopes_and_aligns_side(self):
        for scope, side in ALL_SKILL_TARGETS.items():
            update = SkillNodeUpdate(default_name='기술', target=scope, target_side='ENEMY' if side == 'ALLY' else 'ALLY')
            self.assertEqual(update.target, scope)
            self.assertEqual(update.target_side, side)

    def test_all_enemies_bypasses_summons_and_charges_once(self):
        result = self.cast('에너미 전원')
        self.assertTrue(all(enemy['hp'] < 1000 for enemy in result.enemies))
        self.assertEqual(result.summons[0]['hp'], 1000)
        self.assertEqual(result.participants[0]['mp'], 97)

    def test_all_enemies_and_summons_hits_both_groups(self):
        result = self.cast('에너미+하수인 전원')
        self.assertTrue(all(enemy['hp'] < 1000 for enemy in result.enemies))
        self.assertLess(result.summons[0]['hp'], 1000)
        self.assertEqual(result.participants[0]['mp'], 97)

    def test_all_allies_includes_caster_and_other_allies(self):
        result = self.cast('아군 전원', 'ab_counter')
        self.assertTrue(all(any(e['effect_type'] == 'counter' for e in p['status_effects'])
                            for p in result.participants))
        self.assertTrue(all(not e['status_effects'] for e in result.enemies))

    def test_all_allies_heal_includes_self_targeted_skill(self):
        result = self.cast('아군 전원', 'ab_anvil')
        self.assertTrue(all(p['hp'] > 50 for p in result.participants))

    def test_nonstacking_debuff_reaches_enemies_and_summon(self):
        result = self.cast('에너미+하수인 전원', 'ab_curse')
        self.assertTrue(all(any(e['var_name'] == 'ab_curse' for e in target['status_effects'])
                            for target in [*result.enemies, *result.summons]))

    def test_scope_persists_through_admin_update(self):
        node = SkillNode(book='용맹의 서', branch=0, col=None, tier=1, default_name='기술')
        self.db.add(node)
        self.db.commit()
        for scope, side in ALL_SKILL_TARGETS.items():
            with self.subTest(scope=scope):
                crud.update_skill_node(self.db, node.id, SkillNodeUpdate(default_name='기술', target=scope))
                self.db.expire_all()
                self.assertEqual((node.target, node.target_side), (scope, side))

    def test_delayed_damage_preserves_enemy_only_scope(self):
        caster = crud._snapshot_combatant(self.caster)
        caster['status_effects'] = [dict(effect_type='sparge_telegraph', damage=10,
                                         skill_lv=2, target_scope='에너미 전원')]
        enemies = [dict(enemy_id=1, name='적', hp=100, max_hp=100, joined_round=0)]
        summons = [dict(id=1, name='하수인', hp=100, max_hp=100)]
        crud._apply_sparge_telegraph([caster], enemies, summons, 2, [], {})
        self.assertEqual(enemies[0]['hp'], 90)
        self.assertEqual(summons[0]['hp'], 100)

    def test_scope_uses_current_eligibility(self):
        actors = [crud._snapshot_combatant(p) for p in (self.caster, self.ally)]
        actors[1]['retreated'] = True
        self.assertEqual([t['character_id'] for _, t in crud._all_skill_targets(
            {'target': '아군 전원'}, actors, [], [], 1)], [self.caster.id])
        enemies = [dict(enemy_id=1, hp=0, joined_round=0), dict(enemy_id=2, hp=10, joined_round=1),
                   dict(enemy_id=3, hp=10, joined_round=0)]
        targets = crud._all_skill_targets({'target': '에너미+하수인 전원'}, [], enemies,
                                         [dict(id=1, hp=0), dict(id=2, hp=10)], 1)
        self.assertEqual([(kind, t.get('enemy_id', t.get('id'))) for kind, t in targets], [('enemy', 3), ('summon', 2)])
