import unittest

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.game_data import skill_power_slots
from app.models import SkillNode
from app.schemas import SkillNodeUpdate


class SkillPowerUnitsTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite:///:memory:')
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.node = SkillNode(book='용맹의 서', branch=0, tier=1, default_name='강타', var_name='ab_strike', power=1.5)
        self.db.add(self.node)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_original_skills_default_to_percent(self):
        for var in ['ab_strike', 'ab_crushing', 'ab_harm', 'ab_anvil', 'ab_counter', 'ab_protect',
                    'ab_cure', 'ab_aid', 'ab_purification', 'ab_encourage', 'ab_curse']:
            with self.subTest(var=var):
                self.assertTrue(all(slot['unit'] == 'percent' for slot in skill_power_slots(var)))

    def test_unit_and_value_survive_reload_and_switch_back(self):
        for unit, value in [('flat', 150), ('percent', 1.5)]:
            crud.update_skill_node(self.db, self.node.id, SkillNodeUpdate(
                default_name='강타', power=value, power_units={'power': unit}))
            self.db.expire_all()
            result = crud._to_skill_node_read(self.node)
            self.assertEqual(result.power_slots[0].unit, unit)
            self.assertEqual(result.power, value)
            crud.update_skill_node(self.db, self.node.id, SkillNodeUpdate(default_name='이름 변경'))
            self.assertEqual(crud._to_skill_node_read(self.node).power_slots[0].unit, unit)

    def test_derived_slots_independent_and_depth_isolated(self):
        node, sibling = [SkillNode(book='용맹의 서', branch=0, col=1, tier=tier,
                                   default_name='주입', var_name='ab_enchant', power=2)
                         for tier in (2, 3)]
        self.db.add_all([node, sibling])
        self.db.commit()
        updated = crud.update_skill_node(self.db, node.id, SkillNodeUpdate(
            default_name=node.default_name, power=1.5, powers={'attack_buff': 3},
            power_units={'power': 'percent', 'attack_buff': 'flat'}))
        self.db.expire_all()
        reloaded = crud._to_skill_node_read(node)
        self.assertEqual([(s.key, s.unit) for s in reloaded.power_slots], [('power', 'percent'), ('attack_buff', 'flat')])
        self.assertEqual((updated.power, reloaded.power, reloaded.powers['attack_buff']), (1.5, 1.5, 3))
        self.assertTrue(all(s.unit == 'flat' for s in crud._to_skill_node_read(sibling).power_slots))

    def test_rejects_fractional_flat_and_unknown_slot(self):
        for data in [dict(power=1.5, power_units={'power': 'flat'}), dict(power_units={'missing': 'percent'})]:
            with self.subTest(data=data), self.assertRaises(HTTPException):
                crud.update_skill_node(self.db, self.node.id, SkillNodeUpdate(default_name='강타', **data))
            self.db.rollback()
        with self.assertRaises(ValidationError):
            SkillNodeUpdate(default_name='강타', power_units={'power': 'unknown'})
