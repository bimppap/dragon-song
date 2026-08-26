from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.auth import REFRESH_TOKEN_EXPIRE_DAYS, create_access_token, generate_refresh_token, hash_password, verify_password
from app.game_data import SKILL_TREE_MOCK, get_level_grade_stats
from app.models import AttendanceEntry, AttendanceRecord, BattleSession, Chapter, Challenge, ChallengeProgress, Character, CharacterItemState, CharacterSkillUnlock, Enemy, Item, Member, Mission, MissionProgress, Purchase, RefreshToken, Reward, SettlementRequest, SkillNode
from app.schemas import (
    ITEM_EFFECT_SPECIAL_STATS,
    ITEM_EFFECT_STAT_TYPES,
    TIER_LABELS,
    AdminGiftRequest,
    AttendanceEntryCreate,
    AttendanceEntryRead,
    AttendanceRewardPayResult,
    AttendanceStreakEntry,
    BattleActionRequest,
    BattleJoinRequest,
    BattleSessionRead,
    BattleSessionSummary,
    BattleStartRequest,
    BulkPurchaseRequest,
    ChapterCreate,
    ChapterRead,
    ChallengeCreate,
    ChallengeProgressBulkUpdate,
    ChallengeProgressRead,
    ChallengeUpdate,
    CharacterAchievedChallengeRead,
    CharacterCreate,
    CharacterDetailRead,
    CharacterFlagsUpdate,
    CharacterOnboardingCreate,
    CharacterOwnedItemRead,
    CharacterRead,
    CharacterSkillNodeRead,
    CharacterSkillTreeRead,
    EnemyCreate,
    EnemyRead,
    EnemySkill,
    ItemCreate,
    ItemWithStock,
    LoginRequest,
    MemberRead,
    MissionCreate,
    MissionProgressBulkUpdate,
    MissionProgressRead,
    MissionUpdate,
    PurchaseRead,
    RewardItemEntry,
    RewardPayResult,
    RewardRead,
    RewardWithCharacterRead,
    SettlementCreate,
    SettlementPayRequest,
    SettlementRead,
    SignupRequest,
    SkillNodeRead,
    SkillNodeUpdate,
)


def _today() -> date:
    return datetime.now(timezone.utc).date()


KST = timezone(timedelta(hours=9))


def _today_kst() -> date:
    """출석은 한국 시간 기준 하루 단위로 처리한다."""
    return datetime.now(KST).date()


def _get_character_or_404(db: Session, character_id: int) -> Character:
    character = db.query(Character).filter(Character.id == character_id).first()
    if not character:
        raise HTTPException(status_code=404, detail="캐릭터를 찾을 수 없습니다.")
    return character


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
        ("reward_gold",       "gold", "gold"),
        ("reward_experience", "exp",  "experience"),
        ("reward_ap",         "ap",   "ap"),
        ("reward_attack",     "atk",  "stat_attack"),
        ("reward_defense",    "def_", "stat_defense"),
    ):
        amount = getattr(entity, entity_attr, 0)
        if amount > 0:
            setattr(character, char_attr, getattr(character, char_attr) + amount)
            reward_items.append({"type": reward_type, "amount": amount})

    # HP 보상은 최대 체력과 현재 체력을 함께 올린다.
    hp_amount = getattr(entity, "reward_hp", 0)
    if hp_amount > 0:
        character.hp_max += hp_amount
        character.hp += hp_amount
        reward_items.append({"type": "stat_hp", "amount": hp_amount})


def _apply_item_grants(
    db: Session,
    item_grant_list: list[dict],
    items_map: dict,
    character_id: int,
    reward_items: list[dict],
) -> None:
    for grant in item_grant_list:
        if grant.get("type", "item") != "item":
            continue
        item_id = grant.get("item_id")
        quantity = grant.get("quantity", 1)
        if item_id and item_id in items_map:
            db.add(Purchase(character_id=character_id, item_id=item_id, quantity=quantity))
            reward_items.append({"type": "item", "item_id": item_id, "quantity": quantity})


def _apply_reward_stat_grants(
    reward_grants: list[dict],
    character: Character,
    reward_items: list[dict],
) -> None:
    for grant in reward_grants:
        if grant.get("type") != "stat":
            continue
        stat = grant.get("stat")
        amount = grant.get("amount", 0)
        _apply_item_effects(character, [{"stat": stat, "delta": amount}], sign=1)
        reward_items.append({"type": "stat", "stat": stat, "amount": amount})


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


# ── Member ────────────────────────────────────────────────────────────────────

def create_member(db: Session, data: SignupRequest) -> Member:
    existing = db.query(Member).filter(Member.login_id == data.login_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="이미 사용 중인 아이디입니다.")

    member = Member(
        login_id=data.login_id,
        password_hash=hash_password(data.password),
        role="RUNNER",
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


def authenticate_member(db: Session, data: LoginRequest) -> Member:
    member = db.query(Member).filter(Member.login_id == data.login_id).first()
    if not member or not verify_password(data.password, member.password_hash):
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 올바르지 않습니다.")
    return member


def issue_refresh_token(db: Session, member_id: int) -> str:
    token = generate_refresh_token()
    db.add(RefreshToken(
        token=token,
        member_id=member_id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    ))
    db.commit()
    return token


def _get_valid_refresh_token(db: Session, token: str) -> RefreshToken:
    row = db.query(RefreshToken).filter(RefreshToken.token == token).first()
    if not row or row.revoked_at is not None or row.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="유효하지 않거나 만료된 refresh token입니다.")
    return row


def refresh_access_token(db: Session, token: str) -> str:
    row = _get_valid_refresh_token(db, token)
    member = db.get(Member, row.member_id)
    if not member:
        raise HTTPException(status_code=401, detail="회원을 찾을 수 없습니다.")
    return create_access_token(member.id)


def revoke_refresh_token(db: Session, token: str) -> None:
    row = db.query(RefreshToken).filter(RefreshToken.token == token).first()
    if row and row.revoked_at is None:
        row.revoked_at = datetime.now(timezone.utc)
        db.commit()


def get_member_character_id(db: Session, member_id: int) -> int | None:
    character = db.query(Character).filter(Character.member_id == member_id).first()
    return character.id if character else None


def to_member_read(db: Session, member: Member) -> MemberRead:
    return MemberRead(
        id=member.id,
        login_id=member.login_id,
        role=member.role,
        character_id=get_member_character_id(db, member.id),
    )


def _character_read_kwargs(character: Character) -> dict:
    return dict(
        id=character.id,
        name=character.name,
        member_id=character.member_id,
        faction=character.faction,
        gold=character.gold,
        cp=character.cp,
        ap=character.ap,
        lv=character.lv,
        rank=character.rank,
        exp=character.exp,
        stat_courage=character.stat_courage,
        stat_endurance=character.stat_endurance,
        stat_charity=character.stat_charity,
        stat_wisdom=character.stat_wisdom,
        hp=character.hp,
        hp_max=character.hp_max,
        hp_max_p=character.hp_max_p,
        hp_regen_true=character.hp_regen_true,
        hp_regen_fixed=character.hp_regen_fixed,
        mp=character.mp,
        mp_max=character.mp_max,
        mp_regen=character.mp_regen,
        atk=character.atk,
        atk_p=character.atk_p,
        def_=character.def_,
        def_p=character.def_p,
        def_eff=character.def_eff,
        attn=character.attn,
        presence=character.presence,
        heal_eff=character.heal_eff,
        sh=character.sh,
        dmg_p=character.dmg_p,
        dmg_r=character.dmg_r,
        skill_lv=character.skill_lv,
        skill_eff_true=character.skill_eff_true,
        skill_eff_fixed=character.skill_eff_fixed,
        skill_cost=character.skill_cost,
        skill_target=character.skill_target,
        start_sh=character.start_sh,
        revive_hp=character.revive_hp,
        act_time=character.act_time,
        over_heal=character.over_heal,
        caution=character.caution,
        warning_count=character.warning_count,
        mission_passed=character.mission_passed,
        image_url=character.image_url,
    )


def scrub_admin_only_stats(character_read: CharacterRead) -> CharacterRead:
    return character_read.model_copy(update={
        "start_sh": None,
        "revive_hp": None,
        "act_time": None,
        "over_heal": None,
        "caution": None,
        "warning_count": None,
        "mission_passed": None,
    })


def _to_character_read(character: Character) -> CharacterRead:
    return CharacterRead(**_character_read_kwargs(character))


def create_character_for_member(
    db: Session,
    member: Member,
    data: CharacterOnboardingCreate,
) -> CharacterRead:
    if get_member_character_id(db, member.id) is not None:
        raise HTTPException(status_code=400, detail="이미 캐릭터를 생성했습니다.")

    starting_grade = get_level_grade_stats(1)
    character = Character(
        name=data.name.strip(),
        lv=1,
        hp=starting_grade["hp"],
        hp_max=starting_grade["hp"],
        atk=starting_grade["atk"],
        def_=starting_grade["def"],
        member_id=member.id,
        faction=data.faction,
        stat_courage=data.stat_courage,
        stat_endurance=data.stat_endurance,
        stat_charity=data.stat_charity,
        stat_wisdom=data.stat_wisdom,
    )
    db.add(character)
    db.flush()

    challenge_ids = [challenge_id for challenge_id, in db.query(Challenge.id).all()]
    _create_progress_rows(db, challenge_ids, [character.id])

    db.commit()
    db.refresh(character)
    return _to_character_read(character)


def create_character(db: Session, data: CharacterCreate) -> CharacterRead:
    character = Character(
        name=data.name,
        faction=data.faction,
        gold=data.gold,
        cp=data.cp,
        ap=data.ap,
        lv=data.lv,
        rank=data.rank,
        exp=data.exp,
        stat_courage=data.stat_courage,
        stat_endurance=data.stat_endurance,
        stat_charity=data.stat_charity,
        stat_wisdom=data.stat_wisdom,
        hp=data.hp,
        hp_max=data.hp_max,
        hp_max_p=data.hp_max_p,
        hp_regen_true=data.hp_regen_true,
        hp_regen_fixed=data.hp_regen_fixed,
        mp=data.mp,
        mp_max=data.mp_max,
        mp_regen=data.mp_regen,
        atk=data.atk,
        atk_p=data.atk_p,
        def_=data.def_,
        def_p=data.def_p,
        def_eff=data.def_eff,
        attn=data.attn,
        presence=data.presence,
        heal_eff=data.heal_eff,
        sh=data.sh,
        dmg_p=data.dmg_p,
        dmg_r=data.dmg_r,
        skill_lv=data.skill_lv,
        skill_eff_true=data.skill_eff_true,
        skill_eff_fixed=data.skill_eff_fixed,
        skill_cost=data.skill_cost,
        skill_target=data.skill_target,
        start_sh=data.start_sh,
        revive_hp=data.revive_hp,
        act_time=data.act_time,
        over_heal=data.over_heal,
    )
    db.add(character)
    db.flush()

    if data.skill_node_ids:
        if not data.faction:
            raise HTTPException(status_code=400, detail="기술을 선택하려면 진영을 먼저 선택해야 합니다.")
        node_ids = sorted(set(data.skill_node_ids))
        nodes = db.query(SkillNode).filter(SkillNode.id.in_(node_ids)).all()
        if len(nodes) != len(node_ids) or any(node.faction != data.faction for node in nodes):
            raise HTTPException(status_code=400, detail="선택한 진영에 속하지 않는 기술이 포함되어 있습니다.")
        for node in nodes:
            applied_effects = [dict(effect) for effect in (node.effects or [])]
            _apply_item_effects(character, applied_effects, sign=1)
            db.add(CharacterSkillUnlock(
                character_id=character.id,
                node_id=node.id,
                ap_spent=0,
                applied_effects=applied_effects,
            ))

    challenge_ids = [challenge_id for challenge_id, in db.query(Challenge.id).all()]
    _create_progress_rows(db, challenge_ids, [character.id])

    db.commit()
    db.refresh(character)
    return _to_character_read(character)


def get_characters(db: Session) -> list[CharacterRead]:
    characters = db.query(Character).order_by(Character.id.asc()).all()
    return [_to_character_read(c) for c in characters]


def update_character_flags(db: Session, character_id: int, data: CharacterFlagsUpdate) -> CharacterRead:
    character = _get_character_or_404(db, character_id)
    character.caution = data.caution
    character.warning_count = data.warning_count
    character.mission_passed = data.mission_passed
    db.commit()
    db.refresh(character)
    return _to_character_read(character)


def get_character_detail(db: Session, character_id: int) -> CharacterDetailRead:
    character = _get_character_or_404(db, character_id)

    challenge_ids = [challenge_id for challenge_id, in db.query(Challenge.id).all()]
    _create_progress_rows(db, challenge_ids, [character.id])
    db.flush()

    owned_item_rows = (
        db.query(
            Purchase.item_id,
            Item.name.label("item_name"),
            Item.description_user.label("item_description"),
            func.coalesce(func.sum(Purchase.quantity), 0).label("quantity"),
        )
        .join(Item, Purchase.item_id == Item.id)
        .filter(Purchase.character_id == character.id)
        .group_by(Purchase.item_id, Item.name, Item.description_user)
        .order_by(Item.name.asc())
        .all()
    )
    owned_item_ids = [row.item_id for row in owned_item_rows]
    items_by_id = (
        {i.id: i for i in db.query(Item).filter(Item.id.in_(owned_item_ids)).all()}
        if owned_item_ids else {}
    )
    item_states_by_id = {
        s.item_id: s
        for s in db.query(CharacterItemState).filter(CharacterItemState.character_id == character.id).all()
    }

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
        **_character_read_kwargs(character),
        owned_items=[
            CharacterOwnedItemRead(
                item_id=row.item_id,
                item_name=row.item_name,
                item_description=row.item_description,
                item_type=items_by_id[row.item_id].item_type,
                effects=items_by_id[row.item_id].effects or [],
                quantity=row.quantity,
                used_quantity=item_states_by_id[row.item_id].used_quantity if row.item_id in item_states_by_id else 0,
                equipped=item_states_by_id[row.item_id].equipped if row.item_id in item_states_by_id else False,
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
        attendance_streak=_attendance_streak(db, character.id),
    )


def _attended_dates_by_character(db: Session) -> dict[int, set[date]]:
    """레거시 출석부 기록과 새 출석 엔트리를 합쳐 캐릭터별 출석 날짜 집합을 만든다. 쿼리 2회."""
    dates_by_character: dict[int, set[date]] = {}
    legacy_rows = db.query(AttendanceRecord.attendance_date, AttendanceRecord.character_ids).all()
    for attendance_date, character_ids in legacy_rows:
        for character_id in character_ids or []:
            dates_by_character.setdefault(character_id, set()).add(attendance_date)
    entry_rows = db.query(AttendanceEntry.character_id, AttendanceEntry.attendance_date).all()
    for character_id, attendance_date in entry_rows:
        dates_by_character.setdefault(character_id, set()).add(attendance_date)
    return dates_by_character


def _streak_ending_at(present_dates: set[date], end_date: date) -> int:
    """end_date(미출석이면 그 전날)부터 거슬러 올라간 연속 출석 일수."""
    day = end_date if end_date in present_dates else end_date - timedelta(days=1)
    streak = 0
    while day in present_dates:
        streak += 1
        day = day - timedelta(days=1)
    return streak


def _attendance_streak(db: Session, character_id: int) -> int:
    """오늘(미출석이면 어제)부터 거슬러 올라가며 연속으로 출석한 일수."""
    present_dates = _attended_dates_by_character(db).get(character_id, set())
    return _streak_ending_at(present_dates, _today_kst())


def _chapters_by_name(db: Session) -> dict[str, Chapter]:
    return {c.name: c for c in db.query(Chapter).all()}


def _active_chapter(chapters_by_name: dict[str, Chapter]) -> Chapter | None:
    today = _today()
    for chapter in chapters_by_name.values():
        if chapter.start_date <= today <= chapter.end_date:
            return chapter
    return None


def _is_item_purchasable(
    item: Item,
    chapters_by_name: dict[str, Chapter],
    active_chapter: Chapter | None,
) -> bool:
    if item.sale_paused:
        return False
    if item.available_from_chapter is None and item.available_until_chapter is None:
        return True
    if active_chapter is None:
        return False

    from_chapter = chapters_by_name.get(item.available_from_chapter) if item.available_from_chapter else None
    until_chapter = chapters_by_name.get(item.available_until_chapter) if item.available_until_chapter else None

    if from_chapter and active_chapter.start_date < from_chapter.start_date:
        return False
    if until_chapter and active_chapter.start_date > until_chapter.start_date:
        return False
    return True


def _validate_item_chapter_window(db: Session, data: ItemCreate) -> None:
    chapters_by_name = _chapters_by_name(db)
    from_chapter = chapters_by_name.get(data.available_from_chapter) if data.available_from_chapter else None
    until_chapter = chapters_by_name.get(data.available_until_chapter) if data.available_until_chapter else None

    if data.available_from_chapter and not from_chapter:
        raise HTTPException(status_code=400, detail=f"존재하지 않는 챕터입니다: {data.available_from_chapter}")
    if data.available_until_chapter and not until_chapter:
        raise HTTPException(status_code=400, detail=f"존재하지 않는 챕터입니다: {data.available_until_chapter}")
    if from_chapter and until_chapter and from_chapter.start_date > until_chapter.start_date:
        raise HTTPException(status_code=400, detail="시작 챕터가 종료 챕터보다 늦을 수 없습니다.")


def _validate_item_restricted_mission(db: Session, data: ItemCreate) -> None:
    if data.restricted_mission_id is None:
        return
    if db.get(Mission, data.restricted_mission_id) is None:
        raise HTTPException(status_code=400, detail="존재하지 않는 임무입니다.")


def _apply_item_data(item: Item, data: ItemCreate) -> None:
    item.name = data.name
    item.price_gold = data.price_gold
    item.price_cp = data.price_cp
    item.description_user = data.description_user
    item.purchase_limit_per_character = data.purchase_limit_per_character
    item.purchase_limit_global = data.purchase_limit_global
    item.available_from_chapter = data.available_from_chapter
    item.available_until_chapter = data.available_until_chapter
    item.item_type = data.item_type
    item.restricted_mission_id = data.restricted_mission_id
    item.effects = [effect.model_dump() for effect in data.effects]
    item.sale_paused = data.sale_paused


def create_item(db: Session, data: ItemCreate) -> Item:
    _validate_item_chapter_window(db, data)
    _validate_item_restricted_mission(db, data)
    item = Item(
        name=data.name,
    )
    _apply_item_data(item, data)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def update_item(db: Session, item_id: int, data: ItemCreate) -> Item:
    item = db.get(Item, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="아이템을 찾을 수 없습니다.")

    _validate_item_chapter_window(db, data)
    _validate_item_restricted_mission(db, data)
    _apply_item_data(item, data)
    db.commit()
    db.refresh(item)
    return item


def _apply_item_effects(character: Character, effects: list[dict], sign: int) -> None:
    for effect in effects:
        stat = effect["stat"]
        # 능력치가 아닌 특수 효과(ap_reset 등)는 여기서 다루지 않는다.
        if stat not in ITEM_EFFECT_STAT_TYPES:
            continue
        if stat == "hp_heal_p":
            # 최대 체력 대비 퍼센트만큼 현재 체력을 회복(소모)한다. hp_max_p처럼 계수 자체를 저장하는 게 아니라
            # 즉시 hp에 반영되는 1회성 효과라 범용 "더하기" 로직과 분리해서 처리한다.
            delta_hp = character.hp_max * effect["delta"] * sign
            next_hp = int(round(character.hp + delta_hp))
            if not character.over_heal:
                next_hp = min(next_hp, character.hp_max)
            character.hp = next_hp
            continue
        attr = "def_" if stat == "def" else stat
        value_type = ITEM_EFFECT_STAT_TYPES[stat]
        delta = effect["delta"] * sign
        current = getattr(character, attr)
        next_value = int(round(current + delta)) if value_type is int else float(current + delta)
        if attr == "hp" and not character.over_heal:
            next_value = min(next_value, character.hp_max)
        setattr(character, attr, next_value)


def _get_or_create_item_state(db: Session, character_id: int, item_id: int) -> CharacterItemState:
    state = (
        db.query(CharacterItemState)
        .filter(CharacterItemState.character_id == character_id, CharacterItemState.item_id == item_id)
        .first()
    )
    if state is None:
        state = CharacterItemState(character_id=character_id, item_id=item_id)
        db.add(state)
        db.flush()
    return state


def use_item(db: Session, character_id: int, item_id: int) -> CharacterDetailRead:
    character = _get_character_or_404(db, character_id)
    item = db.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="아이템을 찾을 수 없습니다.")
    if item.item_type != "consumable":
        raise HTTPException(status_code=400, detail="소모형 아이템만 사용할 수 있습니다.")

    owned_quantity = _sum_quantity(db, item_id, character_id)
    state = _get_or_create_item_state(db, character_id, item_id)
    if state.used_quantity >= owned_quantity:
        raise HTTPException(status_code=400, detail="사용 가능한 수량이 없습니다.")

    _apply_item_effects(character, item.effects or [], sign=1)
    # 특수 효과: AP 초기화(기술 리셋). 능력치 효과와 별개로 처리한다.
    if any(effect.get("stat") == "ap_reset" for effect in (item.effects or [])):
        _reset_character_skills(db, character)
    state.used_quantity += 1
    db.commit()
    return get_character_detail(db, character_id)


def equip_item(db: Session, character_id: int, item_id: int) -> CharacterDetailRead:
    character = _get_character_or_404(db, character_id)
    item = db.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="아이템을 찾을 수 없습니다.")
    if item.item_type != "equipment":
        raise HTTPException(status_code=400, detail="장착형 아이템만 장착할 수 있습니다.")

    owned_quantity = _sum_quantity(db, item_id, character_id)
    if owned_quantity <= 0:
        raise HTTPException(status_code=400, detail="보유하고 있지 않은 아이템입니다.")

    state = _get_or_create_item_state(db, character_id, item_id)
    if state.equipped:
        raise HTTPException(status_code=400, detail="이미 장착 중인 아이템입니다.")

    _apply_item_effects(character, item.effects or [], sign=1)
    state.equipped = True
    db.commit()
    return get_character_detail(db, character_id)


def unequip_item(db: Session, character_id: int, item_id: int) -> CharacterDetailRead:
    character = _get_character_or_404(db, character_id)
    item = db.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="아이템을 찾을 수 없습니다.")

    state = _get_or_create_item_state(db, character_id, item_id)
    if not state.equipped:
        raise HTTPException(status_code=400, detail="장착 중인 아이템이 아닙니다.")

    _apply_item_effects(character, item.effects or [], sign=-1)
    state.equipped = False
    db.commit()
    return get_character_detail(db, character_id)


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


def update_challenge(db: Session, challenge_id: int, data: ChallengeUpdate) -> Challenge:
    challenge = db.get(Challenge, challenge_id)
    if not challenge:
        raise HTTPException(status_code=404, detail="도전과제를 찾을 수 없습니다.")

    challenge.chapter = data.chapter.strip()
    challenge.name = data.name.strip()
    challenge.description = data.description.strip()
    challenge.reward = data.reward.strip()
    challenge.reward_gold = data.reward_gold
    challenge.reward_experience = data.reward_experience
    challenge.reward_ap = data.reward_ap
    challenge.reward_hp = data.reward_hp
    challenge.reward_attack = data.reward_attack
    challenge.reward_defense = data.reward_defense
    challenge.reward_items = data.reward_items
    challenge.is_public = data.is_public

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


def _rewarded_mission_ids(db: Session, character_id: int) -> set[int]:
    """캐릭터가 보상을 수령한 임무 ID 집합."""
    rows = (
        db.query(Reward.source_id)
        .filter(Reward.type == "mission")
        .filter(Reward.character_id == character_id)
        .all()
    )
    return {source_id for source_id, in rows if source_id is not None}


def get_items_with_stock(db: Session, character_id: int | None = None) -> list[ItemWithStock]:
    items = db.query(Item).all()
    chapters_by_name = _chapters_by_name(db)
    active_chapter = _active_chapter(chapters_by_name)
    rewarded_mission_ids = _rewarded_mission_ids(db, character_id) if character_id is not None else set()

    # 아이템별로 반복 쿼리하는 대신 한 번의 집계 쿼리로 구매 합계를 전부 가져온다.
    total_purchased_by_item: dict[int, int] = dict(
        db.query(Purchase.item_id, func.coalesce(func.sum(Purchase.quantity), 0)).group_by(Purchase.item_id).all()
    )
    char_purchased_by_item: dict[int, int] = dict(
        db.query(Purchase.item_id, func.coalesce(func.sum(Purchase.quantity), 0))
        .filter(Purchase.character_id == character_id)
        .group_by(Purchase.item_id)
        .all()
    ) if character_id is not None else {}

    result = []
    for item in items:
        total_purchased = total_purchased_by_item.get(item.id, 0)
        char_purchased = char_purchased_by_item.get(item.id, 0)

        remaining_global = (
            max(0, item.purchase_limit_global - total_purchased)
            if item.purchase_limit_global is not None else None
        )
        remaining_per_character = (
            max(0, item.purchase_limit_per_character - char_purchased)
            if item.purchase_limit_per_character is not None else None
        )

        restricted_by_mission = (
            item.restricted_mission_id is not None
            and item.restricted_mission_id in rewarded_mission_ids
        )
        result.append(ItemWithStock(
            id=item.id,
            name=item.name,
            price_gold=item.price_gold,
            price_cp=item.price_cp,
            description_user=item.description_user,
            purchase_limit_per_character=item.purchase_limit_per_character,
            purchase_limit_global=item.purchase_limit_global,
            available_from_chapter=item.available_from_chapter,
            available_until_chapter=item.available_until_chapter,
            item_type=item.item_type,
            restricted_mission_id=item.restricted_mission_id,
            image_url=item.image_url,
            effects=item.effects or [],
            created_at=item.created_at,
            purchased_by_character=char_purchased,
            purchased_total=total_purchased,
            remaining_per_character=remaining_per_character,
            remaining_global=remaining_global,
            purchasable=(
                _is_item_purchasable(item, chapters_by_name, active_chapter)
                and not restricted_by_mission
            ),
        ))
    return result


def bulk_purchase(db: Session, data: BulkPurchaseRequest, is_admin: bool = False) -> list[Purchase]:
    # 1. 캐릭터 조회
    character = db.query(Character).filter(Character.id == data.character_id).first()
    if not character:
        raise HTTPException(status_code=404, detail="캐릭터를 찾을 수 없습니다.")

    # 2. 아이템 검증 및 총 비용 계산
    total_cost_gold = 0
    total_cost_cp = 0
    validated: list[tuple[Item, int]] = []
    chapters_by_name = _chapters_by_name(db)
    active_chapter = _active_chapter(chapters_by_name)
    rewarded_mission_ids = _rewarded_mission_ids(db, character.id)

    # 장바구니 아이템 조회 및 한도 체크용 구매 합계를 한 번에 집계한다(아이템별 반복 쿼리 방지).
    item_ids = [cart_item.item_id for cart_item in data.items]
    items_by_id = {i.id: i for i in db.query(Item).filter(Item.id.in_(item_ids)).all()} if item_ids else {}
    per_character_sums = dict(
        db.query(Purchase.item_id, func.coalesce(func.sum(Purchase.quantity), 0))
        .filter(Purchase.character_id == character.id, Purchase.item_id.in_(item_ids))
        .group_by(Purchase.item_id)
        .all()
    ) if item_ids else {}
    global_sums = dict(
        db.query(Purchase.item_id, func.coalesce(func.sum(Purchase.quantity), 0))
        .filter(Purchase.item_id.in_(item_ids))
        .group_by(Purchase.item_id)
        .all()
    ) if item_ids else {}

    for cart_item in data.items:
        item = items_by_id.get(cart_item.item_id)
        if not item:
            raise HTTPException(status_code=404, detail=f"아이템 ID {cart_item.item_id}를 찾을 수 없습니다.")

        if not is_admin and not _is_item_purchasable(item, chapters_by_name, active_chapter):
            raise HTTPException(status_code=400, detail=f"'{item.name}'은(는) 현재 구매할 수 없는 아이템입니다.")

        if not is_admin and item.restricted_mission_id in rewarded_mission_ids:
            raise HTTPException(
                status_code=400,
                detail=f"'{item.name}'은(는) 해당 임무 보상을 받은 캐릭터는 구매할 수 없습니다.",
            )

        qty = cart_item.quantity
        if qty < 1:
            raise HTTPException(status_code=400, detail=f"'{item.name}' 수량은 1 이상이어야 합니다.")

        total_cost_gold += (item.price_gold or 0) * qty
        total_cost_cp += (item.price_cp or 0) * qty

        # 캐릭터별 한도 체크
        if item.purchase_limit_per_character is not None:
            already = per_character_sums.get(item.id, 0)
            if already + qty > item.purchase_limit_per_character:
                remain = max(0, item.purchase_limit_per_character - already)
                raise HTTPException(
                    status_code=400,
                    detail=f"'{item.name}' 캐릭터 구매 한도 초과 (남은 횟수: {remain}개)"
                )

        # 전체 한도 체크
        if item.purchase_limit_global is not None:
            already_global = global_sums.get(item.id, 0)
            if already_global + qty > item.purchase_limit_global:
                remain = max(0, item.purchase_limit_global - already_global)
                raise HTTPException(
                    status_code=400,
                    detail=f"'{item.name}' 전체 구매 한도 초과 (남은 수량: {remain}개)"
                )

        validated.append((item, qty))

    # 3. 재화 확인
    shortages = []
    if character.gold < total_cost_gold:
        shortages.append(f"골드 (필요: {total_cost_gold:,}G / 보유: {character.gold:,}G)")
    if character.cp < total_cost_cp:
        shortages.append(f"CP (필요: {total_cost_cp:,} / 보유: {character.cp:,})")
    if shortages:
        raise HTTPException(status_code=400, detail=f"재화가 부족합니다. {', '.join(shortages)}")

    # 4. 재화 차감 + 구매 기록 생성 (아이템별 별개 레코드)
    character.gold -= total_cost_gold
    character.cp -= total_cost_cp
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
            Character.image_url.label("character_image_url"),
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
            character_image_url=row.character_image_url,
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


ATTENDANCE_REWARD_GOLD = 1
ATTENDANCE_REWARD_CP = 1
ATTENDANCE_STREAK_RANK_LIMIT = 5  # 연속출석 순위는 5위까지만 노출한다(동률은 같은 순위 공유).


def _to_attendance_entry_read(entry: AttendanceEntry, character: Character | None) -> AttendanceEntryRead:
    return AttendanceEntryRead(
        id=entry.id,
        attendance_date=entry.attendance_date,
        character_id=entry.character_id,
        character_name=character.name if character else "(삭제된 캐릭터)",
        character_image_url=character.image_url if character else None,
        reward_paid=entry.reward_paid,
        created_at=entry.created_at,
    )


def get_attendance_entries(db: Session) -> list[AttendanceEntryRead]:
    """전체 출석 기록을 최신순으로 반환한다."""
    entries = (
        db.query(AttendanceEntry)
        .order_by(AttendanceEntry.attendance_date.desc(), AttendanceEntry.id.desc())
        .all()
    )
    character_ids = {e.character_id for e in entries}
    characters = {
        c.id: c for c in db.query(Character).filter(Character.id.in_(character_ids)).all()
    } if character_ids else {}

    return [_to_attendance_entry_read(entry, characters.get(entry.character_id)) for entry in entries]


def create_attendance_entry(db: Session, data: AttendanceEntryCreate) -> list[AttendanceEntryRead]:
    """관리자가 선택한 캐릭터를 해당 날짜에 출석 처리한다. 보상은 별도로 지급한다."""
    character = db.get(Character, data.character_id)
    if not character:
        raise HTTPException(status_code=404, detail="캐릭터를 찾을 수 없습니다.")

    duplicate = (
        db.query(AttendanceEntry)
        .filter(AttendanceEntry.attendance_date == data.attendance_date)
        .filter(AttendanceEntry.character_id == data.character_id)
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=400, detail="이미 해당 날짜에 출석 처리된 캐릭터입니다.")

    db.add(AttendanceEntry(attendance_date=data.attendance_date, character_id=character.id))
    db.commit()
    return get_attendance_entries(db)


def pay_attendance_rewards(db: Session) -> AttendanceRewardPayResult:
    """출석했지만 보상을 받지 않은 모든 캐릭터에게 출석 보상을 일괄 지급한다."""
    unpaid_entries = db.query(AttendanceEntry).filter(AttendanceEntry.reward_paid.is_(False)).all()
    character_ids = {entry.character_id for entry in unpaid_entries}
    characters_by_id = {
        c.id: c for c in db.query(Character).filter(Character.id.in_(character_ids)).all()
    } if character_ids else {}

    paid_count = 0
    for entry in unpaid_entries:
        character = characters_by_id.get(entry.character_id)
        if character is None:
            continue

        character.gold += ATTENDANCE_REWARD_GOLD
        character.cp += ATTENDANCE_REWARD_CP
        db.add(Reward(
            type="attendance",
            character_id=character.id,
            source_id=entry.id,
            reward_items=[
                {"type": "gold", "amount": ATTENDANCE_REWARD_GOLD},
                {"type": "stat", "stat": "cp", "amount": ATTENDANCE_REWARD_CP},
            ],
            rewarded_at=_today_kst(),
        ))
        entry.reward_paid = True
        paid_count += 1

    db.commit()
    return AttendanceRewardPayResult(paid_count=paid_count, entries=get_attendance_entries(db))


def get_attendance_streak_ranking(db: Session) -> list[AttendanceStreakEntry]:
    """연속출석 순위를 5위까지 반환한다. 연속 출석일이 같으면 같은 순위를 공유한다(밀집 순위)."""
    characters = db.query(Character).order_by(Character.name.asc()).all()
    dates_by_character = _attended_dates_by_character(db)
    today = _today_kst()

    streaks = [
        (character, _streak_ending_at(dates_by_character.get(character.id, set()), today))
        for character in characters
    ]
    streaks = sorted(
        (item for item in streaks if item[1] > 0),
        key=lambda item: (-item[1], item[0].name),
    )

    result: list[AttendanceStreakEntry] = []
    rank = 0
    last_streak: int | None = None
    for character, streak in streaks:
        if streak != last_streak:
            rank += 1
            last_streak = streak
        if rank > ATTENDANCE_STREAK_RANK_LIMIT:
            break
        result.append(AttendanceStreakEntry(
            character_id=character.id,
            character_name=character.name,
            character_image_url=character.image_url,
            streak=streak,
            rank=rank,
        ))
    return result


def get_rewards_by_character(db: Session, character_id: int) -> list[RewardRead]:
    rewards = (
        db.query(Reward)
        .filter(Reward.character_id == character_id)
        .order_by(Reward.created_at.desc())
        .all()
    )
    return [_to_reward_read(r) for r in rewards]


# ── Settlement (정산) ────────────────────────────────────────────────────────

SETTLEMENT_GOLD_PER_POST = 1        # 게시글 1개당 1골드
SETTLEMENT_COMMENTS_PER_CP = 50     # 댓글 50개당 1CP
SETTLEMENT_CP_PER_LINK = 1          # 로그 링크 1개당 1CP


def _latest_paid_board_settlement(
    db: Session, character_id: int, before_id: int | None = None
) -> SettlementRequest | None:
    query = (
        db.query(SettlementRequest)
        .filter(SettlementRequest.character_id == character_id)
        .filter(SettlementRequest.type == "board")
        .filter(SettlementRequest.status == "paid")
    )
    if before_id is not None:
        query = query.filter(SettlementRequest.id != before_id)
    return query.order_by(SettlementRequest.id.desc()).first()


def _settlement_suggestion(db: Session, req: SettlementRequest) -> tuple[int, int]:
    """규칙과 직전 지급 이력으로 지급 제안값(골드, CP)을 계산한다."""
    if req.type == "log":
        return 0, len(req.links or []) * SETTLEMENT_CP_PER_LINK

    prev = _latest_paid_board_settlement(db, req.character_id, before_id=req.id)
    prev_posts = prev.total_posts if prev else 0
    prev_comments = prev.total_comments if prev else 0
    gold = (req.total_posts or 0) - (prev_posts or 0)
    cp = (req.total_comments or 0) // SETTLEMENT_COMMENTS_PER_CP - (prev_comments or 0) // SETTLEMENT_COMMENTS_PER_CP
    return max(0, gold) * SETTLEMENT_GOLD_PER_POST, max(0, cp)


def _to_settlement_read(db: Session, req: SettlementRequest, character: Character | None) -> SettlementRead:
    suggested_gold, suggested_cp = _settlement_suggestion(db, req)
    return SettlementRead(
        id=req.id,
        character_id=req.character_id,
        character_name=character.name if character else "(삭제된 캐릭터)",
        character_image_url=character.image_url if character else None,
        type=req.type,
        total_posts=req.total_posts,
        total_comments=req.total_comments,
        links=req.links or [],
        status=req.status,
        suggested_gold=suggested_gold,
        suggested_cp=suggested_cp,
        paid_gold=req.paid_gold,
        paid_cp=req.paid_cp,
        created_at=req.created_at,
        updated_at=req.updated_at,
    )


def get_settlement_requests(
    db: Session,
    character_id: int | None = None,
) -> list[SettlementRead]:
    query = db.query(SettlementRequest)
    if character_id is not None:
        query = query.filter(SettlementRequest.character_id == character_id)
    requests = query.order_by(SettlementRequest.id.desc()).all()

    character_ids = {r.character_id for r in requests}
    characters = {
        c.id: c for c in db.query(Character).filter(Character.id.in_(character_ids)).all()
    } if character_ids else {}
    return [_to_settlement_read(db, r, characters.get(r.character_id)) for r in requests]


def create_settlement_request(db: Session, member: Member, data: SettlementCreate) -> list[SettlementRead]:
    character_id = get_member_character_id(db, member.id)
    if character_id is None:
        raise HTTPException(status_code=400, detail="정산을 요청하려면 먼저 캐릭터를 생성해야 합니다.")

    db.add(SettlementRequest(
        character_id=character_id,
        type=data.type,
        total_posts=data.total_posts,
        total_comments=data.total_comments,
        links=data.links,
    ))
    db.commit()
    return get_settlement_requests(db, character_id)


def pay_settlement(db: Session, settlement_id: int, data: SettlementPayRequest) -> SettlementRead:
    req = db.get(SettlementRequest, settlement_id)
    if not req:
        raise HTTPException(status_code=404, detail="정산 요청을 찾을 수 없습니다.")
    if req.status == "paid":
        raise HTTPException(status_code=400, detail="이미 지급된 정산 요청입니다.")

    character = _get_character_or_404(db, req.character_id)
    reward_items: list[dict] = []
    if data.gold > 0:
        character.gold += data.gold
        reward_items.append({"type": "gold", "amount": data.gold})
    if data.cp > 0:
        character.cp += data.cp
        reward_items.append({"type": "stat", "stat": "cp", "amount": data.cp})

    reward = Reward(
        type="settlement",
        character_id=character.id,
        source_id=req.id,
        reward_items=reward_items,
        rewarded_at=_today_kst(),
    )
    db.add(reward)
    db.flush()

    req.status = "paid"
    req.paid_gold = data.gold
    req.paid_cp = data.cp
    req.reward_id = reward.id
    db.commit()
    return _to_settlement_read(db, req, character)


# ── Reward admin (전체 이력 조회 / 회수) ─────────────────────────────────────

REWARD_HISTORY_LIMIT = 500  # 계속 누적되는 이력 테이블이라 응답 크기를 상한선으로 제한한다.


def get_all_rewards(
    db: Session,
    character_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[RewardWithCharacterRead]:
    query = db.query(Reward, Character.name).join(Character, Reward.character_id == Character.id)
    if character_id is not None:
        query = query.filter(Reward.character_id == character_id)
    if date_from is not None:
        query = query.filter(Reward.rewarded_at >= date_from)
    if date_to is not None:
        query = query.filter(Reward.rewarded_at <= date_to)
    # 이력이 계속 쌓이는 테이블이라 무제한 조회를 막는다. 더 좁혀 보려면 캐릭터/기간 필터를 사용한다.
    rows = query.order_by(Reward.created_at.desc(), Reward.id.desc()).limit(REWARD_HISTORY_LIMIT).all()

    revoked_ids = {
        source_id
        for source_id, in db.query(Reward.source_id).filter(Reward.type == "revoke").all()
        if source_id is not None
    }
    return [
        RewardWithCharacterRead(
            **_to_reward_read(reward).model_dump(),
            character_name=character_name,
            revoked=reward.id in revoked_ids,
        )
        for reward, character_name in rows
    ]


def revoke_reward(db: Session, reward_id: int) -> RewardWithCharacterRead:
    """지급된 보상을 되돌리고, 회수 내역을 보상 이력에 남긴다. 회수 후 값이 음수여도 허용한다."""
    reward = db.get(Reward, reward_id)
    if not reward:
        raise HTTPException(status_code=404, detail="보상 내역을 찾을 수 없습니다.")
    if reward.type == "revoke":
        raise HTTPException(status_code=400, detail="회수 내역은 다시 회수할 수 없습니다.")
    already = (
        db.query(Reward.id)
        .filter(Reward.type == "revoke")
        .filter(Reward.source_id == reward.id)
        .first()
    )
    if already:
        raise HTTPException(status_code=400, detail="이미 회수된 보상입니다.")

    character = _get_character_or_404(db, reward.character_id)

    negated: list[dict] = []
    for entry in reward.reward_items or []:
        entry_type = entry.get("type")
        amount = entry.get("amount", 0) or 0
        if entry_type == "gold":
            character.gold -= int(amount)
        elif entry_type == "experience":
            character.exp -= int(amount)
        elif entry_type == "ap":
            character.ap -= int(amount)
        elif entry_type == "stat_attack":
            character.atk -= int(amount)
        elif entry_type == "stat_defense":
            character.def_ -= int(amount)
        elif entry_type == "stat_hp":
            character.hp_max -= int(amount)
            character.hp -= int(amount)
        elif entry_type == "stat":
            _apply_item_effects(character, [{"stat": entry.get("stat"), "delta": amount}], sign=-1)
        elif entry_type == "item":
            quantity = entry.get("quantity", 1) or 1
            db.add(Purchase(
                character_id=character.id,
                item_id=entry.get("item_id"),
                quantity=-quantity,
            ))
            negated.append({"type": "item", "item_id": entry.get("item_id"), "quantity": -quantity})
            continue
        negated.append({**entry, "amount": -amount})

    revoke = Reward(
        type="revoke",
        character_id=character.id,
        source_id=reward.id,
        reward_items=negated,
        rewarded_at=_today_kst(),
    )
    db.add(revoke)
    db.flush()
    result = RewardWithCharacterRead(
        **_to_reward_read(revoke).model_dump(),
        character_name=character.name,
        revoked=False,
    )
    db.commit()
    return result


def send_admin_gift(db: Session, data: AdminGiftRequest) -> RewardRead:
    """관리자가 캐릭터에게 골드·CP·아이템을 지급하고 '관리자의 선물' 보상 이력을 남긴다."""
    character = _get_character_or_404(db, data.character_id)

    reward_items: list[dict] = []
    if data.gold > 0:
        character.gold += data.gold
        reward_items.append({"type": "gold", "amount": data.gold})
    if data.cp > 0:
        character.cp += data.cp
        reward_items.append({"type": "stat", "stat": "cp", "amount": data.cp})

    if data.items:
        item_ids = [cart_item.item_id for cart_item in data.items]
        items_map = {i.id: i for i in db.query(Item).filter(Item.id.in_(item_ids)).all()}
        missing = sorted(set(item_ids) - set(items_map))
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"존재하지 않는 아이템 ID: {', '.join(map(str, missing))}",
            )
        item_grants = [
            {"type": "item", "item_id": cart_item.item_id, "quantity": cart_item.quantity}
            for cart_item in data.items
        ]
        _apply_item_grants(db, item_grants, items_map, character.id, reward_items)

    reward = Reward(
        type="admin_gift",
        character_id=character.id,
        source_id=None,
        reward_items=reward_items,
        rewarded_at=_today_kst(),
    )
    db.add(reward)
    db.flush()
    reward_read = _to_reward_read(reward)
    db.commit()
    return reward_read


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
    item_ids = [g["item_id"] for g in item_grant_list if g.get("type", "item") == "item" and "item_id" in g]
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
        _apply_reward_stat_grants(item_grant_list, character, reward_items)
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


def update_mission(db: Session, mission_id: int, data: MissionUpdate) -> Mission:
    mission = db.get(Mission, mission_id)
    if not mission:
        raise HTTPException(status_code=404, detail="임무를 찾을 수 없습니다.")

    mission.chapter = data.chapter.strip()
    mission.mission_type = data.mission_type
    mission.name = data.name.strip()
    mission.description = data.description.strip()
    mission.reward = data.reward.strip()
    mission.reward_gold = data.reward_gold
    mission.reward_experience = data.reward_experience
    mission.reward_ap = data.reward_ap
    mission.reward_hp = data.reward_hp
    mission.reward_attack = data.reward_attack
    mission.reward_defense = data.reward_defense
    mission.reward_items = data.reward_items
    mission.is_public = data.is_public

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
            Character.image_url.label("character_image_url"),
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
            character_image_url=row.character_image_url,
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
    item_ids = [g["item_id"] for g in item_grant_list if g.get("type", "item") == "item" and "item_id" in g]
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
        _apply_reward_stat_grants(item_grant_list, character, reward_items)
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
            image_url=c.image_url,
            music_url=c.music_url,
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
        music_url=data.music_url.strip() if data.music_url else None,
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
        image_url=chapter.image_url,
        music_url=chapter.music_url,
        is_active=chapter.start_date <= today <= chapter.end_date,
        created_at=chapter.created_at,
    )


def update_chapter(db: Session, chapter_id: int, data: ChapterCreate) -> ChapterRead:
    chapter = db.get(Chapter, chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="챕터를 찾을 수 없습니다.")
    chapter.name = data.name.strip()
    chapter.start_date = data.start_date
    chapter.end_date = data.end_date
    chapter.music_url = data.music_url.strip() if data.music_url else None
    db.commit()
    db.refresh(chapter)
    today = _today()
    return ChapterRead(
        id=chapter.id,
        name=chapter.name,
        start_date=chapter.start_date,
        end_date=chapter.end_date,
        image_url=chapter.image_url,
        music_url=chapter.music_url,
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
        image_url=chapter.image_url,
        music_url=chapter.music_url,
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


# ── Battle ───────────────────────────────────────────────────────────────────
# 참가자/에너미/소환수 상태는 JSON 스냅샷(dict)으로 BattleSession에 저장한다.
# 아이템 효과의 stat 이름 → 전투 스냅샷 dict 키 매핑(경제/성장 스탯은 전투 중 의미가 없어 제외한다).
BATTLE_ITEM_EFFECT_KEYS: dict[str, str] = {
    "hp": "hp", "hp_max": "max_hp", "mp": "mp", "mp_max": "max_mp",
    "atk": "atk", "atk_p": "atk_p", "def": "def", "def_p": "def_p", "def_eff": "def_eff",
    "dmg_p": "dmg_p", "dmg_r": "dmg_r", "heal_eff": "heal_eff", "skill_target": "skill_target",
    "attn": "attn", "presence": "presence", "sh": "shield",
    "skill_lv": "skill_lv", "skill_eff_true": "skill_eff_true", "skill_eff_fixed": "skill_eff_fixed",
    "skill_cost": "skill_cost",
}


def _snapshot_combatant(character: Character) -> dict:
    max_hp = max(round(character.hp_max * (1 + character.hp_max_p)), character.hp, 1)
    return {
        "character_id": character.id,
        "name": character.name,
        "image_url": character.image_url,
        "faction": character.faction,
        "atk": character.atk, "atk_p": character.atk_p, "dmg_p": character.dmg_p,
        "skill_lv": character.skill_lv, "skill_eff_true": character.skill_eff_true,
        "skill_eff_fixed": character.skill_eff_fixed, "skill_cost": character.skill_cost,
        "def": character.def_, "def_p": character.def_p, "def_eff": character.def_eff, "dmg_r": character.dmg_r,
        "heal_eff": character.heal_eff, "skill_target": max(1, character.skill_target or 1),
        "over_heal": bool(character.over_heal),
        "attn": character.attn, "presence": character.presence,
        "hp": min(character.hp, max_hp) if character.hp > 0 else max_hp,
        "max_hp": max_hp,
        "shield": (character.sh or 0) + (character.start_sh or 0),
        "mp": min(character.mp, character.mp_max), "max_mp": character.mp_max,
        "hp_regen_true": character.hp_regen_true, "hp_regen_fixed": character.hp_regen_fixed,
        "mp_regen": character.mp_regen,
        # 0은 "원래 파티원"을 뜻하는 센티널이다(라운드 번호는 1부터 시작하므로 절대 일치하지 않음).
        # 난입 캐릭터만 join_battle에서 실제 합류 라운드 번호로 덮어써 그 라운드에 한해 피격/치유 대상에서 제외된다.
        "downed": False, "retreated": False, "joined_round": 0,
    }


def _snapshot_enemy(enemy: Enemy, party: list[Character]) -> dict:
    hp = enemy.base_hp
    for c in party:
        if c.faction == "공격":
            hp += enemy.hp_per_attacker
        elif c.faction == "수비":
            hp += enemy.hp_per_defender
        elif c.faction == "치유":
            hp += enemy.hp_per_healer
    return {
        "enemy_id": enemy.id,
        "name": enemy.name,
        "attack": enemy.attack,
        "hp": hp,
        "max_hp": hp,
        "skills": list(enemy.skills or []),
    }


def _apply_item_effects_to_snapshot(p: dict, effects: list[dict], sign: int) -> None:
    for effect in effects:
        stat = effect["stat"]
        if stat == "hp_heal_p":
            delta_hp = p["max_hp"] * effect["delta"] * sign
            next_hp = int(round(p["hp"] + delta_hp))
            if not p["over_heal"]:
                next_hp = min(next_hp, p["max_hp"])
            p["hp"] = next_hp
            continue
        key = BATTLE_ITEM_EFFECT_KEYS.get(stat)
        if key is None or stat not in ITEM_EFFECT_STAT_TYPES:
            continue
        value_type = ITEM_EFFECT_STAT_TYPES[stat]
        delta = effect["delta"] * sign
        current = p[key]
        next_value = int(round(current + delta)) if value_type is int else float(current + delta)
        if key == "hp" and not p["over_heal"]:
            next_value = min(next_value, p["max_hp"])
        p[key] = next_value


def _to_battle_session_read(session: BattleSession) -> BattleSessionRead:
    return BattleSessionRead(
        id=session.id,
        mode=session.mode,
        chapter=session.chapter,
        status=session.status,
        round=session.round,
        enemies=session.enemies,
        summons=session.summons,
        participants=session.participants,
        log=session.log,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


def start_battle(db: Session, member: Member, data: BattleStartRequest) -> BattleSessionRead:
    characters = db.query(Character).filter(Character.id.in_(data.character_ids)).all()
    if len(characters) != len(set(data.character_ids)):
        raise HTTPException(status_code=400, detail="존재하지 않는 캐릭터가 포함되어 있습니다.")
    enemies_db = db.query(Enemy).filter(Enemy.id.in_(data.enemy_ids)).all()
    if len(enemies_db) != len(set(data.enemy_ids)):
        raise HTTPException(status_code=400, detail="존재하지 않는 에너미가 포함되어 있습니다.")

    session = BattleSession(
        mode=data.mode,
        chapter=enemies_db[0].chapter,
        status="in_progress",
        round=1,
        enemies=[_snapshot_enemy(e, characters) for e in enemies_db],
        summons=[],
        participants=[_snapshot_combatant(c) for c in characters],
        log=[],
        created_by=member.id,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return _to_battle_session_read(session)


def get_battle_session(db: Session, session_id: int) -> BattleSessionRead:
    session = db.get(BattleSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="전투를 찾을 수 없습니다.")
    return _to_battle_session_read(session)


def get_battle_sessions(
    db: Session,
    mode: str | None = None,
    status: str | None = None,
) -> list[BattleSessionSummary]:
    query = db.query(BattleSession)
    if mode is not None:
        query = query.filter(BattleSession.mode == mode)
    if status is not None:
        query = query.filter(BattleSession.status == status)
    rows = query.order_by(BattleSession.id.desc()).all()
    return [
        BattleSessionSummary(
            id=r.id,
            mode=r.mode,
            chapter=r.chapter,
            status=r.status,
            round=r.round,
            enemy_names=[e.get("name", "") for e in (r.enemies or [])],
            created_at=r.created_at,
            updated_at=r.updated_at,
        )
        for r in rows
    ]


def join_battle(db: Session, session_id: int, data: BattleJoinRequest) -> BattleSessionRead:
    session = db.get(BattleSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="전투를 찾을 수 없습니다.")
    if session.status != "in_progress":
        raise HTTPException(status_code=400, detail="이미 종료된 전투입니다.")
    character = db.get(Character, data.character_id)
    if not character:
        raise HTTPException(status_code=404, detail="캐릭터를 찾을 수 없습니다.")

    participants = list(session.participants)
    if any(p["character_id"] == character.id for p in participants):
        raise HTTPException(status_code=400, detail="이미 전투에 참여 중인 캐릭터입니다.")

    snapshot = _snapshot_combatant(character)
    snapshot["joined_round"] = session.round
    participants.append(snapshot)
    session.participants = participants
    db.commit()
    db.refresh(session)
    return _to_battle_session_read(session)


def _finalize_real_battle(db: Session, participants: list[dict]) -> None:
    """실전 전투 종료: 최종 hp를 반영하고 마나는 100% 회복한다(그 외 스탯은 그대로 유지)."""
    character_ids = [p["character_id"] for p in participants]
    characters_by_id = {
        c.id: c for c in db.query(Character).filter(Character.id.in_(character_ids)).all()
    } if character_ids else {}
    for p in participants:
        character = characters_by_id.get(p["character_id"])
        if character is None:
            continue
        character.hp = max(0, min(p["hp"], character.hp_max))
        character.mp = character.mp_max


def resolve_battle_round(db: Session, session_id: int, data: BattleActionRequest) -> BattleSessionRead:
    session = db.get(BattleSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="전투를 찾을 수 없습니다.")
    if session.status != "in_progress":
        raise HTTPException(status_code=400, detail="이미 종료된 전투입니다.")

    round_no = session.round
    participants = [dict(p) for p in session.participants]
    enemies = [dict(e) for e in session.enemies]
    summons = [dict(s) for s in session.summons]
    events: list[str] = []

    by_char_id = {p["character_id"]: p for p in participants}
    enemies_by_id = {e["enemy_id"]: e for e in enemies}
    actions_by_char = {a.character_id: a for a in data.character_actions}

    def active(p: dict) -> bool:
        return not p["downed"] and not p["retreated"]

    def targetable(p: dict) -> bool:
        # 이번 라운드에 난입한 캐릭터는 에너미 공격/아군 치유의 대상이 될 수 없다.
        return active(p) and p["joined_round"] != round_no

    def eff_def(p: dict) -> int:
        return round(p["def"] * (1 + p["def_p"]) * p["def_eff"])

    def skill_coef(p: dict) -> float:
        return 1 + p["skill_lv"] * p["skill_eff_fixed"]

    living = [p for p in participants if active(p)]

    # 0) 라운드 시작 재생
    for p in living:
        hp_heal = p["hp_regen_true"] + round(p["max_hp"] * p["hp_regen_fixed"])
        mp_heal = p["mp_regen"]
        if hp_heal > 0:
            p["hp"] = min(p["max_hp"], p["hp"] + hp_heal)
        if mp_heal > 0:
            p["mp"] = min(p["max_mp"], p["mp"] + mp_heal)
        if hp_heal > 0 or mp_heal > 0:
            events.append(f"♻️ {p['name']} 재생 (+{hp_heal} HP / +{mp_heal} MP)")

    # 1) 수비 태세 표시
    defending: set[int] = set()
    for p in living:
        action = actions_by_char.get(p["character_id"])
        if action and action.kind == "defend":
            defending.add(p["character_id"])
            events.append(f"🛡️ {p['name']} 수비 태세 (방어력 {eff_def(p)} 경감)")

    # 2) 공격/기술 사용, 아이템, 퇴각
    for p in living:
        action = actions_by_char.get(p["character_id"])
        if not action:
            continue

        if action.kind in ("attack", "skill"):
            target_enemy = enemies_by_id.get(action.target_enemy_id) if action.target_enemy_id else None
            if target_enemy is None or target_enemy["hp"] <= 0:
                target_enemy = next((e for e in enemies if e["hp"] > 0), None)
            if target_enemy is None:
                continue

            has_mana = p["mp"] >= p["skill_cost"]
            mana_coef = 1 if has_mana else 0.5
            if has_mana:
                p["mp"] -= p["skill_cost"]
            raw = (p["atk"] * (1 + p["atk_p"]) + p["skill_eff_true"]) * (1 + p["dmg_p"]) * skill_coef(p) * mana_coef
            dmg = max(0, round(raw))
            remaining = dmg

            alive_summons = [s for s in summons if s["hp"] > 0]
            for s in alive_summons:
                if remaining <= 0:
                    break
                dealt = min(remaining, s["hp"])
                s["hp"] -= dealt
                remaining -= dealt
                events.append(f"⚔️ {p['name']} 공격: 소환수 {s['name']}에게 {dealt} 피해 [{max(0, s['hp'])}/{s['max_hp']}]")
                if s["hp"] <= 0:
                    events.append(f"💀 소환수 {s['name']} 처치")

            if alive_summons:
                # 소환수가 있었다면 이 공격의 피해는 소환수에서 전부 소모되며, 초과분은 에너미에게 넘어가지 않는다.
                continue

            dealt = min(dmg, target_enemy["hp"])
            target_enemy["hp"] = max(0, target_enemy["hp"] - dmg)
            events.append(
                f"⚔️ {p['name']} 공격: {dealt} 피해{'' if has_mana else '(마나 부족·위력↓)'} · "
                f"{target_enemy['name']} [{target_enemy['hp']}/{target_enemy['max_hp']}]"
            )

        elif action.kind == "item":
            item = db.get(Item, action.item_id) if action.item_id else None
            if item is None or item.item_type != "consumable":
                events.append(f"⚠️ {p['name']} 사용할 아이템이 지정되지 않았습니다.")
                continue
            if session.mode == "real":
                owned = _sum_quantity(db, item.id, p["character_id"])
                state = _get_or_create_item_state(db, p["character_id"], item.id)
                if state.used_quantity >= owned:
                    events.append(f"⚠️ {p['name']}: {item.name}을(를) 보유하고 있지 않습니다.")
                    continue
                state.used_quantity += 1
            _apply_item_effects_to_snapshot(p, item.effects or [], sign=1)
            events.append(f"🎒 {p['name']} {item.name} 사용")

        elif action.kind == "retreat":
            p["retreated"] = True
            events.append(f"🏳️ {p['name']} 퇴각")

    victory = all(e["hp"] <= 0 for e in enemies)

    # 3) 치유 (퇴각하지 않은 캐릭터만, 승리 확정 시 생략)
    if not victory:
        for p in living:
            if p["retreated"]:
                continue
            action = actions_by_char.get(p["character_id"])
            if not action or action.kind != "heal":
                continue

            has_mana = p["mp"] >= p["skill_cost"]
            mana_coef = 1 if has_mana else 0.5
            if has_mana:
                p["mp"] -= p["skill_cost"]
            heal = max(0, round((p["heal_eff"] + p["skill_eff_true"]) * skill_coef(p) * mana_coef))

            chosen = by_char_id.get(action.target_character_id) if action.target_character_id else None
            targets: list[dict] = []
            if chosen and targetable(chosen):
                targets.append(chosen)
            extras = sorted(
                (t for t in participants if targetable(t) and t not in targets),
                key=lambda t: (t["hp"] / t["max_hp"]) if t["max_hp"] else 0,
            )
            for t in extras:
                if len(targets) >= max(1, p["skill_target"]):
                    break
                targets.append(t)

            for t in targets:
                before = t["hp"]
                next_hp = t["hp"] + heal
                if not t["over_heal"]:
                    next_hp = min(next_hp, t["max_hp"])
                t["hp"] = next_hp
                events.append(f"💚 {p['name']} → {t['name']} {t['hp'] - before} 치유 · {t['name']} [{before}→{t['hp']}/{t['max_hp']}]")

        # 4) 에너미 행동
        next_summon_id = max([s["id"] for s in summons], default=0)
        for enemy_action in data.enemy_actions:
            enemy = enemies_by_id.get(enemy_action.enemy_id)
            if not enemy or enemy["hp"] <= 0:
                continue

            skill = None
            if enemy_action.skill_index is not None and 0 <= enemy_action.skill_index < len(enemy["skills"]):
                skill = enemy["skills"][enemy_action.skill_index]

            if enemy_action.kind == "attack" and skill and skill["skill_type"] != "소환":
                living_now = [p for p in participants if targetable(p)]
                if skill["skill_type"].startswith("광역"):
                    targets = living_now
                else:
                    targets = sorted(living_now, key=lambda t: -(t["attn"] + t["presence"]))[: max(1, skill["target_count"])]
                base = round(enemy["attack"] * skill["damage_percent"] / 100)
                for t in targets:
                    dmg = round(base * (1 - t["dmg_r"]))
                    if t["character_id"] in defending:
                        dmg = max(0, dmg - eff_def(t))
                    absorbed = min(t["shield"], dmg)
                    t["shield"] -= absorbed
                    dmg -= absorbed
                    t["hp"] = max(0, t["hp"] - dmg)
                    events.append(
                        f"🔥 {enemy['name']}의 {skill['name']} → {t['name']} {dmg} 피해"
                        f"{f'(보호막 {absorbed} 흡수)' if absorbed > 0 else ''} · {t['name']} [{t['hp']}/{t['max_hp']}]"
                    )
                    if t["hp"] == 0 and not t["downed"]:
                        t["downed"] = True
                        events.append(f"💀 {t['name']} 전투불능")
            elif enemy_action.kind == "summon" and skill and skill["skill_type"] == "소환":
                count = skill.get("summon_count") or 1
                for _ in range(count):
                    next_summon_id += 1
                    summons.append({
                        "id": next_summon_id,
                        "name": skill.get("summon_name") or f"{enemy['name']}의 소환수",
                        "hp": skill.get("summon_hp") or 1,
                        "max_hp": skill.get("summon_hp") or 1,
                        "attack": skill.get("summon_attack") or 0,
                    })
                events.append(f"👹 {enemy['name']} 소환: {skill.get('summon_name')} x{count}")
            else:
                events.append(f"💤 {enemy['name']} 무반응")

    no_active_left = not any(active(p) for p in participants)
    victory = all(e["hp"] <= 0 for e in enemies)

    session.participants = participants
    session.enemies = enemies
    session.summons = [s for s in summons if s["hp"] > 0]
    session.log = list(session.log) + [{"round": round_no, "events": events}]

    if victory:
        session.status = "victory"
    elif no_active_left:
        session.status = "defeat"
    else:
        session.round = round_no + 1

    if session.status != "in_progress" and session.mode == "real":
        _finalize_real_battle(db, participants)

    db.commit()
    db.refresh(session)
    return _to_battle_session_read(session)


# ── Skill Tree ───────────────────────────────────────────────────────────────

def _to_skill_node_read(node: SkillNode) -> SkillNodeRead:
    return SkillNodeRead(
        id=node.id,
        faction=node.faction,
        branch=node.branch,
        col=node.col,
        tier=node.tier,
        tier_label=TIER_LABELS.get(node.tier, str(node.tier)),
        default_name=node.default_name,
        image_url=node.image_url,
        effects=node.effects or [],
    )


def _seed_skill_tree_if_empty(db: Session, faction: str) -> None:
    if db.query(SkillNode).filter(SkillNode.faction == faction).first():
        return
    config = SKILL_TREE_MOCK.get(faction)
    if not config:
        return
    db.add(SkillNode(faction=faction, branch=None, col=None, tier=0, default_name=config["base_name"]))
    for branch_index, branch in enumerate(config["branches"]):
        db.add(SkillNode(faction=faction, branch=branch_index, col=None, tier=1, default_name=branch["name"]))
        for col_index, col_name in enumerate(branch["columns"]):
            for tier in range(2, 6):
                db.add(SkillNode(
                    faction=faction,
                    branch=branch_index,
                    col=col_index,
                    tier=tier,
                    default_name=f"{col_name} {TIER_LABELS[tier]}",
                ))
    db.commit()


def get_skill_nodes(db: Session, faction: str) -> list[SkillNodeRead]:
    _seed_skill_tree_if_empty(db, faction)
    nodes = (
        db.query(SkillNode)
        .filter(SkillNode.faction == faction)
        .order_by(SkillNode.tier.asc(), SkillNode.branch.asc(), SkillNode.col.asc())
        .all()
    )
    return [_to_skill_node_read(n) for n in nodes]


def update_skill_node(db: Session, node_id: int, data: SkillNodeUpdate) -> SkillNodeRead:
    node = db.get(SkillNode, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="기술을 찾을 수 없습니다.")
    # ap_reset 등 아이템 전용 특수 효과는 기술 노드에 둘 수 없다.
    if any(effect.stat in ITEM_EFFECT_SPECIAL_STATS for effect in data.effects):
        raise HTTPException(status_code=400, detail="기술에는 사용할 수 없는 효과입니다.")
    node.default_name = data.default_name.strip()
    node.effects = [effect.model_dump() for effect in data.effects]
    db.commit()
    db.refresh(node)
    return _to_skill_node_read(node)


def _find_parent_node(db: Session, node: SkillNode) -> SkillNode | None:
    if node.tier == 0:
        return None
    if node.tier == 1:
        return db.query(SkillNode).filter(SkillNode.faction == node.faction, SkillNode.tier == 0).first()
    return (
        db.query(SkillNode)
        .filter(
            SkillNode.faction == node.faction,
            SkillNode.branch == node.branch,
            SkillNode.col == node.col,
            SkillNode.tier == node.tier - 1,
        )
        .first()
    )


def _ensure_base_unlock(db: Session, character: Character) -> None:
    base_node = db.query(SkillNode).filter(SkillNode.faction == character.faction, SkillNode.tier == 0).first()
    if not base_node:
        return
    exists = (
        db.query(CharacterSkillUnlock)
        .filter(CharacterSkillUnlock.character_id == character.id, CharacterSkillUnlock.node_id == base_node.id)
        .first()
    )
    if not exists:
        db.add(CharacterSkillUnlock(character_id=character.id, node_id=base_node.id))
        db.commit()


def get_character_skill_tree(db: Session, character_id: int) -> CharacterSkillTreeRead:
    character = _get_character_or_404(db, character_id)
    if not character.faction:
        raise HTTPException(status_code=400, detail="진영이 설정되지 않은 캐릭터입니다.")

    _seed_skill_tree_if_empty(db, character.faction)
    _ensure_base_unlock(db, character)

    nodes = (
        db.query(SkillNode)
        .filter(SkillNode.faction == character.faction)
        .order_by(SkillNode.tier.asc(), SkillNode.branch.asc(), SkillNode.col.asc())
        .all()
    )
    unlocks = db.query(CharacterSkillUnlock).filter(CharacterSkillUnlock.character_id == character.id).all()
    unlock_by_node = {u.node_id: u for u in unlocks}
    latest_unlock = max(unlocks, key=lambda u: u.unlocked_at, default=None)

    node_reads = []
    for node in nodes:
        unlock = unlock_by_node.get(node.id)
        node_reads.append(
            CharacterSkillNodeRead(
                id=node.id,
                faction=node.faction,
                branch=node.branch,
                col=node.col,
                tier=node.tier,
                tier_label=TIER_LABELS.get(node.tier, str(node.tier)),
                default_name=node.default_name,
                image_url=node.image_url,
                effects=node.effects or [],
                unlocked=unlock is not None,
                custom_name=unlock.custom_name if unlock else None,
                display_name=(unlock.custom_name if unlock and unlock.custom_name else node.default_name),
            )
        )

    return CharacterSkillTreeRead(
        faction=character.faction,
        character_ap=character.ap,
        ap_cost_to_unlock=get_level_grade_stats(character.lv)["ap_cost"],
        latest_unlocked_node_id=latest_unlock.node_id if latest_unlock else None,
        nodes=node_reads,
    )


def unlock_character_skill_node(db: Session, character_id: int, node_id: int) -> CharacterSkillTreeRead:
    character = _get_character_or_404(db, character_id)
    node = db.get(SkillNode, node_id)
    if not node or node.faction != character.faction:
        raise HTTPException(status_code=404, detail="기술을 찾을 수 없습니다.")
    if node.tier == 0:
        raise HTTPException(status_code=400, detail="기본 기술은 자동으로 습득됩니다.")

    _seed_skill_tree_if_empty(db, character.faction)
    _ensure_base_unlock(db, character)

    already = (
        db.query(CharacterSkillUnlock)
        .filter(CharacterSkillUnlock.character_id == character.id, CharacterSkillUnlock.node_id == node.id)
        .first()
    )
    if already:
        raise HTTPException(status_code=400, detail="이미 습득한 기술입니다.")

    parent = _find_parent_node(db, node)
    if parent and parent.tier > 0:
        parent_unlocked = (
            db.query(CharacterSkillUnlock)
            .filter(CharacterSkillUnlock.character_id == character.id, CharacterSkillUnlock.node_id == parent.id)
            .first()
        )
        if not parent_unlocked:
            raise HTTPException(status_code=400, detail="이전 단계를 먼저 습득해야 합니다.")

    if node.tier == 1:
        other_branch_chosen = (
            db.query(CharacterSkillUnlock)
            .join(SkillNode, CharacterSkillUnlock.node_id == SkillNode.id)
            .filter(
                CharacterSkillUnlock.character_id == character.id,
                SkillNode.tier == 1,
                SkillNode.branch != node.branch,
            )
            .first()
        )
        if other_branch_chosen:
            raise HTTPException(status_code=400, detail="이미 다른 계열을 선택했습니다.")

    if node.tier >= 2:
        other_column_chosen = (
            db.query(CharacterSkillUnlock)
            .join(SkillNode, CharacterSkillUnlock.node_id == SkillNode.id)
            .filter(
                CharacterSkillUnlock.character_id == character.id,
                SkillNode.branch == node.branch,
                SkillNode.tier >= 2,
                SkillNode.col != node.col,
            )
            .first()
        )
        if other_column_chosen:
            raise HTTPException(status_code=400, detail="이미 다른 세부 계열을 선택했습니다.")

    cost = get_level_grade_stats(character.lv)["ap_cost"]
    if character.ap < cost:
        raise HTTPException(status_code=400, detail=f"AP가 부족합니다. (필요: {cost})")

    applied_effects = [dict(effect) for effect in (node.effects or [])]
    character.ap -= cost
    _apply_item_effects(character, applied_effects, sign=1)
    db.add(CharacterSkillUnlock(
        character_id=character.id,
        node_id=node.id,
        ap_spent=cost,
        applied_effects=applied_effects,
    ))
    db.commit()

    return get_character_skill_tree(db, character.id)


def _reset_character_skills(db: Session, character: Character) -> None:
    """기술을 기본(tier 0)으로 되돌리고, 강화 효과를 되돌리며, 소모한 AP를 전부 환급한다.

    효과는 해금 당시 스냅샷(applied_effects)으로 되돌려, 이후 관리자가 노드 효과를
    바꾸더라도 정확히 원복한다. db.commit()은 호출자가 담당한다.
    """
    unlocks = (
        db.query(CharacterSkillUnlock)
        .join(SkillNode, CharacterSkillUnlock.node_id == SkillNode.id)
        .filter(
            CharacterSkillUnlock.character_id == character.id,
            SkillNode.tier != 0,
        )
        .all()
    )
    for unlock in unlocks:
        _apply_item_effects(character, unlock.applied_effects or [], sign=-1)
        character.ap += unlock.ap_spent
        db.delete(unlock)


def rename_character_skill(db: Session, character_id: int, node_id: int, custom_name: str) -> CharacterSkillTreeRead:
    character = _get_character_or_404(db, character_id)
    unlock = (
        db.query(CharacterSkillUnlock)
        .filter(CharacterSkillUnlock.character_id == character.id, CharacterSkillUnlock.node_id == node_id)
        .first()
    )
    if not unlock:
        raise HTTPException(status_code=400, detail="습득하지 않은 기술입니다.")
    unlock.custom_name = custom_name.strip() or None
    db.commit()
    return get_character_skill_tree(db, character.id)
