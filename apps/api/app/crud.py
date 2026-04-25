from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.models import Character, Item, Purchase
from app.schemas import CharacterCreate, ItemCreate, PurchaseRequest, ItemWithStock, PurchaseRead


def create_character(db: Session, data: CharacterCreate) -> Character:
    character = Character(
        name=data.name,
        hp=data.hp,
        attack=data.attack,
        defense=data.defense,
    )
    db.add(character)
    db.commit()
    db.refresh(character)
    return character


def get_characters(db: Session) -> list[Character]:
    return db.query(Character).all()


def create_item(db: Session, data: ItemCreate) -> Item:
    item = Item(
        name=data.name,
        price=data.price,
        description_user=data.description_user,
        description_internal=data.description_internal,
        purchase_limit_per_character=data.purchase_limit_per_character,
        purchase_limit_global=data.purchase_limit_global,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def get_items_with_stock(db: Session, character_id: int | None = None) -> list[ItemWithStock]:
    items = db.query(Item).all()
    result = []
    for item in items:
        total_purchases = db.query(Purchase).filter(Purchase.item_id == item.id).count()
        char_purchases = 0
        if character_id is not None:
            char_purchases = (
                db.query(Purchase)
                .filter(Purchase.item_id == item.id, Purchase.character_id == character_id)
                .count()
            )

        remaining_global = None
        if item.purchase_limit_global is not None:
            remaining_global = max(0, item.purchase_limit_global - total_purchases)

        remaining_per_character = None
        if item.purchase_limit_per_character is not None:
            remaining_per_character = max(0, item.purchase_limit_per_character - char_purchases)

        result.append(
            ItemWithStock(
                id=item.id,
                name=item.name,
                price=item.price,
                description_user=item.description_user,
                description_internal=item.description_internal,
                purchase_limit_per_character=item.purchase_limit_per_character,
                purchase_limit_global=item.purchase_limit_global,
                created_at=item.created_at,
                purchased_by_character=char_purchases,
                purchased_total=total_purchases,
                remaining_per_character=remaining_per_character,
                remaining_global=remaining_global,
            )
        )
    return result


def purchase_item(db: Session, data: PurchaseRequest) -> Purchase:
    # 1. 캐릭터 조회
    character = db.query(Character).filter(Character.id == data.character_id).first()
    if not character:
        raise HTTPException(status_code=404, detail="캐릭터를 찾을 수 없습니다.")

    # 2. 아이템 조회
    item = db.query(Item).filter(Item.id == data.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="아이템을 찾을 수 없습니다.")

    # 3. 재화 비교
    if character.gold < item.price:
        raise HTTPException(status_code=400, detail="재화가 부족합니다.")

    # 4. 캐릭터별 구매 횟수 체크
    if item.purchase_limit_per_character is not None:
        char_count = (
            db.query(Purchase)
            .filter(Purchase.item_id == item.id, Purchase.character_id == character.id)
            .count()
        )
        if char_count >= item.purchase_limit_per_character:
            raise HTTPException(status_code=400, detail="캐릭터 구매 한도를 초과했습니다.")

    # 5. 전체 구매 횟수 체크
    if item.purchase_limit_global is not None:
        global_count = db.query(Purchase).filter(Purchase.item_id == item.id).count()
        if global_count >= item.purchase_limit_global:
            raise HTTPException(status_code=400, detail="전체 구매 한도를 초과했습니다.")

    # 6. 재화 차감
    character.gold -= item.price

    # 7. 구매 기록 삽입
    purchase = Purchase(character_id=character.id, item_id=item.id)
    db.add(purchase)
    db.commit()
    db.refresh(purchase)
    return purchase


def get_purchases(db: Session, character_id: int | None, item_id: int | None) -> list[PurchaseRead]:
    query = db.query(Purchase, Item.name.label("item_name")).join(Item, Purchase.item_id == Item.id)
    if character_id is not None:
        query = query.filter(Purchase.character_id == character_id)
    if item_id is not None:
        query = query.filter(Purchase.item_id == item_id)

    rows = query.order_by(Purchase.created_at.desc()).all()
    return [
        PurchaseRead(
            id=row.Purchase.id,
            character_id=row.Purchase.character_id,
            item_id=row.Purchase.item_id,
            item_name=row.item_name,
            created_at=row.Purchase.created_at,
        )
        for row in rows
    ]
