import unittest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app import crud
from app.db import Base
from app.models import Character, Purchase, CharacterItemState
from app.schemas import ItemCreate


class AccessoryGradeChoiceTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite:///:memory:')
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.character = Character(name='장착자', stat_courage=1, stat_endurance=1, stat_charity=1, stat_wisdom=1)
        self.db.add(self.character)
        self.db.flush()
        self.items = []
        for count in (1, 2):
            item = crud.create_item(self.db, ItemCreate(name=f'반지{count}', price_gold=1,
                special_merchant=True, item_type='accessory', effects=[{'stat': f'grade_choice_{count}', 'delta': 0}]))
            self.db.add(Purchase(character_id=self.character.id, item_id=item.id, quantity=1))
            self.items.append(item)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_equip_replace_unequip_restores_grades_and_derived_stats(self):
        c = self.character
        original = (c.atk, c.hp_max, c.def_)
        crud.equip_item(self.db, c.id, self.items[0].id, ['stat_courage'])
        self.assertEqual(c.stat_courage, 2)
        crud.equip_item(self.db, c.id, self.items[1].id, ['stat_endurance', 'stat_wisdom'])
        self.assertEqual((c.stat_courage, c.stat_endurance, c.stat_wisdom), (1, 2, 2))
        crud.unequip_item(self.db, c.id, self.items[1].id)
        self.assertEqual((c.stat_courage, c.stat_endurance, c.stat_wisdom), (1, 1, 1))
        self.assertEqual((c.atk, c.hp_max, c.def_), original)

    def test_invalid_choice_and_delete_equipped_item(self):
        c = self.character
        for choices in ([], ['stat_courage'], ['stat_courage', 'stat_courage'], ['gold', 'stat_wisdom']):
            with self.assertRaises(HTTPException):
                crud.equip_item(self.db, c.id, self.items[1].id, choices)
        crud.equip_item(self.db, c.id, self.items[1].id, ['stat_courage', 'stat_charity'])
        self.db.expire_all()
        state = self.db.query(CharacterItemState).filter_by(item_id=self.items[1].id).one()
        self.assertEqual(state.chosen_stats, ['stat_courage', 'stat_charity'])
        crud.delete_item(self.db, self.items[1].id)
        self.assertEqual((c.stat_courage, c.stat_charity), (1, 1))
