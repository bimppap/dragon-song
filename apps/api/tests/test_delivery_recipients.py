"""선물 상자 수신자 검증과 배달 요청 저장을 확인한다."""
import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.models import Character, Member, DeliveryRequest
from app.schemas import BulkPurchaseRequest, ItemCreate


class DeliveryRecipientsTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.characters = {}
        for role in ("RUNNER", "STAFF", "ADMIN"):
            member = Member(login_id=role, password_hash="test", role=role)
            self.db.add(member)
            self.db.flush()
            character = Character(name=role, member_id=member.id, gold=100)
            self.db.add(character)
            self.db.flush()
            self.characters[role] = character
        self.unowned = Character(name="미연결")
        self.db.add(self.unowned)
        self.db.commit()
        self.item = crud.create_item(self.db, ItemCreate(
            name="선물 상자", price_gold=1,
            effects=[{"stat": "delivery_freeform", "delta": 0}],
        ))
        crud.bulk_purchase(self.db, BulkPurchaseRequest(
            character_id=self.characters["RUNNER"].id,
            items=[{"item_id": self.item.id, "quantity": 1}],
        ))

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_only_runner_and_staff_are_selectable(self):
        self.assertEqual({c["id"] for c in crud.get_delivery_recipients(self.db)},
                         {self.characters[r].id for r in ("RUNNER", "STAFF")})

    def test_invalid_recipient_does_not_consume_item(self):
        for recipient in (None, self.characters["ADMIN"].id, self.unowned.id, 99999):
            with self.assertRaises(HTTPException):
                crud.use_item(self.db, self.characters["RUNNER"].id, self.item.id,
                              delivery_letter="편지", delivery_recipient_id=recipient)
        self.assertEqual(self.db.query(DeliveryRequest).count(), 0)
        self.test_recipient_survives_completion()

    def test_recipient_survives_completion(self):
        recipient = self.characters["STAFF"]
        crud.use_item(self.db, self.characters["RUNNER"].id, self.item.id,
                      delivery_letter=" 편지 전문 ", delivery_recipient_id=recipient.id)
        request = crud.get_delivery_requests(self.db)[0]
        self.assertEqual(request.payload["recipient_id"], recipient.id)
        self.assertEqual(request.payload["recipient_name"], recipient.name)
        self.assertEqual(request.payload["letter"], "편지 전문")
        completed = crud.complete_delivery_request(self.db, request.id)
        self.assertEqual(completed.status, "completed")
        self.assertEqual(completed.payload, request.payload)


if __name__ == "__main__":
    unittest.main()
