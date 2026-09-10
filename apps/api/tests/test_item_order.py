"""관리자가 지정한 아이템 노출 순서(sort_order)의 저장과 정렬을 검증한다."""
import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.migrations import ensure_schema
from app.models import Character, Purchase
from app.schemas import ItemCreate


class ItemOrderTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.items = [self.make_item(name) for name in ("물약", "검", "방패")]

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def make_item(self, name):
        return crud.create_item(self.db, ItemCreate(name=name, price_gold=10, item_type="consumable"))

    def listed_names(self):
        return [item.name for item in crud.get_items_with_stock(self.db, admin=True)]

    def test_new_items_are_appended_in_creation_order(self):
        self.assertEqual(self.listed_names(), ["물약", "검", "방패"])
        self.make_item("투구")
        self.assertEqual(self.listed_names(), ["물약", "검", "방패", "투구"])

    def test_reorder_changes_listing_order(self):
        potion, sword, shield = self.items
        crud.reorder_items(self.db, [shield.id, potion.id, sword.id])
        self.assertEqual(self.listed_names(), ["방패", "물약", "검"])
        self.assertEqual([n.name for n in crud.get_item_names(self.db)], ["방패", "물약", "검"])

    def test_item_created_after_reorder_goes_last(self):
        potion, sword, shield = self.items
        crud.reorder_items(self.db, [shield.id, potion.id, sword.id])
        self.make_item("투구")
        self.assertEqual(self.listed_names(), ["방패", "물약", "검", "투구"])

    def test_partial_or_stale_list_is_rejected(self):
        potion, sword, shield = self.items
        with self.assertRaises(HTTPException) as ctx:
            crud.reorder_items(self.db, [shield.id, potion.id])
        self.assertEqual(ctx.exception.status_code, 400)
        # 거절된 요청은 기존 순서를 건드리지 않는다.
        self.assertEqual(self.listed_names(), ["물약", "검", "방패"])

    def test_character_owned_items_follow_the_same_order(self):
        """상점과 캐릭터 보유 목록이 서로 다른 순서로 보이면 관리자가 정한 순서가 무의미해진다."""
        character = Character(name="holder")
        self.db.add(character)
        self.db.flush()
        for item in self.items:
            self.db.add(Purchase(character_id=character.id, item_id=item.id, quantity=1))
        self.db.commit()

        potion, sword, shield = self.items
        crud.reorder_items(self.db, [shield.id, potion.id, sword.id])
        detail = crud.get_character_detail(self.db, character.id)
        self.assertEqual([owned.item_name for owned in detail.owned_items], ["방패", "물약", "검"])

    def test_migration_backfills_existing_items_with_id_order(self):
        """sort_order 이전에 등록된 아이템은 지금까지 노출되던 id 순서를 그대로 물려받는다."""
        potion_id, sword_id, shield_id = (item.id for item in self.items)
        self.db.close()
        with self.engine.begin() as connection:
            connection.execute(text("ALTER TABLE items DROP COLUMN sort_order"))
        ensure_schema(self.engine)
        ensure_schema(self.engine)
        self.db = Session(self.engine)
        self.assertEqual(self.listed_names(), ["물약", "검", "방패"])
        # 물려받은 순서 위에서 곧바로 순서를 바꿀 수 있어야 한다.
        crud.reorder_items(self.db, [shield_id, potion_id, sword_id])
        self.assertEqual(self.listed_names(), ["방패", "물약", "검"])

    def test_duplicate_ids_are_rejected(self):
        potion, sword, shield = self.items
        with self.assertRaises(HTTPException) as ctx:
            crud.reorder_items(self.db, [potion.id, potion.id, sword.id, shield.id])
        self.assertEqual(ctx.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
