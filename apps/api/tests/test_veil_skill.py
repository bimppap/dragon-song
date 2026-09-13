import unittest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app import crud
from app.db import Base
from app.models import BattleSession, Character, CharacterSkillUnlock, SkillNode
from app.schemas import BattleAllyTurnRequest, CharacterActionInput, SkillNodeUpdate


class VeilSkillTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite:///:memory:')
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        crud.get_skill_nodes(self.db, '불굴의 서')
        self.caster = Character(name='시전자', faction='수비', hp=100, hp_max=100, mp=20, mp_max=20, skill_eff_true=12)
        self.ally = Character(name='아군', hp=80, hp_max=100)
        self.db.add_all([self.caster, self.ally])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def cast(self, tier=2, hp=100, efficiency=0, fixed=12):
        node = self.db.query(SkillNode).filter_by(book='불굴의 서', branch=2, col=1, tier=tier).one()
        self.db.add(CharacterSkillUnlock(character_id=self.caster.id, node_id=node.id))
        self.db.commit()
        caster = crud._snapshot_combatant(self.caster)
        caster.update(hp=hp, skill_eff_fixed=efficiency, skill_eff_true=fixed, shield=9, dmg_r=0.99)
        battle = BattleSession(mode='practice', chapter='1장', phase='ally', round=1,
            participants=[caster, crud._snapshot_combatant(self.ally)],
            enemies=[{'enemy_id': 1, 'name': '적', 'hp': 1000, 'max_hp': 1000, 'attack': 0, 'skills': [], 'status_effects': []}], summons=[], log=[])
        self.db.add(battle)
        self.db.commit()
        return crud.resolve_battle_ally_turn(self.db, battle.id, BattleAllyTurnRequest(character_actions=[
            CharacterActionInput(character_id=self.caster.id, kind='skill', skill_node_id=node.id)
        ]))

    def test_depth_two_cost_bypasses_shield_and_grants_whole_party(self):
        result = self.cast()
        caster, ally = result.participants
        self.assertEqual((caster['hp'], caster['shield'], ally['shield']), (60, 17, 8))
        logs = result.log[-1]
        cost = next(event for event in logs['events'] if '40 체력 소모' in event)
        self.assertIn('스킬레벨 2 × 0.05', logs['calculations'][cost])
        shields = [event for event in logs['events'] if '8 보호막 부여' in event]
        self.assertEqual(len(shields), 2)
        for event in shields:
            self.assertIn('고정 12 / 2', logs['calculations'][event])

    def test_depth_three_and_fractional_efficiency(self):
        result = self.cast(tier=3, efficiency=0.1, fixed=5)
        self.assertEqual(result.participants[0]['hp'], 75)
        self.assertEqual(result.participants[1]['shield'], 5)

    def test_high_efficiency_never_heals_caster(self):
        result = self.cast(tier=6, efficiency=0.7)
        self.assertEqual(result.participants[0]['hp'], 100)
        self.assertEqual(result.participants[1]['shield'], 12)

    def test_insufficient_health_grants_no_shield_and_spends_no_mp(self):
        result = self.cast(hp=30)
        self.assertEqual((result.participants[0]['hp'], result.participants[0]['mp']), (30, 20))
        self.assertEqual(result.participants[1]['shield'], 0)
        self.assertTrue(any('체력 부족' in event for event in result.log[-1]['events']))

    def test_exact_health_cost_downs_caster_but_protects_ally(self):
        result = self.cast(hp=40)
        self.assertTrue(result.participants[0]['downed'])
        self.assertEqual(result.participants[0]['hp'], 0)
        self.assertEqual(result.participants[1]['shield'], 8)

    def test_legacy_node_syncs_to_spec_and_keeps_admin_name(self):
        node = self.db.query(SkillNode).filter_by(book='불굴의 서', branch=2, col=1, tier=4).one()
        node.var_name = None
        node.description = '이전 설명'
        node.power = 2
        self.db.commit()
        result = crud.update_skill_node(self.db, node.id, SkillNodeUpdate(default_name='다른 이름', power=99))
        # 관리자가 명시한 이름·위력은 저장하고, 나머지는 기존 스펙을 유지한다.
        self.assertEqual((result.default_name, result.power, result.target), ('다른 이름', 99, 'SELF'))
        self.assertIn('30%', result.description)
        self.assertIn('4 +', result.description)
        self.assertFalse(result.is_placeholder)

    def test_admin_description_overrides_auto_text_until_cleared(self):
        node = self.db.query(SkillNode).filter_by(book='불굴의 서', branch=2, col=1, tier=4).one()
        written = crud.update_skill_node(self.db, node.id, SkillNodeUpdate(default_name='장막', description="'장막'이 펼쳐진다"))
        self.assertEqual(written.description, "'장막'이 펼쳐진다")
        cleared = crud.update_skill_node(self.db, node.id, SkillNodeUpdate(default_name='장막', description=''))
        self.assertIn('30%', cleared.description)

    def test_admin_can_set_target_cost_and_category(self):
        node = self.db.query(SkillNode).filter_by(book='불굴의 서', branch=2, col=1, tier=4).one()
        result = crud.update_skill_node(self.db, node.id, SkillNodeUpdate(
            default_name='장막', target='3', target_side='ALLY', activation_order=7, cost=9, category='피해',
        ))
        self.assertEqual((result.target, result.target_side, result.activation_order, result.cost), ('3', 'ALLY', 7, 9))
        self.assertEqual(result.category, "피해")
