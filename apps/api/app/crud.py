from datetime import date, datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models import AttendanceRecord, Chapter, Challenge, ChallengeProgress, Character, Enemy, Item, Mission, MissionProgress, Purchase, Reward
from app.schemas import (
    AttendanceRecordRead,
    AttendanceRecordUpdate,
    BulkPurchaseRequest,
    ChapterCreate,
    ChapterRead,
    ChallengeCreate,
    ChallengeProgressBulkUpdate,
    ChallengeProgressRead,
    CharacterAchievedChallengeRead,
    CharacterCreate,
    CharacterDetailRead,
    CharacterOwnedItemRead,
    EnemyCreate,
    EnemyRead,
    EnemySkill,
    ItemCreate,
    ItemWithStock,
    MissionCreate,
    MissionProgressBulkUpdate,
    MissionProgressRead,
    PurchaseRead,
    RewardItemEntry,
    RewardPayResult,
    RewardRead,
)


def _normalize_character_ids(character_ids: list[int]) -> list[int]:
    return sorted(set(character_ids))


def _today() -> date:
    return datetime.now(timezone.utc).date()


def _to_reward_read(r: Reward) -> RewardRead:
    return RewardRead(
        id=r.id,
        type=r.type,
        character_id=r.character_id,
        source_id=r.source_id,
        reward_items=[RewardItemEntry(**item) for item in (r.reward_items or [])],
        rewarded_at=r.rewarded_at,
        created_at=r.created_at,
    )


def _apply_stat_rewards(
    entity: Challenge | Mission,
    character: Character,
    reward_items: list[dict],
) -> None:
    for entity_attr, char_attr, reward_type in (
        ("reward_gold",       "gold",       "gold"),
        ("reward_experience", "experience", "experience"),
        ("reward_ap",         "ap",         "ap"),
        ("reward_hp",         "hp",         "stat_hp"),
        ("reward_attack",     "attack",     "stat_attack"),
        ("reward_defense",    "defense",    "stat_defense"),
    ):
        amount = getattr(entity, entity_attr, 0)
        if amount > 0:
            setattr(character, char_attr, getattr(character, char_attr) + amount)
            reward_items.append({"type": reward_type, "amount": amount})


def _apply_item_grants(
    db: Session,
    item_grant_list: list[dict],
    items_map: dict,
    character_id: int,
    reward_items: list[dict],
) -> None:
    for grant in item_grant_list:
        item_id = grant.get("item_id")
        quantity = grant.get("quantity", 1)
        if item_id and item_id in items_map:
            db.add(Purchase(character_id=character_id, item_id=item_id, quantity=quantity))
            reward_items.append({"type": "item", "item_id": item_id, "quantity": quantity})


def _create_progress_rows(
    db: Session,
    challenge_ids: list[int],
    character_ids: list[int],
) -> None:
    if not challenge_ids or not character_ids:
        return

    existing_pairs = {
        (challenge_id, character_id)
        for challenge_id, character_id in (
            db.query(ChallengeProgress.challenge_id, ChallengeProgress.character_id)
            .filter(ChallengeProgress.challenge_id.in_(challenge_ids))
            .filter(ChallengeProgress.character_id.in_(character_ids))
            .all()
        )
    }

    for challenge_id in challenge_ids:
        for character_id in character_ids:
            if (challenge_id, character_id) in existing_pairs:
                continue
            db.add(ChallengeProgress(challenge_id=challenge_id, character_id=character_id))


def create_character(db: Session, data: CharacterCreate) -> Character:
    character = Character(
        name=data.name,
        hp=data.hp,
        attack=data.attack,
        defense=data.defense,
        gold=data.gold,
        ap=data.ap,
        experience=data.experience,
    )
    db.add(character)
    db.flush()

    challenge_ids = [challenge_id for challenge_id, in db.query(Challenge.id).all()]
    _create_progress_rows(db, challenge_ids, [character.id])

    db.commit()
    db.refresh(character)
    return character


def get_characters(db: Session) -> list[Character]:
    return db.query(Character).order_by(Character.id.asc()).all()


def get_character_detail(db: Session, character_id: int) -> CharacterDetailRead:
    character = db.query(Character).filter(Character.id == character_id).first()
    if not character:
        raise HTTPException(status_code=404, detail="캐릭터를 찾을 수 없습니다.")

    challenge_ids = [challenge_id for challenge_id, in db.query(Challenge.id).all()]
    _create_progress_rows(db, challenge_ids, [character.id])
    db.flush()

    owned_item_rows = (
        db.query(
            Purchase.item_id,
            Item.name.label("item_name"),
            func.coalesce(func.sum(Purchase.quantity), 0).label("quantity"),
        )
        .join(Item, Purchase.item_id == Item.id)
        .filter(Purchase.character_id == character.id)
        .group_by(Purchase.item_id, Item.name)
        .order_by(Item.name.asc())
        .all()
    )

    achieved_challenge_rows = (
        db.query(
            Challenge.id.label("challenge_id"),
            Challenge.chapter,
            Challenge.name,
            Challenge.description,
            Challenge.reward,
        )
        .join(ChallengeProgress, Challenge.id == ChallengeProgress.challenge_id)
        .filter(ChallengeProgress.character_id == character.id)
        .filter(ChallengeProgress.achieved.is_(True))
        .order_by(Challenge.chapter.asc(), Challenge.id.asc())
        .all()
    )

    return CharacterDetailRead(
        id=character.id,
        name=character.name,
        hp=character.hp,
        attack=character.attack,
        defense=character.defense,
        gold=character.gold,
        ap=character.ap,
        experience=character.experience,
        owned_items=[
            CharacterOwnedItemRead(
                item_id=row.item_id,
                item_name=row.item_name,
                quantity=row.quantity,
            )
            for row in owned_item_rows
        ],
        achieved_challenges=[
            CharacterAchievedChallengeRead(
                challenge_id=row.challenge_id,
                chapter=row.chapter,
                name=row.name,
                description=row.description,
                reward=row.reward,
            )
            for row in achieved_challenge_rows
        ],
        purchase_history=get_purchases(db, character.id, None),
        reward_history=get_rewards_by_character(db, character.id),
    )


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


def create_challenge(db: Session, data: ChallengeCreate) -> Challenge:
    challenge = Challenge(
        chapter=data.chapter.strip(),
        name=data.name.strip(),
        description=data.description.strip(),
        reward=data.reward.strip(),
        reward_gold=data.reward_gold,
        reward_experience=data.reward_experience,
        reward_ap=data.reward_ap,
        reward_hp=data.reward_hp,
        reward_attack=data.reward_attack,
        reward_defense=data.reward_defense,
        reward_items=data.reward_items,
        is_public=data.is_public,
    )
    db.add(challenge)
    db.flush()

    character_ids = [character_id for character_id, in db.query(Character.id).all()]
    _create_progress_rows(db, [challenge.id], character_ids)

    db.commit()
    db.refresh(challenge)
    return challenge


def get_challenges(db: Session, chapter: str | None = None) -> list[Challenge]:
    query = db.query(Challenge)
    if chapter is not None:
        query = query.filter(Challenge.chapter == chapter)
    return query.order_by(Challenge.created_at.asc(), Challenge.id.asc()).all()


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
    query = (
        db.query(
            Purchase,
            Character.name.label("character_name"),
            Item.name.label("item_name"),
        )
        .join(Character, Purchase.character_id == Character.id)
        .join(Item, Purchase.item_id == Item.id)
    )
    if character_id is not None:
        query = query.filter(Purchase.character_id == character_id)
    if item_id is not None:
        query = query.filter(Purchase.item_id == item_id)

    rows = query.order_by(Purchase.created_at.desc()).all()
    return [
        PurchaseRead(
            id=row.Purchase.id,
            character_id=row.Purchase.character_id,
            character_name=row.character_name,
            item_id=row.Purchase.item_id,
            item_name=row.item_name,
            quantity=row.Purchase.quantity,
            created_at=row.Purchase.created_at,
        )
        for row in rows
    ]


def get_challenge_progress(db: Session, challenge_id: int) -> list[ChallengeProgressRead]:
    challenge = db.query(Challenge).filter(Challenge.id == challenge_id).first()
    if not challenge:
        raise HTTPException(status_code=404, detail="도전과제를 찾을 수 없습니다.")

    character_ids = [character_id for character_id, in db.query(Character.id).all()]
    _create_progress_rows(db, [challenge.id], character_ids)
    db.commit()

    rows = (
        db.query(
            ChallengeProgress.character_id,
            Character.name.label("character_name"),
            ChallengeProgress.achieved,
            ChallengeProgress.memo,
        )
        .join(Character, ChallengeProgress.character_id == Character.id)
        .filter(ChallengeProgress.challenge_id == challenge_id)
        .order_by(Character.id.asc())
        .all()
    )

    return [
        ChallengeProgressRead(
            character_id=row.character_id,
            character_name=row.character_name,
            achieved=row.achieved,
            memo=row.memo,
        )
        for row in rows
    ]


def update_challenge_progress(
    db: Session,
    challenge_id: int,
    data: ChallengeProgressBulkUpdate,
) -> list[ChallengeProgressRead]:
    challenge = db.query(Challenge).filter(Challenge.id == challenge_id).first()
    if not challenge:
        raise HTTPException(status_code=404, detail="도전과제를 찾을 수 없습니다.")

    character_ids = [entry.character_id for entry in data.entries]
    _create_progress_rows(db, [challenge_id], character_ids)
    db.flush()

    rows = (
        db.query(ChallengeProgress)
        .filter(ChallengeProgress.challenge_id == challenge_id)
        .filter(ChallengeProgress.character_id.in_(character_ids))
        .all()
    )
    progress_by_character = {row.character_id: row for row in rows}

    for entry in data.entries:
        progress = progress_by_character.get(entry.character_id)
        if not progress:
            raise HTTPException(status_code=404, detail="도전과제 진행 현황을 찾을 수 없습니다.")
        progress.achieved = entry.achieved
        progress.memo = entry.memo.strip()
        progress.updated_at = datetime.now(timezone.utc)

    db.commit()
    return get_challenge_progress(db, challenge_id)


def get_attendance_record(db: Session, attendance_date: date) -> AttendanceRecordRead:
    record = (
        db.query(AttendanceRecord)
        .filter(AttendanceRecord.attendance_date == attendance_date)
        .first()
    )
    if not record:
        return AttendanceRecordRead(
            attendance_date=attendance_date,
            character_ids=[],
            reward_paid=False,
        )

    return AttendanceRecordRead.model_validate(record)


def get_rewards_by_character(db: Session, character_id: int) -> list[RewardRead]:
    rewards = (
        db.query(Reward)
        .filter(Reward.character_id == character_id)
        .order_by(Reward.created_at.desc())
        .all()
    )
    return [_to_reward_read(r) for r in rewards]


def pay_attendance_rewards(db: Session, attendance_date: date) -> RewardPayResult:
    record = (
        db.query(AttendanceRecord)
        .filter(AttendanceRecord.attendance_date == attendance_date)
        .first()
    )
    if not record or not record.character_ids:
        return RewardPayResult(paid_count=0, rewards=[])

    already_paid_ids = {
        r.character_id
        for r, in db.query(Reward.character_id)
        .filter(Reward.type == "attendance")
        .filter(Reward.rewarded_at == attendance_date)
        .all()
    }

    to_pay = [cid for cid in record.character_ids if cid not in already_paid_ids]
    if not to_pay:
        return RewardPayResult(paid_count=0, rewards=[])

    characters = {
        c.id: c
        for c in db.query(Character).filter(Character.id.in_(to_pay)).all()
    }

    created_rewards: list[Reward] = []
    for character_id in to_pay:
        character = characters.get(character_id)
        if not character:
            continue
        character.gold += 10
        reward = Reward(
            type="attendance",
            character_id=character_id,
            source_id=record.id,
            reward_items=[{"type": "gold", "amount": 10}],
            rewarded_at=attendance_date,
        )
        db.add(reward)
        created_rewards.append(reward)

    db.flush()
    rewards_read = [_to_reward_read(r) for r in created_rewards]
    db.commit()
    return RewardPayResult(paid_count=len(rewards_read), rewards=rewards_read)


def pay_challenge_rewards(db: Session, challenge_id: int) -> RewardPayResult:
    challenge = db.query(Challenge).filter(Challenge.id == challenge_id).first()
    if not challenge:
        raise HTTPException(status_code=404, detail="도전과제를 찾을 수 없습니다.")

    achieved_ids = {
        cp.character_id
        for cp in db.query(ChallengeProgress)
        .filter(ChallengeProgress.challenge_id == challenge_id)
        .filter(ChallengeProgress.achieved.is_(True))
        .all()
    }
    if not achieved_ids:
        return RewardPayResult(paid_count=0, rewards=[])

    already_paid_ids = {
        r.character_id
        for r, in db.query(Reward.character_id)
        .filter(Reward.type == "challenge")
        .filter(Reward.source_id == challenge_id)
        .all()
    }

    to_pay = achieved_ids - already_paid_ids
    if not to_pay:
        return RewardPayResult(paid_count=0, rewards=[])

    characters = {
        c.id: c
        for c in db.query(Character).filter(Character.id.in_(to_pay)).all()
    }

    item_grant_list = challenge.reward_items or []
    item_ids = [g["item_id"] for g in item_grant_list if "item_id" in g]
    items_map = (
        {item.id: item for item in db.query(Item).filter(Item.id.in_(item_ids)).all()}
        if item_ids else {}
    )

    created_rewards: list[Reward] = []
    for character_id in to_pay:
        character = characters.get(character_id)
        if not character:
            continue

        reward_items: list[dict] = []
        _apply_stat_rewards(challenge, character, reward_items)
        _apply_item_grants(db, item_grant_list, items_map, character_id, reward_items)

        reward = Reward(
            type="challenge",
            character_id=character_id,
            source_id=challenge_id,
            reward_items=reward_items,
            rewarded_at=_today(),
        )
        db.add(reward)
        created_rewards.append(reward)

    db.flush()
    rewards_read = [_to_reward_read(r) for r in created_rewards]
    db.commit()
    return RewardPayResult(paid_count=len(rewards_read), rewards=rewards_read)
    return RewardPayResult(paid_count=len(rewards_read), rewards=rewards_read)


def upsert_attendance_record(
    db: Session,
    attendance_date: date,
    data: AttendanceRecordUpdate,
) -> AttendanceRecordRead:
    character_ids = _normalize_character_ids(data.character_ids)

    if character_ids:
        existing_ids = {
            character_id
            for character_id, in (
                db.query(Character.id)
                .filter(Character.id.in_(character_ids))
                .all()
            )
        }
        missing_ids = sorted(set(character_ids) - existing_ids)
        if missing_ids:
            raise HTTPException(
                status_code=400,
                detail=f"존재하지 않는 캐릭터 ID가 포함되어 있습니다: {', '.join(map(str, missing_ids))}",
            )

    record = (
        db.query(AttendanceRecord)
        .filter(AttendanceRecord.attendance_date == attendance_date)
        .first()
    )

    if record is None:
        if not character_ids and not data.reward_paid:
            return AttendanceRecordRead(
                attendance_date=attendance_date,
                character_ids=[],
                reward_paid=False,
            )
        record = AttendanceRecord(attendance_date=attendance_date)
        db.add(record)

    record.character_ids = character_ids
    record.reward_paid = data.reward_paid
    record.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(record)
    return AttendanceRecordRead.model_validate(record)


# ── Mission ──────────────────────────────────────────────────────────────────

def _create_mission_progress_rows(
    db: Session,
    mission_ids: list[int],
    character_ids: list[int],
) -> None:
    if not mission_ids or not character_ids:
        return
    existing_pairs = {
        (mid, cid)
        for mid, cid in db.query(MissionProgress.mission_id, MissionProgress.character_id)
        .filter(MissionProgress.mission_id.in_(mission_ids))
        .filter(MissionProgress.character_id.in_(character_ids))
        .all()
    }
    for mid in mission_ids:
        for cid in character_ids:
            if (mid, cid) not in existing_pairs:
                db.add(MissionProgress(mission_id=mid, character_id=cid))


def create_mission(db: Session, data: MissionCreate) -> Mission:
    mission = Mission(
        chapter=data.chapter.strip(),
        mission_type=data.mission_type,
        name=data.name.strip(),
        description=data.description.strip(),
        reward=data.reward.strip(),
        reward_gold=data.reward_gold,
        reward_experience=data.reward_experience,
        reward_ap=data.reward_ap,
        reward_hp=data.reward_hp,
        reward_attack=data.reward_attack,
        reward_defense=data.reward_defense,
        reward_items=data.reward_items,
        is_public=data.is_public,
    )
    db.add(mission)
    db.flush()

    character_ids = [cid for cid, in db.query(Character.id).all()]
    _create_mission_progress_rows(db, [mission.id], character_ids)

    db.commit()
    db.refresh(mission)
    return mission


def get_missions(db: Session, chapter: str | None = None) -> list[Mission]:
    query = db.query(Mission)
    if chapter is not None:
        query = query.filter(Mission.chapter == chapter)
    return query.order_by(Mission.created_at.asc(), Mission.id.asc()).all()


def get_mission_progress(db: Session, mission_id: int) -> list[MissionProgressRead]:
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="임무를 찾을 수 없습니다.")

    character_ids = [cid for cid, in db.query(Character.id).all()]
    _create_mission_progress_rows(db, [mission.id], character_ids)
    db.commit()

    rows = (
        db.query(
            MissionProgress.character_id,
            Character.name.label("character_name"),
            MissionProgress.achieved,
            MissionProgress.memo,
        )
        .join(Character, MissionProgress.character_id == Character.id)
        .filter(MissionProgress.mission_id == mission_id)
        .order_by(Character.id.asc())
        .all()
    )
    return [
        MissionProgressRead(
            character_id=row.character_id,
            character_name=row.character_name,
            achieved=row.achieved,
            memo=row.memo,
        )
        for row in rows
    ]


def update_mission_progress(
    db: Session,
    mission_id: int,
    data: MissionProgressBulkUpdate,
) -> list[MissionProgressRead]:
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="임무를 찾을 수 없습니다.")

    character_ids = [entry.character_id for entry in data.entries]
    _create_mission_progress_rows(db, [mission_id], character_ids)
    db.flush()

    rows = (
        db.query(MissionProgress)
        .filter(MissionProgress.mission_id == mission_id)
        .filter(MissionProgress.character_id.in_(character_ids))
        .all()
    )
    progress_by_character = {row.character_id: row for row in rows}

    for entry in data.entries:
        progress = progress_by_character.get(entry.character_id)
        if not progress:
            raise HTTPException(status_code=404, detail="임무 진행 현황을 찾을 수 없습니다.")
        progress.achieved = entry.achieved
        progress.memo = entry.memo.strip()
        progress.updated_at = datetime.now(timezone.utc)

    db.commit()
    return get_mission_progress(db, mission_id)


def pay_mission_rewards(db: Session, mission_id: int) -> RewardPayResult:
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="임무를 찾을 수 없습니다.")

    achieved_ids = {
        mp.character_id
        for mp in db.query(MissionProgress)
        .filter(MissionProgress.mission_id == mission_id)
        .filter(MissionProgress.achieved.is_(True))
        .all()
    }
    if not achieved_ids:
        return RewardPayResult(paid_count=0, rewards=[])

    already_paid_ids = {
        r.character_id
        for r, in db.query(Reward.character_id)
        .filter(Reward.type == "mission")
        .filter(Reward.source_id == mission_id)
        .all()
    }

    to_pay = achieved_ids - already_paid_ids
    if not to_pay:
        return RewardPayResult(paid_count=0, rewards=[])

    characters = {
        c.id: c for c in db.query(Character).filter(Character.id.in_(to_pay)).all()
    }

    item_grant_list = mission.reward_items or []
    item_ids = [g["item_id"] for g in item_grant_list if "item_id" in g]
    items_map = (
        {item.id: item for item in db.query(Item).filter(Item.id.in_(item_ids)).all()}
        if item_ids else {}
    )

    created_rewards: list[Reward] = []
    for character_id in to_pay:
        character = characters.get(character_id)
        if not character:
            continue

        reward_items: list[dict] = []
        _apply_stat_rewards(mission, character, reward_items)
        _apply_item_grants(db, item_grant_list, items_map, character_id, reward_items)

        reward = Reward(
            type="mission",
            character_id=character_id,
            source_id=mission_id,
            reward_items=reward_items,
            rewarded_at=_today(),
        )
        db.add(reward)
        created_rewards.append(reward)

    db.flush()
    rewards_read = [_to_reward_read(r) for r in created_rewards]
    db.commit()
    return RewardPayResult(paid_count=len(rewards_read), rewards=rewards_read)


# ── Chapter ───────────────────────────────────────────────────────────────────

def get_chapters(db: Session) -> list[ChapterRead]:
    chapters = db.query(Chapter).order_by(Chapter.start_date.desc()).all()
    today = _today()
    return [
        ChapterRead(
            id=c.id,
            name=c.name,
            start_date=c.start_date,
            end_date=c.end_date,
            is_active=c.start_date <= today <= c.end_date,
            created_at=c.created_at,
        )
        for c in chapters
    ]


def create_chapter(db: Session, data: ChapterCreate) -> ChapterRead:
    chapter = Chapter(
        name=data.name.strip(),
        start_date=data.start_date,
        end_date=data.end_date,
    )
    db.add(chapter)
    db.commit()
    db.refresh(chapter)
    today = _today()
    return ChapterRead(
        id=chapter.id,
        name=chapter.name,
        start_date=chapter.start_date,
        end_date=chapter.end_date,
        is_active=chapter.start_date <= today <= chapter.end_date,
        created_at=chapter.created_at,
    )


def get_active_chapter(db: Session) -> ChapterRead | None:
    today = _today()
    chapter = (
        db.query(Chapter)
        .filter(Chapter.start_date <= today, Chapter.end_date >= today)
        .first()
    )
    if not chapter:
        return None
    return ChapterRead(
        id=chapter.id,
        name=chapter.name,
        start_date=chapter.start_date,
        end_date=chapter.end_date,
        is_active=True,
        created_at=chapter.created_at,
    )


# ── Enemy ─────────────────────────────────────────────────────────────────────

def get_enemies(db: Session, chapter: str | None = None) -> list[EnemyRead]:
    query = db.query(Enemy)
    if chapter is not None:
        query = query.filter(Enemy.chapter == chapter)
    enemies = query.order_by(Enemy.created_at.asc()).all()
    return [
        EnemyRead(
            id=e.id,
            name=e.name,
            chapter=e.chapter,
            base_hp=e.base_hp,
            hp_per_attacker=e.hp_per_attacker,
            hp_per_defender=e.hp_per_defender,
            hp_per_healer=e.hp_per_healer,
            attack=e.attack,
            skills=[EnemySkill(**s) for s in (e.skills or [])],
            created_at=e.created_at,
        )
        for e in enemies
    ]


def create_enemy(db: Session, data: EnemyCreate) -> EnemyRead:
    enemy = Enemy(
        name=data.name.strip(),
        chapter=data.chapter.strip() if data.chapter else None,
        base_hp=data.base_hp,
        hp_per_attacker=data.hp_per_attacker,
        hp_per_defender=data.hp_per_defender,
        hp_per_healer=data.hp_per_healer,
        attack=data.attack,
        skills=[s.model_dump() for s in data.skills],
    )
    db.add(enemy)
    db.commit()
    db.refresh(enemy)
    return EnemyRead(
        id=enemy.id,
        name=enemy.name,
        chapter=enemy.chapter,
        base_hp=enemy.base_hp,
        hp_per_attacker=enemy.hp_per_attacker,
        hp_per_defender=enemy.hp_per_defender,
        hp_per_healer=enemy.hp_per_healer,
        attack=enemy.attack,
        skills=[EnemySkill(**s) for s in (enemy.skills or [])],
        created_at=enemy.created_at,
    )
