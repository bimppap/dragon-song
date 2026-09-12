"""배달 요청 5번(선물 상자) 취소. 1회성 스크립트.

관리자 요청으로 delivery_requests #5를 취소한다. 아이템 사용 자체를 되돌리는 것이라
배달 요청과 사용 이력을 지우고, 소모 처리된 수량 1개를 다시 사용 가능하게 되돌린다.
선물 상자(아이템 15)의 효과는 배달 전용(delivery_freeform)이라 되돌릴 능력치 변화는 없다.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import SessionLocal
from app.models import CharacterItemState, DeliveryRequest, ItemUsage

REQUEST_ID = 5
EXPECTED_CHARACTER_ID = 17
EXPECTED_ITEM_ID = 15
EXPECTED_USAGE_ID = 129


def main() -> None:
    db = SessionLocal()
    try:
        request = db.get(DeliveryRequest, REQUEST_ID)
        if request is None:
            print(f"배달 요청 #{REQUEST_ID}이 없습니다. 중단합니다.")
            return
        if (request.character_id, request.item_id, request.item_usage_id) != (
            EXPECTED_CHARACTER_ID, EXPECTED_ITEM_ID, EXPECTED_USAGE_ID
        ):
            print(
                f"예상과 다른 요청이라 중단합니다: character_id={request.character_id}, "
                f"item_id={request.item_id}, item_usage_id={request.item_usage_id}"
            )
            return
        if request.status != "pending":
            print(f"이미 {request.status} 상태라 중단합니다.")
            return

        usage = db.get(ItemUsage, request.item_usage_id)
        state = (
            db.query(CharacterItemState)
            .filter(
                CharacterItemState.character_id == request.character_id,
                CharacterItemState.item_id == request.item_id,
            )
            .first()
        )
        if state is None or state.used_quantity < 1:
            print("사용 수량 정보가 없어 중단합니다.")
            return

        print(f"배달 요청 #{request.id} 삭제 (수신자: {request.payload.get('recipient_name')})")
        db.delete(request)
        if usage is not None:
            print(f"사용 이력 #{usage.id} 삭제")
            db.delete(usage)
        print(f"사용 수량 {state.used_quantity} -> {state.used_quantity - 1}")
        state.used_quantity -= 1
        db.commit()
        print("완료")
    finally:
        db.close()


if __name__ == "__main__":
    main()
