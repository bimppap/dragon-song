"""'서리속에 잠든 날개'(캐릭터 31)의 회고록 Ⅳ(30)·기술 서적 Ⅳ(29) 구매와 사용을 회수. 1회성 스크립트.

관리자 요청으로 2026-09-20 한 장바구니에서 산 구매 #475(회고록 Ⅳ, 12CP)·#474(기술 서적 Ⅳ, 25G)와
그 직후의 사용 #212·#213을 없던 일로 되돌린다. 되돌릴 것은 셋이다:

1. 회고록 Ⅳ 사용으로 임무 16 '훼방꾼'에서 받은 경험치 5. 이 캐릭터는 다음 날 임무 16을 실제로
   달성해 같은 보상을 다시 받았다(보상 #2118).
2. 기술 서적 Ⅳ 사용으로 받은 SP 1. 아직 기술에 쓰지 않아(마지막 해금이 2026-09-13) 그대로 회수한다.
3. 낸 가격 25G·12CP 환급.

성장등급(lv)은 건드리지 않는다. 누적 경험치 85 → 80이라 20당 1씩인 성장 횟수(4회)가 그대로이고,
경험치 5 → 0으로 줄면 바로 맞는다. 지급됐던 AP도 그래서 회수할 게 없다.

임무 16의 보상으로 받은 기술 서적 Ⅳ 1개(구매 #478, source="reward")는 구매가 아니므로 남겨 둔다.
그래서 회수 후 기술 서적 Ⅳ는 "보유 1개, 사용 0개"가 된다.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.crud import _apply_item_effects
from app.db import SessionLocal
from app.models import Character, CharacterItemState, Item, ItemUsage, Purchase

CHARACTER_ID = 31
RECOLLECTION_ITEM_ID = 30  # 회고록 Ⅳ
SKILL_BOOK_ITEM_ID = 29  # 기술 서적 Ⅳ
# (구매 id, 아이템 id, 돌려줄 골드, 돌려줄 CP)
PURCHASES = [
    (474, SKILL_BOOK_ITEM_ID, 25, 0),
    (475, RECOLLECTION_ITEM_ID, 0, 12),
]
# (사용 id, 아이템 id, 회수할 경험치)
USAGES = [
    (212, RECOLLECTION_ITEM_ID, 5),
    (213, SKILL_BOOK_ITEM_ID, 0),
]
EXPECTED_MISSION_ID = 16  # 회고록 Ⅳ로 회고한 임무 '훼방꾼'


def main() -> None:
    db = SessionLocal()
    try:
        character = (
            db.query(Character).filter(Character.id == CHARACTER_ID).with_for_update().first()
        )
        if character is None:
            print(f"캐릭터 #{CHARACTER_ID}이 없습니다. 중단합니다.")
            return

        purchases = []
        for purchase_id, item_id, _, _ in PURCHASES:
            purchase = db.get(Purchase, purchase_id)
            if purchase is None:
                print(f"구매 기록 #{purchase_id}이 없습니다. 중단합니다.")
                return
            if (purchase.character_id, purchase.item_id, purchase.quantity, purchase.source) != (
                CHARACTER_ID, item_id, 1, "shop"
            ):
                print(
                    f"예상과 다른 구매 기록이라 중단합니다: #{purchase.id} "
                    f"character_id={purchase.character_id}, item_id={purchase.item_id}, "
                    f"quantity={purchase.quantity}, source={purchase.source}"
                )
                return
            purchases.append(purchase)

        usages = []
        for usage_id, item_id, granted_experience in USAGES:
            usage = db.get(ItemUsage, usage_id)
            if usage is None:
                print(f"사용 기록 #{usage_id}이 없습니다. 중단합니다.")
                return
            if (usage.character_id, usage.item_id, usage.quantity, usage.granted_experience) != (
                CHARACTER_ID, item_id, 1, granted_experience
            ):
                print(
                    f"예상과 다른 사용 기록이라 중단합니다: #{usage.id} "
                    f"character_id={usage.character_id}, item_id={usage.item_id}, "
                    f"quantity={usage.quantity}, granted_experience={usage.granted_experience}"
                )
                return
            if usage.item_id == RECOLLECTION_ITEM_ID and usage.selected_mission_id != EXPECTED_MISSION_ID:
                print(f"회고 대상 임무가 예상과 다릅니다: {usage.selected_mission_id}. 중단합니다.")
                return
            if usage.refunded_sp or usage.refunded_ap:
                print(f"초기화 환급이 딸린 사용 기록이라 중단합니다: #{usage.id}")
                return
            usages.append(usage)

        total_experience = sum(usage.granted_experience for usage in usages)
        if character.exp < total_experience:
            print(f"회수할 경험치({total_experience})보다 보유 경험치({character.exp})가 적어 중단합니다.")
            return
        if character.sp < 1:
            print(f"회수할 SP(1)보다 보유 SP({character.sp})가 적어 중단합니다. 이미 기술에 쓴 것으로 보입니다.")
            return

        print(f"대상 캐릭터: {character.name} (#{character.id})")
        before_sp = character.sp

        # 사용 되돌리기: 아이템 효과(기술 서적 Ⅳ의 SP +1)를 빼고, 회고록으로 받은 경험치를 회수한다.
        for usage in usages:
            item = db.get(Item, usage.item_id)
            _apply_item_effects(character, item.effects or [], sign=-1)
            if usage.granted_experience:
                print(f"경험치 {character.exp} -> {character.exp - usage.granted_experience} ('{usage.selected_mission_name}' 회고 취소)")
                character.exp -= usage.granted_experience
            state = (
                db.query(CharacterItemState)
                .filter(
                    CharacterItemState.character_id == CHARACTER_ID,
                    CharacterItemState.item_id == usage.item_id,
                )
                .first()
            )
            if state is None or state.used_quantity < usage.quantity:
                print(f"사용 수량이 맞지 않아 중단합니다: item_id={usage.item_id}")
                db.rollback()
                return
            state.used_quantity -= usage.quantity
            print(f"사용 기록 #{usage.id} 삭제 (item_id={usage.item_id}, 사용 수량 {state.used_quantity + usage.quantity} -> {state.used_quantity})")
            db.delete(usage)

        # 구매 되돌리기: 기록을 지우고 낸 가격을 돌려준다.
        refund_gold = sum(gold for _, _, gold, _ in PURCHASES)
        refund_cp = sum(cp for _, _, _, cp in PURCHASES)
        for purchase in purchases:
            print(f"구매 기록 #{purchase.id} 삭제 (item_id={purchase.item_id})")
            db.delete(purchase)
        print(f"골드 {character.gold} -> {character.gold + refund_gold}, CP {character.cp} -> {character.cp + refund_cp}")
        character.gold += refund_gold
        character.cp += refund_cp
        print(f"SP {before_sp} -> {character.sp}")

        # 회고록 Ⅳ는 남은 보유량이 없으므로 상태 행 자체를 지운다(기술 서적 Ⅳ는 보상으로 받은 1개가 남는다).
        leftover = (
            db.query(CharacterItemState)
            .filter(
                CharacterItemState.character_id == CHARACTER_ID,
                CharacterItemState.item_id == RECOLLECTION_ITEM_ID,
            )
            .first()
        )
        if leftover is not None and leftover.used_quantity == 0 and not leftover.equipped and not leftover.chosen_stats:
            db.delete(leftover)

        db.commit()
        print("완료")
    finally:
        db.close()


if __name__ == "__main__":
    main()
