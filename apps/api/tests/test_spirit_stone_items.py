"""정령석 커스텀 기능 해방·정령석 교환 아이템 효과를 검증한다."""
import unittest

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.models import Character, CharacterItemState, Purchase
from app.schemas import ItemCreate


class SpiritStoneItemsTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.character = Character(name="러너", atk=10)
        self.db.add(self.character)
        self.db.flush()
        stone = dict(price_gold=1, special_merchant=True, item_type="companion")
        self.valor = crud.create_item(self.db, ItemCreate(name="용맹의 정령석", description_user="용맹", effects=[{"stat": "atk", "delta": 5}], **stone))
        self.mystic = crud.create_item(self.db, ItemCreate(name="신비의 정령석", description_user="신비", **stone))
        self.earth = crud.create_item(self.db, ItemCreate(name="대지의 정령석", purchase_limit_global=1, **stone))
        self.pet = crud.create_item(self.db, ItemCreate(name="고양이", **stone))
        self.customize = crud.create_item(self.db, ItemCreate(name="해방", price_gold=1, effects=[{"stat": "spirit_stone_customize", "delta": 0}]))
        self.exchange = crud.create_item(self.db, ItemCreate(name="교환권", price_gold=1, effects=[{"stat": "spirit_stone_exchange", "delta": 0}]))
        for item in (self.valor, self.pet, self.customize, self.exchange):
            self.give(item)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def give(self, item, character_id=None, quantity=1):
        self.db.add(Purchase(character_id=character_id or self.character.id, item_id=item.id, quantity=quantity))
        self.db.commit()

    def owned(self, detail):
        return {entry.item_id: entry for entry in detail.owned_items}

    def exchange_uses(self):
        state = self.db.query(CharacterItemState).filter_by(character_id=self.character.id, item_id=self.exchange.id).first()
        return state.used_quantity if state else 0

    def test_customize_unlocks_image_and_description_for_owned_stones(self):
        with self.assertRaises(HTTPException):
            crud.update_spirit_stone_customization(self.db, self.character.id, self.valor.id, {"custom_description": "내 정령"})
        detail = crud.use_item(self.db, self.character.id, self.customize.id)
        self.assertTrue(detail.spirit_stone_custom_unlocked)
        owned = self.owned(detail)
        self.assertTrue(owned[self.valor.id].customizable)
        self.assertFalse(owned[self.pet.id].customizable)  # 정령석이 아닌 동반자

        detail, removed = crud.update_spirit_stone_customization(self.db, self.character.id, self.valor.id, {"custom_description": "  내 정령  "})
        self.assertIsNone(removed)
        self.assertEqual(self.owned(detail)[self.valor.id].item_description, "내 정령")
        detail = crud.set_spirit_stone_custom_image(self.db, self.character.id, self.valor.id, "https://img/custom.webp")
        self.assertEqual(self.owned(detail)[self.valor.id].item_image_url, "https://img/custom.webp")

        detail, removed = crud.update_spirit_stone_customization(
            self.db, self.character.id, self.valor.id, {"custom_description": "", "clear_image": True})
        self.assertEqual(removed, "https://img/custom.webp")
        self.assertEqual(self.owned(detail)[self.valor.id].item_description, "용맹")
        self.assertIsNone(self.owned(detail)[self.valor.id].custom_image_url)

        for item in (self.mystic, self.pet):  # 보유하지 않은 정령석, 정령석이 아닌 아이템
            with self.assertRaises(HTTPException):
                crud.update_spirit_stone_customization(self.db, self.character.id, item.id, {"custom_description": "x"})

        self.give(self.customize)
        with self.assertRaises(HTTPException):  # 이미 해방된 캐릭터는 다시 쓰지 않는다(아이템도 소모되지 않음)
            crud.use_item(self.db, self.character.id, self.customize.id)

    def test_exchange_swaps_stone_and_unequips_the_old_one(self):
        crud.equip_item(self.db, self.character.id, self.valor.id)
        self.assertEqual(self.character.atk, 15)
        detail = crud.use_item(self.db, self.character.id, self.exchange.id,
                               exchange_from_item_id=self.valor.id, exchange_to_item_id=self.mystic.id)
        owned = self.owned(detail)
        self.assertNotIn(self.valor.id, owned)
        self.assertIn(self.mystic.id, owned)
        self.assertFalse(owned[self.mystic.id].equipped)
        self.assertEqual(self.character.atk, 10)  # 장착 효과가 되돌아간다
        self.assertEqual(self.exchange_uses(), 1)
        # 교환으로 생긴 -1/+1 기록은 구매 이력에 보이지 않는다(원래 상점 구매만 남는다).
        purchases = [entry for entry in crud.get_item_history(self.db, self.character.id) if entry.kind == "purchase"]
        self.assertTrue(all(entry.quantity > 0 for entry in purchases))
        self.assertNotIn(self.mystic.id, [entry.item_id for entry in purchases])

    def test_invalid_exchanges_do_not_consume_the_item(self):
        self.give(self.mystic)
        other = Character(name="다른 러너")
        self.db.add(other)
        self.db.commit()
        self.give(self.earth, character_id=other.id)  # 전체 한도 1개가 이미 팔림
        cases = [
            (self.valor.id, self.valor.id),   # 같은 정령석
            (self.valor.id, self.mystic.id),  # 이미 보유
            (self.valor.id, self.pet.id),     # 정령석이 아님
            (self.valor.id, self.earth.id),   # 품절
            (self.earth.id, self.mystic.id),  # 보유하지 않은 정령석을 내놓음
            (None, self.mystic.id),
        ]
        for from_id, to_id in cases:
            with self.subTest(from_id=from_id, to_id=to_id), self.assertRaises(HTTPException):
                crud.use_item(self.db, self.character.id, self.exchange.id, exchange_from_item_id=from_id, exchange_to_item_id=to_id)
        self.assertEqual(self.exchange_uses(), 0)

    def test_exchanged_away_stone_returns_to_global_stock(self):
        self.give(self.earth)
        options = {option.item_id: option for option in crud.get_spirit_stone_options(self.db, self.character.id)}
        self.assertTrue(options[self.earth.id].owned and options[self.earth.id].sold_out)
        self.assertNotIn(self.pet.id, options)
        crud.use_item(self.db, self.character.id, self.exchange.id,
                      exchange_from_item_id=self.earth.id, exchange_to_item_id=self.mystic.id)
        options = {option.item_id: option for option in crud.get_spirit_stone_options(self.db, self.character.id)}
        self.assertFalse(options[self.earth.id].owned or options[self.earth.id].sold_out)
        self.assertTrue(options[self.mystic.id].owned)

    def test_item_validation(self):
        for effects in (
            [{"stat": "spirit_stone_exchange", "delta": 0}, {"stat": "cleanse_debuffs", "delta": 0}],
            [{"stat": "spirit_stone_customize", "delta": 0}, {"stat": "spirit_stone_exchange", "delta": 0}],
        ):
            with self.subTest(effects=effects), self.assertRaises(ValidationError):
                ItemCreate(name="x", price_gold=1, effects=effects)
        with self.assertRaises(ValidationError):
            ItemCreate(name="x", price_gold=1, special_merchant=True, item_type="companion",
                       effects=[{"stat": "spirit_stone_customize", "delta": 0}])


if __name__ == "__main__":
    unittest.main()
