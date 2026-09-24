"""한 번 장착한 특성은 해제할 수 없고, "특성 교체" 아이템으로 받은 교체권이 있어야
다른 특성으로 바꿀 수 있음을 검증한다."""
import unittest

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud, trait_effects as effects
from app.db import Base
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
        self.ticket_item = crud.create_item(self.db, ItemCreate(
            name="특성 교체권", price_gold=1, effects=[{"stat": "trait_change", "delta": 0}]))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def make_trait(self, name):
        return crud.create_trait(self.db, TraitCreate(name=name, rules=effects.default_rules("standard")))

    def give_ticket(self, quantity=1):
        self.db.add(Purchase(character_id=self.character.id, item_id=self.ticket_item.id, quantity=quantity))
        self.db.commit()

    def test_first_equip_is_free_but_changing_needs_a_ticket(self):
        detail = crud.equip_trait(self.db, self.character.id, self.first.id)
        self.assertEqual(detail.trait_id, self.first.id)
        self.assertEqual(detail.trait_change_tickets, 0)

        with self.assertRaises(HTTPException):
            crud.equip_trait(self.db, self.character.id, self.second.id)
        self.assertEqual(self.db.get(Character, self.character.id).trait_id, self.first.id)

        # 같은 특성을 다시 장착하는 요청은 바뀌는 것이 없으므로 교체권을 쓰지 않는다.
        self.assertEqual(crud.equip_trait(self.db, self.character.id, self.first.id).trait_id, self.first.id)

    def test_equipped_trait_can_never_be_unequipped(self):
        crud.equip_trait(self.db, self.character.id, self.first.id)
        self.give_ticket()
        crud.use_item(self.db, self.character.id, self.ticket_item.id)
        # 교체권이 있어도 빈 슬롯으로 되돌릴 수는 없고, 교체권도 그대로 남는다.
        with self.assertRaises(HTTPException):
            crud.equip_trait(self.db, self.character.id, None)
        character = self.db.get(Character, self.character.id)
        self.assertEqual((character.trait_id, character.trait_change_tickets), (self.first.id, 1))
        # 관리자는 해제할 수 있다.
        self.assertIsNone(crud.equip_trait(self.db, self.character.id, None, consume_ticket=False).trait_id)

    def test_item_grants_one_change(self):
        crud.equip_trait(self.db, self.character.id, self.first.id)
        self.give_ticket()
        detail = crud.use_item(self.db, self.character.id, self.ticket_item.id)
        self.assertEqual(detail.trait_change_tickets, 1)

        detail = crud.equip_trait(self.db, self.character.id, self.second.id)
        self.assertEqual((detail.trait_id, detail.trait_change_tickets), (self.second.id, 0))
        with self.assertRaises(HTTPException):  # 한 장이 소모되어 다시 잠긴다.
            crud.equip_trait(self.db, self.character.id, self.first.id)

    def test_ticket_is_kept_when_equip_is_rejected(self):
        crud.equip_trait(self.db, self.character.id, self.first.id)
        self.give_ticket()
        crud.use_item(self.db, self.character.id, self.ticket_item.id)
        no_rules = crud.create_trait(self.db, TraitCreate(name="수치 없는 특성"))
        with self.assertRaises(HTTPException):
            crud.equip_trait(self.db, self.character.id, no_rules.id)
        self.assertEqual(self.db.get(Character, self.character.id).trait_change_tickets, 1)

    def test_admin_changes_without_a_ticket(self):
        crud.equip_trait(self.db, self.character.id, self.first.id)
        detail = crud.equip_trait(self.db, self.character.id, self.second.id, consume_ticket=False)
        self.assertEqual((detail.trait_id, detail.trait_change_tickets), (self.second.id, 0))

    def test_effect_is_limited_to_out_of_battle_consumables(self):
        for invalid in (
            dict(name="전투용 교체권", price_gold=1, battle_only=True),
            dict(name="교체 장신구", price_gold=1, special_merchant=True, item_type="accessory"),
            dict(name="겸용 교체권", price_gold=1, effects=[{"stat": "trait_change", "delta": 0},
                                                            {"stat": "ap_reset", "delta": 0}]),
        ):
            with self.subTest(name=invalid["name"]), self.assertRaises(ValidationError):
                ItemCreate(**{"effects": [{"stat": "trait_change", "delta": 0}], **invalid})


if __name__ == "__main__":
    unittest.main()
