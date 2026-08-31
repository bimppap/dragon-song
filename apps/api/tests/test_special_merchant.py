"""Special merchant presentation and independent equipment slots, using an isolated DB."""
import unittest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from app import crud
from app.db import Base
from app.models import Character, CharacterItemState, Item, Purchase
from app.schemas import ItemCreate


class SpecialMerchantTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.character = Character(name="buyer", atk=10)
        self.other = Character(name="other")
        self.db.add_all([self.character, self.other])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def item(self, kind="companion", delta=2, owned=True):
        item = crud.create_item(self.db, ItemCreate(
            name="gift", price_gold=10, item_type=kind, special_merchant=True,
            description_user="wrapped", description_after_purchase="revealed",
            effects=[{"stat": "atk", "delta": delta}],
        ))
        item.image_url = "before.webp"
        item.image_after_purchase_url = "after.webp"
        if owned:
            self.db.add(Purchase(character_id=self.character.id, item_id=item.id, quantity=1))
        self.db.commit()
        return item

    def test_independent_slots_replace_and_remove_effects(self):
        first = self.item(delta=2)
        second = self.item(delta=5)
        accessory = self.item(kind="accessory", delta=7)
        crud.equip_item(self.db, self.character.id, first.id)
        crud.equip_item(self.db, self.character.id, accessory.id)
        self.assertEqual(self.character.atk, 19)
        detail = crud.equip_item(self.db, self.character.id, second.id)
        self.assertEqual(detail.atk, 22)
        self.assertEqual({i.item_id for i in detail.owned_items if i.equipped}, {second.id, accessory.id})
        with self.assertRaises(HTTPException):
            crud.equip_item(self.db, self.character.id, second.id)
        self.assertEqual(self.character.atk, 22)
        crud.unequip_item(self.db, self.character.id, second.id)
        self.assertEqual(self.character.atk, 17)
        crud.unequip_item(self.db, self.character.id, accessory.id)
        self.assertEqual(self.character.atk, 10)

    def test_unowned_and_consumable_cannot_be_equipped(self):
        item = self.item(owned=False)
        with self.assertRaises(HTTPException):
            crud.equip_item(self.db, self.character.id, item.id)
        self.assertEqual(self.character.atk, 10)
        self.assertEqual(self.db.query(CharacterItemState).count(), 0)
        with self.assertRaises(HTTPException):
            crud.use_item(self.db, self.character.id, item.id)

    def test_presentation_before_after_and_admin(self):
        item = self.item()
        before = crud.get_items_with_stock(self.db, self.other.id, admin=False)[0]
        self.assertEqual((before.description_user, before.image_url), ("wrapped", "before.webp"))
        self.assertEqual(before.description_after_purchase, "")
        self.assertIsNone(before.image_after_purchase_url)
        after = crud.get_items_with_stock(self.db, self.character.id, admin=False)[0]
        self.assertEqual((after.description_user, after.image_url), ("revealed", "after.webp"))
        admin = crud.get_items_with_stock(self.db, admin=True)[0]
        self.assertEqual(admin.description_user, "wrapped")
        self.assertEqual(admin.description_after_purchase, "revealed")
        self.assertEqual(admin.image_after_purchase_url, "after.webp")
        owned = crud.get_character_detail(self.db, self.character.id).owned_items[0]
        self.assertEqual(owned.item_id, item.id)
        self.assertEqual((owned.item_description, owned.item_image_url), ("revealed", "after.webp"))

    def test_invalid_special_merchant_configuration(self):
        for kind in ("equipment", "consumable"):
            with self.assertRaises(ValidationError):
                ItemCreate(name="invalid", price_gold=10, item_type=kind, special_merchant=True)
        with self.assertRaises(ValidationError):
            ItemCreate(name="invalid", price_gold=10, item_type="companion", effects=[{"stat": "ap_reset", "delta": 1}])

    def test_delete_restores_equipped_effects_and_returns_both_images(self):
        item = self.item()
        crud.equip_item(self.db, self.character.id, item.id)
        self.assertEqual(set(crud.delete_item(self.db, item.id)), {"before.webp", "after.webp"})
        self.assertEqual(self.character.atk, 10)
        self.assertEqual(self.db.query(CharacterItemState).count(), 0)

    def test_cannot_change_equipped_category_or_effects(self):
        item = self.item()
        crud.equip_item(self.db, self.character.id, item.id)
        with self.assertRaises(HTTPException):
            crud.update_item(self.db, item.id, ItemCreate(name="gift", price_gold=10, item_type="accessory"))
        self.assertEqual(self.character.atk, 12)

    def test_migration_preserves_existing_items_and_is_idempotent(self):
        from app.migrations import ensure_schema
        ordinary = Item(name="ordinary", price_gold=3)
        self.db.add(ordinary)
        self.db.commit()
        item_id = ordinary.id
        self.db.close()
        with self.engine.begin() as connection:
            for column in ("special_merchant", "description_after_purchase", "image_after_purchase_url"):
                connection.execute(text(f"ALTER TABLE items DROP COLUMN {column}"))
        ensure_schema(self.engine)
        ensure_schema(self.engine)
        with Session(self.engine) as session:
            saved = session.get(Item, item_id)
            self.assertEqual(saved.name, "ordinary")
            self.assertFalse(saved.special_merchant)
            self.assertEqual(saved.description_after_purchase, "")
            self.assertIsNone(saved.image_after_purchase_url)
