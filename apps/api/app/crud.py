from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models import Character, Item, Purchase
from app.schemas import CharacterCreate, ItemCreate, BulkPurchaseRequest, ItemWithStock, PurchaseRead


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


def _sum_quantity(db: Session, item_id: int, character_id: int | None = None) -> int:
    q = db.query(func.coalesce(func.sum(Purchase.quantity), 0)).filter(Purchase.item_id == item_id)
    if character_id is not None:
        q = q.filter(Purchase.character_id == character_id)
    return q.scalar()


def get_items_with_stock(db: Session, character_id: int | None = None) -> list[ItemWithStock]:
    items = db.query(Item).all()
    result = []
    for item in items:
        total_purchased = _sum_quantity(db, item.id)
        char_purchased = _sum_quantity(db, item.id, character_id) if character_id is not None else 0

        remaining_global = (
            max(0, item.purchase_limit_global - total_purchased)
            if item.purchase_limit_global is not None else None
        )
        remaining_per_character = (
            max(0, item.purchase_limit_per_character - char_purchased)
            if item.purchase_limit_per_character is not None else None
        )

        result.append(ItemWithStock(
            id=item.id,
            name=item.name,
            price=item.price,
            description_user=item.description_user,
            description_internal=item.description_internal,
            purchase_limit_per_character=item.purchase_limit_per_character,
            purchase_limit_global=item.purchase_limit_global,
            created_at=item.created_at,
            purchased_by_character=char_purchased,
            purchased_total=total_purchased,
            remaining_per_character=remaining_per_character,
            remaining_global=remaining_global,
        ))
    return result


def bulk_purchase(db: Session, data: BulkPurchaseRequest) -> list[Purchase]:
    # 1. 캐릭터 조회
    character = db.query(Character).filter(Character.id == data.character_id).first()
    if not character:
        raise HTTPException(status_code=404, detail="캐릭터를 찾을 수 없습니다.")

    # 2. 아이템 검증 및 총 비용 계산
    total_cost = 0
    validated: list[tuple[Item, int]] = []

    for cart_item in data.items:
        item = db.query(Item).filter(Item.id == cart_item.item_id).first()
        if not item:
            raise HTTPException(status_code=404, detail=f"아이템 ID {cart_item.item_id}를 찾을 수 없습니다.")

        qty = cart_item.quantity
        if qty < 1:
            raise HTTPException(status_code=400, detail=f"'{item.name}' 수량은 1 이상이어야 합니다.")

        total_cost += item.price * qty

        # 캐릭터별 한도 체크
        if item.purchase_limit_per_character is not None:
            already = _sum_quantity(db, item.id, character.id)
            if already + qty > item.purchase_limit_per_character:
                remain = max(0, item.purchase_limit_per_character - already)
                raise HTTPException(
                    status_code=400,
                    detail=f"'{item.name}' 캐릭터 구매 한도 초과 (남은 횟수: {remain}개)"
                )

        # 전체 한도 체크
        if item.purchase_limit_global is not None:
            already_global = _sum_quantity(db, item.id)
            if already_global + qty > item.purchase_limit_global:
                remain = max(0, item.purchase_limit_global - already_global)
                raise HTTPException(
                    status_code=400,
                    detail=f"'{item.name}' 전체 구매 한도 초과 (남은 수량: {remain}개)"
                )

        validated.append((item, qty))

    # 3. 재화 확인
    if character.gold < total_cost:
        raise HTTPException(
            status_code=400,
            detail=f"재화가 부족합니다. (필요: {total_cost:,}G / 보유: {character.gold:,}G)"
        )

    # 4. 재화 차감 + 구매 기록 생성 (아이템별 별개 레코드)
    character.gold -= total_cost
    purchases = []
    for item, qty in validated:
        p = Purchase(character_id=character.id, item_id=item.id, quantity=qty)
        db.add(p)
        purchases.append(p)

    db.commit()
    for p in purchases:
        db.refresh(p)
    return purchases


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
            quantity=row.Purchase.quantity,
            created_at=row.Purchase.created_at,
        )
        for row in rows
    ]
