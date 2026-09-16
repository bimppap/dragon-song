"""전체 구매 한도가 있는 아이템은 판매 합계를 읽기 전에 아이템 행을 잠그는지 검증한다.

SQLite는 FOR UPDATE를 무시해 실제 동시 구매 경합은 재현되지 않으므로, 잠금 요청 여부와 순서만 확인한다.
"""
import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.models import Character, Item, Purchase, ShopState
from app.schemas import BulkPurchaseRequest


class PurchaseLimitLockTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.character = Character(name="러너", gold=100)
        self.limited = Item(name="한정", price_gold=1, purchase_limit_global=5, effects=[])
        self.unlimited = Item(name="일반", price_gold=1, effects=[])
        self.db.add_all([ShopState(id=1, is_open=True), self.character, self.limited, self.unlimited])
        self.db.commit()
        self.statements = []
        event.listen(self.db, "do_orm_execute", self.record)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def record(self, state):
        if state.is_select:
            self.statements.append(state.statement)

    def locked_entities(self):
        return [
            statement.column_descriptions[0]["entity"]
            for statement in self.statements
            if statement._for_update_arg is not None
        ]

    def test_limited_item_row_is_locked_after_character(self):
        crud.bulk_purchase(self.db, BulkPurchaseRequest(character_id=self.character.id, items=[
            {"item_id": self.unlimited.id, "quantity": 1}, {"item_id": self.limited.id, "quantity": 1},
        ]))
        self.assertEqual(self.locked_entities(), [Character, Item])
        self.assertEqual(self.db.query(Purchase).count(), 2)

    def test_sold_out_and_partial_stock_messages(self):
        self.db.add(Purchase(character_id=self.character.id, item_id=self.limited.id, quantity=4))
        self.db.commit()
        with self.assertRaises(HTTPException) as error:
            crud.bulk_purchase(self.db, BulkPurchaseRequest(character_id=self.character.id, items=[
                {"item_id": self.limited.id, "quantity": 2},
            ]))
        self.assertEqual(error.exception.detail, "'한정'은(는) 1개만 남아 있습니다.")

        self.db.add(Purchase(character_id=self.character.id, item_id=self.limited.id, quantity=1))
        self.db.commit()
        with self.assertRaises(HTTPException) as error:
            crud.bulk_purchase(self.db, BulkPurchaseRequest(character_id=self.character.id, items=[
                {"item_id": self.limited.id, "quantity": 1},
            ]))
        self.assertEqual(error.exception.detail, "'한정'은(는) 품절되었습니다.")

    def test_unlimited_items_do_not_take_item_lock(self):
        crud.bulk_purchase(self.db, BulkPurchaseRequest(character_id=self.character.id, items=[
            {"item_id": self.unlimited.id, "quantity": 1},
        ]))
        self.assertEqual(self.locked_entities(), [Character])


if __name__ == "__main__":
    unittest.main()
