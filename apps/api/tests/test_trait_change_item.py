"""한 번 장착한 특성은 바꾸거나 해제할 수 없고, "개성의 시약"을 쓰면 특성이 해제되어
빈 슬롯에 다시 한 번 고를 수 있음을 검증한다."""
import unittest

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

from app import crud, trait_effects as effects
from app.db import Base
from app.migrations import ensure_schema
from app.models import Character, Purchase
from app.schemas import ItemCreate, TraitCreate


class TraitChangeItemTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.character = Character(name="러너", hp=100, hp_max=100)
        self.db.add(self.character)
        self.db.flush()
        self.first = self.make_trait("첫 특성")
        self.second = self.make_trait("둘째 특성")
        self.reagent = crud.create_item(self.db, ItemCreate(
            name="개성의 시약", price_gold=1, effects=[{"stat": "trait_change", "delta": 0}]))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def make_trait(self, name):
        return crud.create_trait(self.db, TraitCreate(name=name, rules=effects.default_rules("standard")))

    def give_reagent(self, quantity=1):
        self.db.add(Purchase(character_id=self.character.id, item_id=self.reagent.id, quantity=quantity))
        self.db.commit()

    def test_equipped_trait_cannot_be_changed_or_unequipped(self):
        detail = crud.equip_trait(self.db, self.character.id, self.first.id)
        self.assertEqual(detail.trait_id, self.first.id)

        for trait_id in (self.second.id, None):
            with self.subTest(trait_id=trait_id), self.assertRaises(HTTPException):
                crud.equip_trait(self.db, self.character.id, trait_id)
        self.assertEqual(self.db.get(Character, self.character.id).trait_id, self.first.id)

        # 같은 특성을 다시 장착하는 요청은 바뀌는 것이 없으므로 막지 않는다.
        self.assertEqual(crud.equip_trait(self.db, self.character.id, self.first.id).trait_id, self.first.id)

    def test_reagent_unequips_the_trait_and_allows_one_more_pick(self):
        crud.equip_trait(self.db, self.character.id, self.first.id)
        self.give_reagent()
        detail = crud.use_item(self.db, self.character.id, self.reagent.id)
        self.assertIsNone(detail.trait_id)

        detail = crud.equip_trait(self.db, self.character.id, self.second.id)
        self.assertEqual(detail.trait_id, self.second.id)
        with self.assertRaises(HTTPException):  # 다시 고른 뒤에는 시약을 또 쓰기 전까지 잠긴다.
            crud.equip_trait(self.db, self.character.id, self.first.id)

    def test_reagent_is_kept_when_no_trait_is_equipped(self):
        self.give_reagent()
        with self.assertRaises(HTTPException):
            crud.use_item(self.db, self.character.id, self.reagent.id)
        owned = next(item for item in crud.get_character_detail(self.db, self.character.id).owned_items
                     if item.item_id == self.reagent.id)
        self.assertEqual(owned.used_quantity, 0)

    def test_admin_changes_and_unequips_without_a_reagent(self):
        crud.equip_trait(self.db, self.character.id, self.first.id)
        detail = crud.equip_trait(self.db, self.character.id, self.second.id, locked=False)
        self.assertEqual(detail.trait_id, self.second.id)
        self.assertIsNone(crud.equip_trait(self.db, self.character.id, None, locked=False).trait_id)

    def test_unused_legacy_tickets_become_an_unequipped_slot(self):
        """예전 교체권을 쓰지 않고 남긴 캐릭터는 시약을 쓴 것처럼 특성이 해제되고, 교체권 컬럼은 지워진다."""
        holder = Character(name="교체권 보유자", hp=100, hp_max=100, trait_id=self.first.id)
        self.character.trait_id = self.first.id
        self.db.add(holder)
        self.db.commit()
        with self.engine.begin() as conn:
            conn.execute(text("ALTER TABLE characters ADD COLUMN trait_change_tickets INTEGER NOT NULL DEFAULT 0"))
            conn.execute(text("UPDATE characters SET trait_change_tickets = 1 WHERE id = :id"), {"id": holder.id})
        ensure_schema(self.engine)
        ensure_schema(self.engine)
        self.db.expire_all()
        self.assertIsNone(self.db.get(Character, holder.id).trait_id)
        self.assertEqual(self.db.get(Character, self.character.id).trait_id, self.first.id)
        self.assertNotIn("trait_change_tickets", {col["name"] for col in inspect(self.engine).get_columns("characters")})

    def test_effect_is_limited_to_out_of_battle_consumables(self):
        for invalid in (
            dict(name="전투용 시약", price_gold=1, battle_only=True),
            dict(name="시약 장신구", price_gold=1, special_merchant=True, item_type="accessory"),
            dict(name="겸용 시약", price_gold=1, effects=[{"stat": "trait_change", "delta": 0},
                                                          {"stat": "ap_reset", "delta": 0}]),
        ):
            with self.subTest(name=invalid["name"]), self.assertRaises(ValidationError):
                ItemCreate(**{"effects": [{"stat": "trait_change", "delta": 0}], **invalid})


if __name__ == "__main__":
    unittest.main()
