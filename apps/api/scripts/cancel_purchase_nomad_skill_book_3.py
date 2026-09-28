"""노메드(캐릭터 43)의 기술 서적 Ⅲ(아이템 24) 구매 회수. 1회성 스크립트.

관리자 요청으로 2026-09-14 상점에서 산 구매 #323(20G)을 없던 일로 되돌린다. 같은 날 임무 13을
달성해 보상으로 기술 서적 Ⅲ 1개(구매 #348, source="reward")를 따로 받아 2개가 됐다. 기술 서적 Ⅲ은
임무 13 보상을 받은 캐릭터는 살 수 없고 캐릭터당 1개까지만 살 수 있는 아이템이다.

두 권 모두 쓰지 않아(사용 기록·아이템 상태 행 없음) 되돌릴 SP는 없다. 구매 기록을 지우고 낸 가격
20G를 돌려준다. 보상으로 받은 1개는 구매가 아니므로 남겨 두어, 회수 후 "보유 1개, 사용 0개"가 된다.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import SessionLocal
from app.models import Character, CharacterItemState, ItemUsage, Purchase

PURCHASE_ID = 323
EXPECTED_CHARACTER_ID = 43
EXPECTED_ITEM_ID = 24  # 기술 서적 Ⅲ
REWARD_PURCHASE_ID = 348  # 임무 13 보상으로 받은 1개(남겨 둔다)
REFUND_GOLD = 20


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

        reward = db.get(Purchase, REWARD_PURCHASE_ID)
        if reward is None or (reward.character_id, reward.item_id, reward.source) != (
            EXPECTED_CHARACTER_ID, EXPECTED_ITEM_ID, "reward"
        ):
            print(f"보상으로 받은 기록 #{REWARD_PURCHASE_ID}이 예상과 달라 중단합니다.")
            return

        usage_count = (
            db.query(ItemUsage)
            .filter(ItemUsage.character_id == EXPECTED_CHARACTER_ID, ItemUsage.item_id == EXPECTED_ITEM_ID)
            .count()
        )
        state = (
            db.query(CharacterItemState)
            .filter(
                CharacterItemState.character_id == EXPECTED_CHARACTER_ID,
                CharacterItemState.item_id == EXPECTED_ITEM_ID,
            )
            .first()
        )
        if usage_count or (state is not None and state.used_quantity > 0):
            print(f"사용 이력이 있어 중단합니다: 사용 기록 {usage_count}건, used_quantity={state.used_quantity if state else 0}")
            return

        character = db.query(Character).filter(Character.id == EXPECTED_CHARACTER_ID).with_for_update().first()
        print(f"구매 기록 #{purchase.id} 삭제 ({character.name}, 기술 서적 Ⅲ)")
        db.delete(purchase)
        print(f"골드 {character.gold} -> {character.gold + REFUND_GOLD}")
        character.gold += REFUND_GOLD
        db.commit()
        print("완료")
    finally:
        db.close()


if __name__ == "__main__":
    main()
