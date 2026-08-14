from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.auth import hash_password, verify_password
from app.game_data import SKILL_TREE_MOCK, get_level_grade_stats
from app.models import AttendanceEntry, AttendanceMission, AttendanceRecord, Chapter, Challenge, ChallengeProgress, Character, CharacterItemState, CharacterSkillUnlock, Enemy, Item, Member, Mission, MissionProgress, Purchase, Reward, SettlementRequest, SkillNode
from app.schemas import (
    ITEM_EFFECT_SPECIAL_STATS,
    ITEM_EFFECT_STAT_TYPES,
    TIER_LABELS,
    AdminGiftRequest,
    AttendanceCharacterBrief,
    AttendanceEntryCreate,
    AttendanceEntryRead,
    AttendanceEntryUpdate,
    AttendanceMissionRead,
    AttendanceMissionUpdate,
    AttendanceStreakEntry,
    AttendanceSummaryRead,
    BulkPurchaseRequest,
    ChapterCreate,
    ChapterRead,
    ChallengeCreate,
    ChallengeProgressBulkUpdate,
    ChallengeProgressRead,
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
        attr = "def_" if stat == "def" else stat
        value_type = ITEM_EFFECT_STAT_TYPES[stat]
        delta = effect["delta"] * sign
        current = getattr(character, attr)
        next_value = int(round(current + delta)) if value_type is int else float(current + delta)
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

    for cart_item in data.items:
        item = db.query(Item).filter(Item.id == cart_item.item_id).first()
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


ATTENDANCE_REWARD_GOLD = 1
ATTENDANCE_REWARD_CP = 1
ATTENDANCE_RANK_LIMIT = 3  # 그날 선착순으로 등수 뱃지를 다는 인원 수


def _to_attendance_entry_read(
    entry: AttendanceEntry,
    character: Character | None,
    rank: int | None,
) -> AttendanceEntryRead:
    return AttendanceEntryRead(
        id=entry.id,
        attendance_date=entry.attendance_date,
        character_id=entry.character_id,
        character_name=character.name if character else "(삭제된 캐릭터)",
        character_image_url=character.image_url if character else None,
        message=entry.message,
        rank=rank,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
    )


def get_attendance_entries(db: Session, attendance_date: date) -> list[AttendanceEntryRead]:
    """해당 날짜의 출석 엔트리를 최신순으로 반환한다. 선착순 1~3번째에는 rank를 부여한다."""
    entries = (
        db.query(AttendanceEntry)
        .filter(AttendanceEntry.attendance_date == attendance_date)
        .order_by(AttendanceEntry.created_at.desc(), AttendanceEntry.id.desc())
        .all()
    )
    character_ids = {e.character_id for e in entries}
    characters = {
        c.id: c for c in db.query(Character).filter(Character.id.in_(character_ids)).all()
    } if character_ids else {}

    total = len(entries)
    return [
        _to_attendance_entry_read(
            entry,
            characters.get(entry.character_id),
            # 최신순이므로 목록 끝이 첫 출석자(1등)다.
            total - index if total - index <= ATTENDANCE_RANK_LIMIT else None,
        )
        for index, entry in enumerate(entries)
    ]


def _get_member_character_or_400(db: Session, member: Member) -> Character:
    character = db.query(Character).filter(Character.member_id == member.id).first()
    if character is None:
        raise HTTPException(status_code=400, detail="출석하려면 먼저 캐릭터를 생성해야 합니다.")
    return character


def create_attendance_entry(
    db: Session,
    member: Member,
    data: AttendanceEntryCreate,
) -> list[AttendanceEntryRead]:
    today = _today_kst()
    if data.attendance_date != today:
        raise HTTPException(status_code=400, detail="오늘 날짜에만 출석할 수 있습니다.")

    character = _get_member_character_or_400(db, member)

    duplicate = (
        db.query(AttendanceEntry)
        .filter(AttendanceEntry.attendance_date == today)
        .filter(AttendanceEntry.character_id == character.id)
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=400, detail="오늘은 이미 출석했습니다.")

    entry = AttendanceEntry(
        attendance_date=today,
        character_id=character.id,
        message=data.message.strip(),
    )
    db.add(entry)
    db.flush()

    # 같은 날 삭제 후 재출석하는 경우 보상이 중복 지급되지 않도록 기존 보상 여부를 확인한다.
    already_rewarded = (
        db.query(Reward.id)
        .filter(Reward.type == "attendance")
        .filter(Reward.character_id == character.id)
        .filter(Reward.rewarded_at == today)
        .first()
    )
    if not already_rewarded:
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
            rewarded_at=today,
        ))

    db.commit()
    return get_attendance_entries(db, today)


def update_attendance_entry(
    db: Session,
    member: Member,
    entry_id: int,
    data: AttendanceEntryUpdate,
) -> list[AttendanceEntryRead]:
    entry = db.get(AttendanceEntry, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="출석 기록을 찾을 수 없습니다.")
    if get_member_character_id(db, member.id) != entry.character_id:
        raise HTTPException(status_code=403, detail="본인의 출석 기록만 수정할 수 있습니다.")

    entry.message = data.message.strip()
    db.commit()
    return get_attendance_entries(db, entry.attendance_date)


def delete_attendance_entry(db: Session, member: Member, entry_id: int) -> list[AttendanceEntryRead]:
    entry = db.get(AttendanceEntry, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="출석 기록을 찾을 수 없습니다.")
    is_owner = get_member_character_id(db, member.id) == entry.character_id
    if member.role != "ADMIN" and not is_owner:
        raise HTTPException(status_code=403, detail="본인의 출석 기록만 삭제할 수 있습니다.")

    attendance_date = entry.attendance_date
    db.delete(entry)
    db.commit()
    return get_attendance_entries(db, attendance_date)


def get_attendance_mission(db: Session, mission_date: date) -> AttendanceMissionRead | None:
    mission = (
        db.query(AttendanceMission)
        .filter(AttendanceMission.mission_date == mission_date)
        .first()
    )
    return AttendanceMissionRead.model_validate(mission) if mission else None


def upsert_attendance_mission(
    db: Session,
    mission_date: date,
    data: AttendanceMissionUpdate,
) -> AttendanceMissionRead | None:
    """출석미션을 저장한다. 내용이 비어 있으면 해당 날짜의 미션을 삭제한다."""
    mission = (
        db.query(AttendanceMission)
        .filter(AttendanceMission.mission_date == mission_date)
        .first()
    )
    content = data.content.strip()

    if not content:
        if mission:
            db.delete(mission)
            db.commit()
        return None

    if mission is None:
        mission = AttendanceMission(mission_date=mission_date)
        db.add(mission)
    mission.content = content
    db.commit()
    return AttendanceMissionRead.model_validate(mission)


def get_attendance_summary(db: Session, attendance_date: date) -> AttendanceSummaryRead:
    """관리자용: 해당 날짜의 출석/미출석 캐릭터와 연속출석 순위를 반환한다."""
    characters = db.query(Character).order_by(Character.name.asc()).all()
    dates_by_character = _attended_dates_by_character(db)

    attended_ids = {
        character_id
        for character_id, dates in dates_by_character.items()
        if attendance_date in dates
    }

    def to_brief(c: Character) -> AttendanceCharacterBrief:
        return AttendanceCharacterBrief(id=c.id, name=c.name, image_url=c.image_url)

    streaks = [
        AttendanceStreakEntry(
            character_id=c.id,
            character_name=c.name,
            character_image_url=c.image_url,
            streak=_streak_ending_at(dates_by_character.get(c.id, set()), attendance_date),
        )
        for c in characters
    ]
    streaks = sorted(
        (s for s in streaks if s.streak > 0),
        key=lambda s: (-s.streak, s.character_name),
    )

    return AttendanceSummaryRead(
        attendance_date=attendance_date,
        attended=[to_brief(c) for c in characters if c.id in attended_ids],
        absent=[to_brief(c) for c in characters if c.id not in attended_ids],
        streaks=streaks,
    )


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
    rows = query.order_by(Reward.created_at.desc(), Reward.id.desc()).all()

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
