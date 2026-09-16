"""알란테(캐릭터 23)의 신비의 정령석(아이템 37) 구매 취소. 1회성 스크립트.

관리자 요청으로 구매 기록 #401을 취소한다. 장착·사용한 적이 없어(아이템 상태 행 없음)
되돌릴 능력치 변화는 없으므로, 구매 기록을 지우고 낸 가격(20G, 20CP)을 돌려준다.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import SessionLocal
from app.models import Character, CharacterItemState, Purchase

PURCHASE_ID = 401
EXPECTED_CHARACTER_ID = 23
EXPECTED_ITEM_ID = 37
REFUND_GOLD = 20
REFUND_CP = 20


def main() -> None:
    db = SessionLocal()
    try:
        purchase = db.get(Purchase, PURCHASE_ID)
        if purchase is None:
            print(f"구매 기록 #{PURCHASE_ID}이 없습니다. 중단합니다.")
            return
        if (purchase.character_id, purchase.item_id, purchase.quantity, purchase.source) != (
            EXPECTED_CHARACTER_ID, EXPECTED_ITEM_ID, 1, "shop"
        ):
            print(
                f"예상과 다른 구매 기록이라 중단합니다: character_id={purchase.character_id}, "
                f"item_id={purchase.item_id}, quantity={purchase.quantity}, source={purchase.source}"
            )
            return

        state = (
            db.query(CharacterItemState)
            .filter(
                CharacterItemState.character_id == purchase.character_id,
                CharacterItemState.item_id == purchase.item_id,
            )
            .first()
        )
        if state is not None and (state.equipped or state.used_quantity > 0):
            print(f"장착/사용 이력이 있어 중단합니다: equipped={state.equipped}, used_quantity={state.used_quantity}")
            return

        character = db.query(Character).filter(Character.id == purchase.character_id).with_for_update().first()
        print(f"구매 기록 #{purchase.id} 삭제 ({character.name})")
        db.delete(purchase)
        if state is not None:
            db.delete(state)
        print(f"골드 {character.gold} -> {character.gold + REFUND_GOLD}, CP {character.cp} -> {character.cp + REFUND_CP}")
        character.gold += REFUND_GOLD
        character.cp += REFUND_CP
        db.commit()
        print("완료")
    finally:
        db.close()


if __name__ == "__main__":
    main()
