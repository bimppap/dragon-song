"""노메드의 미사용 기술 서적 Ⅴ 구매 #645 회수 및 30G 환급."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import SessionLocal
from app.models import Character, CharacterItemState, Item, ItemUsage, Purchase


def main() -> None:
    with SessionLocal() as db, db.begin():
        character = db.query(Character).filter(Character.id == 43).with_for_update().one()
        if character.name != "노메드":
            raise RuntimeError("캐릭터 이름이 예상과 다릅니다.")
        purchase = db.get(Purchase, 645)
        if purchase is None:
            print("구매 #645 없음: 추가 회수·환급 없이 종료")
            return
        if (purchase.character_id, purchase.item_id, purchase.quantity, purchase.source) != (43, 47, 1, "shop"):
            raise RuntimeError("구매 내역이 예상과 다릅니다.")
        item = db.get(Item, 47)
        if (item.name, item.price_gold, item.price_cp) != ("기술 서적 Ⅴ", 30, None):
            raise RuntimeError("아이템 또는 가격이 예상과 다릅니다.")
        usages = db.query(ItemUsage).filter_by(character_id=43, item_id=47).count()
        state = db.query(CharacterItemState).filter_by(character_id=43, item_id=47).first()
        if usages or (state is not None and (state.used_quantity or state.equipped or state.chosen_stats)):
            raise RuntimeError("사용 또는 장착 이력이 있어 중단합니다.")
        before_gold = character.gold
        db.delete(purchase)
        character.gold += 30
        db.flush()
        print(f"구매 #645 회수, 골드 {before_gold} → {character.gold}, SP {character.sp}")
    print("커밋 완료")


if __name__ == "__main__":
    main()
