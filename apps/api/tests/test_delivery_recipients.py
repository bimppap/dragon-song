"""선물 상자 수신자 검증과 배달 요청 저장을 확인한다."""
import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.models import Character, CharacterItemState, DeliveryRequest, ItemUsage, Member
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
        self.characters["STAFF"].faction = "치유"
        self.db.commit()
        self.assertEqual({c["id"]: c["faction"] for c in crud.get_delivery_recipients(self.db)},
                         {self.characters["RUNNER"].id: None, self.characters["STAFF"].id: "치유"})

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

    def test_multiple_groups_preserve_recipients_anonymity_and_usage(self):
        sender = self.characters["RUNNER"].id
        recipient = self.characters["STAFF"].id
        crud.bulk_purchase(self.db, BulkPurchaseRequest(character_id=sender,
            items=[{"item_id": self.item.id, "quantity": 2}]))
        with self.assertRaises(HTTPException):
            crud.use_item(self.db, sender, self.item.id, delivery_groups=[
                {"recipient_ids": [sender], "letter": "익명", "anonymous": True},
                {"recipient_ids": [recipient], "letter": "실명", "anonymous": False},
            ])
        self.assertEqual(self.db.query(DeliveryRequest).count(), 0)
        crud.use_item(self.db, sender, self.item.id, delivery_groups=[
            {"recipient_ids": [sender, recipient, recipient], "letter": "단체1", "anonymous": True},
            {"recipient_ids": [recipient], "letter": "단체2", "anonymous": True},
        ])
        requests = sorted(crud.get_delivery_requests(self.db), key=lambda row: row.id)
        self.assertEqual(len(requests), 2)
        self.assertEqual(requests[0].payload["recipient_ids"], [sender, recipient])
        self.assertEqual(requests[0].payload["recipient_names"], ["RUNNER", "STAFF"])
        self.assertTrue(all(request.payload["anonymous"] for request in requests))
        # 받는 캐릭터 1명당 상자 1개: 세트1 2명 + 세트2 1명 = 3개
        usages = self.db.query(ItemUsage).filter_by(character_id=sender, item_id=self.item.id).order_by(ItemUsage.id).all()
        self.assertEqual([usage.quantity for usage in usages], [2, 1])
        self.assertEqual(self.db.query(CharacterItemState).filter_by(character_id=sender, item_id=self.item.id).one().used_quantity, 3)
        with self.assertRaises(HTTPException):
            crud.use_item(self.db, sender, self.item.id, delivery_letter="소진", delivery_recipient_id=recipient)

    def test_invalid_later_group_does_not_consume_any_boxes(self):
        sender = self.characters["RUNNER"].id
        crud.bulk_purchase(self.db, BulkPurchaseRequest(character_id=sender,
            items=[{"item_id": self.item.id, "quantity": 1}]))
        with self.assertRaises(HTTPException):
            crud.use_item(self.db, sender, self.item.id, delivery_groups=[
                {"recipient_ids": [sender], "letter": "정상"},
                {"recipient_ids": [99999], "letter": "오류"},
            ])
        self.assertEqual(self.db.query(DeliveryRequest).count(), 0)
        crud.use_item(self.db, sender, self.item.id, delivery_groups=[
            {"recipient_ids": [sender], "letter": "1"},
            {"recipient_ids": [sender], "letter": "2"},
        ])
        self.assertEqual(self.db.query(DeliveryRequest).count(), 2)

    def test_recipients_beyond_owned_boxes_are_rejected(self):
        sender = self.characters["RUNNER"].id
        recipient = self.characters["STAFF"].id
        with self.assertRaises(HTTPException) as error:
            crud.use_item(self.db, sender, self.item.id, delivery_groups=[
                {"recipient_ids": [sender, recipient], "letter": "한 세트 두 명"},
            ])
        self.assertIn("필요 2개 / 보유 1개", error.exception.detail)
        self.assertEqual(self.db.query(DeliveryRequest).count(), 0)

    def test_insufficient_boxes_rejects_whole_request(self):
        sender = self.characters["RUNNER"].id
        with self.assertRaises(HTTPException):
            crud.use_item(self.db, sender, self.item.id, delivery_groups=[
                {"recipient_ids": [sender], "letter": "1"},
                {"recipient_ids": [sender], "letter": "2"},
            ])
        self.assertEqual(self.db.query(DeliveryRequest).count(), 0)
        self.test_recipient_survives_completion()


if __name__ == "__main__":
    unittest.main()
