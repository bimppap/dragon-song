"""아이템 판매기간의 챕터/날짜 방식 저장과 날짜 방식 구매 가능 판정을 검증한다."""
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.models import KST
from app.schemas import ItemCreate


class ItemSalePeriodTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def make_item(self, **kwargs):
        return crud.create_item(self.db, ItemCreate(name="물약", price_gold=10, **kwargs))

    def purchasable_at(self, now):
        with patch("app.crud.now_kst", return_value=now):
            return crud.get_items_with_stock(self.db, admin=True)[0].purchasable

    def test_date_window_includes_start_and_excludes_end(self):
        start = datetime(2026, 9, 20, 12, 30, tzinfo=KST)
        end = datetime(2026, 9, 21, 18, 0, tzinfo=KST)
        self.make_item(sale_period_type="date", available_from_at=start, available_until_at=end)
        self.assertFalse(self.purchasable_at(start - timedelta(seconds=1)))
        self.assertTrue(self.purchasable_at(start))
        self.assertTrue(self.purchasable_at(end - timedelta(seconds=1)))
        self.assertFalse(self.purchasable_at(end))

    def test_seconds_are_dropped_and_naive_values_are_kst(self):
        data = ItemCreate(name="물약", price_gold=10, sale_period_type="date",
                          available_from_at="2026-09-20T12:30:45", available_until_at="2026-09-20T05:00:59Z")
        self.assertEqual(data.available_from_at, datetime(2026, 9, 20, 12, 30, tzinfo=KST))
        self.assertEqual(data.available_until_at, datetime(2026, 9, 20, 14, 0, tzinfo=KST))

    def test_unselected_mode_values_are_cleared(self):
        date_item = ItemCreate(name="물약", price_gold=10, sale_period_type="date", available_from_chapter="1장",
                               available_from_at=datetime(2026, 9, 20, 12, 0, tzinfo=KST))
        self.assertIsNone(date_item.available_from_chapter)
        chapter_item = ItemCreate(name="물약", price_gold=10, available_from_at=datetime(2026, 9, 20, 12, 0, tzinfo=KST))
        self.assertIsNone(chapter_item.available_from_at)

    def test_start_must_be_before_end(self):
        moment = datetime(2026, 9, 20, 12, 0, tzinfo=KST)
        with self.assertRaises(ValidationError):
            ItemCreate(name="물약", price_gold=10, sale_period_type="date", available_from_at=moment, available_until_at=moment)


if __name__ == "__main__":
    unittest.main()
