"""장신구 강화 아이템을 쓰면 "성장의 목걸이"와 강화 아이템이 사라지고 지정한 아이템을 받는지 검증한다."""
import unittest

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.models import Character, Purchase
from app.schemas import ItemCreate


class AccessoryUpgradeItemTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.character = Character(name="러너", hp=100, hp_max=100, atk=10)
        self.db.add(self.character)
        self.db.flush()
        self.necklace = crud.create_item(self.db, ItemCreate(
            name=crud.GROWTH_NECKLACE_NAME, price_gold=1, special_merchant=True, item_type="accessory",
            effects=[{"stat": "atk", "delta": 5}]))
        self.upgraded = crud.create_item(self.db, ItemCreate(
            name="성장한 목걸이", price_gold=1, special_merchant=True, item_type="accessory",
            effects=[{"stat": "atk", "delta": 10}]))
        self.stone = crud.create_item(self.db, ItemCreate(
            name="강화석", price_gold=1,
            effects=[{"stat": "accessory_upgrade", "delta": 0, "item_id": self.upgraded.id}]))
        self.db.add(Purchase(character_id=self.character.id, item_id=self.stone.id, quantity=1))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def owned(self, item_id):
        return crud._sum_quantity(self.db, item_id, self.character.id)

    def give_necklace(self):
        self.db.add(Purchase(character_id=self.character.id, item_id=self.necklace.id, quantity=1))
        self.db.commit()

    def test_upgrade_swaps_the_necklace_for_the_chosen_item(self):
        self.give_necklace()
        crud.use_item(self.db, self.character.id, self.stone.id)
        self.assertEqual((self.owned(self.necklace.id), self.owned(self.upgraded.id)), (0, 1))
        owned_ids = {item.item_id for item in crud.get_character_detail(self.db, self.character.id).owned_items}
        self.assertEqual(owned_ids, {self.upgraded.id})

    def test_equipped_necklace_is_unequipped_before_it_is_given_up(self):
        self.give_necklace()
        crud.equip_item(self.db, self.character.id, self.necklace.id)
        self.assertEqual(self.character.atk, 15)
        crud.use_item(self.db, self.character.id, self.stone.id)
        self.assertEqual(self.character.atk, 10)
        self.assertFalse(crud._get_or_create_item_state(self.db, self.character.id, self.necklace.id).equipped)

    def test_item_is_kept_without_a_necklace(self):
        with self.assertRaises(HTTPException):
            crud.use_item(self.db, self.character.id, self.stone.id)
        self.assertEqual(self.owned(self.upgraded.id), 0)
        self.assertEqual(crud._get_or_create_item_state(self.db, self.character.id, self.stone.id).used_quantity, 0)

    def test_effect_requires_an_existing_reward_item(self):
        with self.assertRaises(ValidationError):
            ItemCreate(name="빈 강화석", price_gold=1, effects=[{"stat": "accessory_upgrade", "delta": 0}])
        with self.assertRaises(HTTPException):
            crud.create_item(self.db, ItemCreate(name="없는 강화석", price_gold=1,
                effects=[{"stat": "accessory_upgrade", "delta": 0, "item_id": 9999}]))

    def test_reward_item_id_is_stored_only_for_the_upgrade_effect(self):
        self.assertEqual(self.stone.effects, [{"stat": "accessory_upgrade", "delta": 0.0, "chapter": None, "item_id": self.upgraded.id}])
        self.assertEqual(self.necklace.effects, [{"stat": "atk", "delta": 5.0, "chapter": None}])


if __name__ == "__main__":
    unittest.main()
