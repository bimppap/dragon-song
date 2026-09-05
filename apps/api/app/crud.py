import copy
import math
import random
import re
import threading
import time
from datetime import date, datetime, timedelta, timezone
from functools import lru_cache

import httpx
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, load_only
from app.auth import REFRESH_TOKEN_EXPIRE_DAYS, create_access_token, generate_refresh_token, hash_password, is_admin_role, verify_password
from app.game_data import (
    build_skill_node_specs,
    calculate_stat_grade_totals,
    get_level_grade_stats,
    get_stat_upgrade_ap_cost,
    skill_has_cleanse_count,
    skill_power_slots,
)
from app.models import KST, now_kst
from app.models import AttendanceEntry, AttendanceRecord, BattleSession, Chapter, Challenge, ChallengeProgress, Character, CharacterItemState, CharacterSkillUnlock, DeliveryRequest, Enemy, Environment, Item, ItemUsage, Member, Mission, MissionProgress, NaverSession, Purchase, RefreshToken, Reward, SettlementRequest, ShopState, SkillNode
from app.schemas import (
    GRADE_STAT_FIELDS,
    ITEM_EFFECT_SPECIAL_STATS,
    ITEM_EFFECT_STAT_TYPES,
    TIER_LABELS,
    AdminGiftRequest,
    AttendanceEntryCreate,
    AttendanceEntryRead,
    AttendanceRewardPayResult,
    AttendanceStreakEntry,
    AutoAttendanceCharacterResult,
    AutoAttendanceResult,
    BattleAllyTurnRequest,
    CharacterActionInput,
    BattleEnemyJoinRequest,
    BattleJoinRequest,
    BattleRewardEntry,
    BattleRewardPreview,
    BattleSessionRead,
    BattleSessionSummary,
    BattleStartRequest,
    BattleTelegraphRequest,
    BulkPurchaseRequest,
    ChapterCreate,
    ChapterRead,
    ChallengeCreate,
    ChallengeProgressBulkUpdate,
    ChallengeProgressRead,
    ChallengeUpdate,
    CharacterAchievedChallengeRead,
    CharacterAchievedMissionRead,
    CharacterCreate,
    CharacterDetailRead,
    CharacterFlagsUpdate,
    CharacterOnboardingCreate,
    CharacterOwnedItemRead,
    CharacterRead,
    CharacterSkillNodeRead,
    CharacterCardDetailsRead,
    CharacterCardItemRead,
    CharacterSkillTreeRead,
    DeliveryRequestRead,
    EnemyCreate,
    EnemyRead,
    EnvironmentCreate,
    EnvironmentRead,
    EnemySkill,
    HealerCandidateRead,
    ItemCreate,
    ItemHistoryEntry,
    ItemNameRead,
    ItemWithStock,
    LoginRequest,
    MemberRead,
    MissionCreate,
    MissionProgressBulkUpdate,
    MissionProgressRead,
    MissionUpdate,
    NaverSessionRead,
    NoncombatHealResult,
    PurchaseRead,
    RewardItemEntry,
    RewardPayResult,
    RewardRead,
    RewardWithCharacterRead,
    SettlementCreate,
    SettlementPayRequest,
    SettlementRead,
    SettlementTargetRead,
    SignupRequest,
    SkillNodeRead,
    SkillNodeUpdate,
    SkillPowerSlot,
    SkillVisibilityUpdate,
    StaffCandidateRead,
)


SHOP_STATE_ID = 1


def _enemy_skill_models(raw_skills: list[dict] | None) -> list[EnemySkill]:
    return [EnemySkill(**skill) for skill in (raw_skills or [])]


def _normalized_enemy_skill_payloads(raw_skills: list[dict] | None) -> list[dict]:
    return [skill.model_dump() for skill in _enemy_skill_models(raw_skills)]


def _normalized_battle_enemies(raw_enemies: list[dict] | None) -> list[dict]:
    return [
        {**dict(enemy), "skills": _normalized_enemy_skill_payloads(enemy.get("skills"))}
        for enemy in (raw_enemies or [])
    ]


def _today() -> date:
    """게임의 하루(챕터·전투일·출석 등)는 모두 한국 시간 기준으로 센다."""
    return now_kst().date()


def _is_battle_day(chapter: Chapter, today: date) -> bool:
    return chapter.battle_date == today if chapter.battle_date else False


def _is_battle_open(chapter: Chapter, now: datetime | None = None) -> bool:
    """전투일이고 전투 시각(미지정이면 그날 0시)이 지났는지. 러너에게 에너미를 공개하는 기준."""
    current = now or now_kst()
    if not _is_battle_day(chapter, current.date()):
        return False
    return chapter.battle_time is None or current.time() >= chapter.battle_time


def _to_chapter_read(chapter: Chapter, *, today: date | None = None, admin: bool = True) -> ChapterRead:
    """전투 시작 시각은 관리자에게만 내려준다(러너는 날짜와 공개 여부만 안다)."""
    current_day = today or _today()
    return ChapterRead(
        id=chapter.id,
        name=chapter.name,
        start_date=chapter.start_date,
        end_date=chapter.end_date,
        battle_date=chapter.battle_date,
        battle_time=chapter.battle_time if admin else None,
        image_url=chapter.image_url,
        music_url=chapter.music_url,
        battle_victory_reward_gold=chapter.battle_victory_reward_gold,
        battle_action_reward_gold=chapter.battle_action_reward_gold,
        battle_participation_reward_exp=chapter.battle_participation_reward_exp,
        is_active=chapter.start_date <= current_day <= chapter.end_date,
        is_battle_day=_is_battle_day(chapter, current_day),
        is_battle_open=_is_battle_open(chapter),
        created_at=chapter.created_at,
    )


def _get_character_or_404(db: Session, character_id: int) -> Character:
    character = db.query(Character).filter(Character.id == character_id).first()
    if not character:
        raise HTTPException(status_code=404, detail="캐릭터를 찾을 수 없습니다.")
    return character


def _reward_item_ids(rewards: list[Reward]) -> set[int]:
    item_ids: set[int] = set()
    for reward in rewards:
        for item in reward.reward_items or []:
            if item.get("type") == "item" and item.get("item_id") is not None:
                item_ids.add(int(item["item_id"]))
    return item_ids


def _reward_item_names(db: Session, rewards: list[Reward]) -> dict[int, str]:
    item_ids = _reward_item_ids(rewards)
    if not item_ids:
        return {}
    return {
        item_id: name
        for item_id, name in db.query(Item.id, Item.name).filter(Item.id.in_(item_ids)).all()
    }


def _to_reward_read(r: Reward, item_names: dict[int, str] | None = None) -> RewardRead:
    names = item_names or {}
    reward_items: list[RewardItemEntry] = []
    for item in r.reward_items or []:
        entry = RewardItemEntry(**item)
        if entry.type == "item" and entry.item_id is not None:
            entry.item_name = names.get(entry.item_id)
        reward_items.append(entry)
    return RewardRead(
        id=r.id,
        type=r.type,
        character_id=r.character_id,
        source_id=r.source_id,
        label=r.label,
        reward_items=reward_items,
        rewarded_at=r.rewarded_at,
        created_at=r.created_at,
    )


GROWTH_EXP_PER_LEVEL = 20  # 경험치가 이만큼 쌓일 때마다 성장등급이 오른다.
GROWTH_AP_PER_LEVEL = 2    # 성장등급 1당 지급되는 AP.


def _apply_growth_from_exp(db: Session, character: Character, source_id: int | None = None) -> Reward | None:
    """경험치가 20 쌓일 때마다 성장등급(lv)과 AP를 자동 지급하고, 초과분은 다음 등급으로 이월한다(경험치는 0~19로 리셋).

    '성장' 보상 이력을 남긴다.
    """
    gained = character.exp // GROWTH_EXP_PER_LEVEL
    if gained <= 0:
        return None
    character.exp -= gained * GROWTH_EXP_PER_LEVEL
    character.lv += gained
    character.ap += gained * GROWTH_AP_PER_LEVEL
    reward = Reward(
        type="growth",
        character_id=character.id,
        source_id=source_id,
        reward_items=[
            {"type": "lv", "amount": gained},
            {"type": "ap", "amount": gained * GROWTH_AP_PER_LEVEL},
        ],
        rewarded_at=_today(),
    )
    db.add(reward)
    return reward


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
            db.add(Purchase(character_id=character_id, item_id=item_id, quantity=quantity, source="reward"))
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
        expires_at=now_kst() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    ))
    db.commit()
    return token


def _get_valid_refresh_token(db: Session, token: str) -> RefreshToken:
    row = db.query(RefreshToken).filter(RefreshToken.token == token).first()
    if not row or row.revoked_at is not None or row.expires_at < now_kst():
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
        row.revoked_at = now_kst()
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


def list_staff_candidates(db: Session) -> list[StaffCandidateRead]:
    """권한 탭에서 스텝 임명/해제 대상으로 보여줄 목록. 캐릭터를 가진 RUNNER/STAFF만 대상이다."""
    rows = (
        db.query(Member, Character)
        .join(Character, Character.member_id == Member.id)
        .filter(Member.role.in_(["RUNNER", "STAFF"]))
        .order_by(Character.name.asc())
        .all()
    )
    return [
        StaffCandidateRead(
            member_id=member.id,
            character_id=character.id,
            character_name=character.name,
            role=member.role,
        )
        for member, character in rows
    ]


def set_member_staff_role(db: Session, member_id: int, role: str) -> StaffCandidateRead:
    member = db.get(Member, member_id)
    if member is None:
        raise HTTPException(status_code=404, detail="회원을 찾을 수 없습니다.")
    if member.role not in ("RUNNER", "STAFF"):
        raise HTTPException(status_code=400, detail="러너에게만 스텝 권한을 부여/해제할 수 있습니다.")
    character = db.query(Character).filter(Character.member_id == member.id).first()
    if character is None:
        raise HTTPException(status_code=400, detail="캐릭터가 없는 회원에게는 스텝 권한을 부여할 수 없습니다.")
    member.role = role
    db.commit()
    db.refresh(member)
    return StaffCandidateRead(
        member_id=member.id,
        character_id=character.id,
        character_name=character.name,
        role=member.role,
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
        sp=character.sp,
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

    stats = calculate_stat_grade_totals(
        data.stat_courage, data.stat_endurance, data.stat_charity, data.stat_wisdom,
        faction=data.faction,
    )
    character = Character(
        name=data.name.strip(),
        lv=1,
        hp=stats["hp_max"],
        hp_max=stats["hp_max"],
        atk=stats["atk"],
        def_=stats["def"],
        dmg_p=stats["dmg_p"],
        dmg_r=stats["dmg_r"],
        presence=stats["presence"],
        heal_eff=stats["heal_eff"],
        skill_eff_true=stats["skill_eff_true"],
        skill_eff_fixed=stats["skill_eff_fixed"],
        mp=stats["mp_max"],
        mp_max=stats["mp_max"],
        mp_regen=stats["mp_regen"],
        member_id=member.id,
        faction=data.faction,
        rank=data.rank,
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


def _assign_character_stats(character: Character, data: CharacterCreate) -> None:
    """CharacterCreate의 모든 필드를 그대로 캐릭터 컬럼에 덮어쓴다(생성/관리자 전용 수정 공용)."""
    character.name = data.name
    character.faction = data.faction
    character.gold = data.gold
    character.cp = data.cp
    character.ap = data.ap
    character.sp = data.sp
    character.lv = data.lv
    character.rank = data.rank
    character.exp = data.exp
    character.stat_courage = data.stat_courage
    character.stat_endurance = data.stat_endurance
    character.stat_charity = data.stat_charity
    character.stat_wisdom = data.stat_wisdom
    character.hp = data.hp
    character.hp_max = data.hp_max
    character.hp_max_p = data.hp_max_p
    character.hp_regen_true = data.hp_regen_true
    character.hp_regen_fixed = data.hp_regen_fixed
    character.mp = data.mp
    character.mp_max = data.mp_max
    character.mp_regen = data.mp_regen
    character.atk = data.atk
    character.atk_p = data.atk_p
    character.def_ = data.def_
    character.def_p = data.def_p
    character.def_eff = data.def_eff
    character.attn = data.attn
    character.presence = data.presence
    character.heal_eff = data.heal_eff
    character.sh = data.sh
    character.dmg_p = data.dmg_p
    character.dmg_r = data.dmg_r
    character.skill_lv = data.skill_lv
    character.skill_eff_true = data.skill_eff_true
    character.skill_eff_fixed = data.skill_eff_fixed
    character.skill_cost = data.skill_cost
    character.skill_target = data.skill_target
    character.start_sh = data.start_sh
    character.revive_hp = data.revive_hp
    character.act_time = data.act_time
    character.over_heal = data.over_heal


def _replace_character_skills_unrestricted(db: Session, character: Character, skill_node_ids: list[int]) -> None:
    """선행 기술/계열/SP 제한 없이 기술 목록을 통째로 교체한다(관리자가 만든 캐릭터 전용)."""
    db.query(CharacterSkillUnlock).filter(CharacterSkillUnlock.character_id == character.id).delete()
    invalidate_active_battle_skills_cache([character.id])
    if not skill_node_ids:
        return
    node_ids = sorted(set(skill_node_ids))
    nodes = db.query(SkillNode).filter(SkillNode.id.in_(node_ids)).all()
    if len(nodes) != len(node_ids):
        raise HTTPException(status_code=400, detail="존재하지 않는 기술이 포함되어 있습니다.")
    for node in nodes:
        applied_effects = [dict(effect) for effect in (node.effects or [])]
        _apply_item_effects(character, applied_effects, sign=1)
        db.add(CharacterSkillUnlock(
            character_id=character.id,
            node_id=node.id,
            sp_spent=0,
            applied_effects=applied_effects,
        ))


def create_character(db: Session, data: CharacterCreate) -> CharacterRead:
    character = Character()
    _assign_character_stats(character, data)
    db.add(character)
    db.flush()

    _replace_character_skills_unrestricted(db, character, data.skill_node_ids)

    challenge_ids = [challenge_id for challenge_id, in db.query(Challenge.id).all()]
    _create_progress_rows(db, challenge_ids, [character.id])

    db.commit()
    db.refresh(character)
    return _to_character_read(character)


def update_character(db: Session, character_id: int, data: CharacterCreate) -> CharacterRead:
    """관리자가 만든 캐릭터(러너 계정에 연결되지 않은 캐릭터)만 능력치·기술을 제한 없이 통째로 수정할 수 있다."""
    character = _get_character_or_404(db, character_id)
    if character.member_id is not None:
        raise HTTPException(status_code=400, detail="러너 캐릭터는 이 방식으로 수정할 수 없습니다. 정상적인 성장 절차를 이용해주세요.")

    _assign_character_stats(character, data)
    _replace_character_skills_unrestricted(db, character, data.skill_node_ids)

    db.commit()
    db.refresh(character)
    return _to_character_read(character)


def get_characters(db: Session) -> list[CharacterRead]:
    characters = db.query(Character).order_by(Character.name.asc(), Character.id.asc()).all()
    return [_to_character_read(c) for c in characters]


def get_characters_visible_to_runner(db: Session) -> list[CharacterRead]:
    """러너 화면에 노출할 캐릭터 목록(러너/스텝 캐릭터만, 관리자 캐릭터·미연결 캐릭터는 제외)."""
    characters = (
        db.query(Character)
        .join(Member, Character.member_id == Member.id)
        .filter(Member.role.in_(["RUNNER", "STAFF"]))
        .order_by(Character.name.asc(), Character.id.asc())
        .all()
    )
    return [_to_character_read(c) for c in characters]


def get_character_card_details(db: Session, *, admin: bool = False) -> list[CharacterCardDetailsRead]:
    query = db.query(Character)
    if not admin:
        query = query.filter(Character.member_id.is_not(None))
    characters = query.order_by(Character.id).all()
    if not characters:
        return []
    by_id = {character.id: character for character in characters}
    result = {character.id: CharacterCardDetailsRead(character_id=character.id) for character in characters}
    # 깊은 기술 우선, 같은 단계는 최근 습득 우선. 서 루트와 비공개 기술은 표시하지 않는다.
    skills = db.query(CharacterSkillUnlock, SkillNode).join(SkillNode, CharacterSkillUnlock.node_id == SkillNode.id).filter(
        CharacterSkillUnlock.character_id.in_(by_id), SkillNode.tier > 0, SkillNode.is_public.is_(True),
    ).order_by(SkillNode.tier.desc(), CharacterSkillUnlock.unlocked_at.desc(), SkillNode.id).all()
    for unlock, node in skills:
        card = result[unlock.character_id]
        if card.skill is None:
            card.skill = _to_character_skill_node_read(node, unlock, by_id[unlock.character_id])
    equipment = db.query(CharacterItemState, Item).join(Item, CharacterItemState.item_id == Item.id).filter(
        CharacterItemState.character_id.in_(by_id), CharacterItemState.equipped.is_(True),
        Item.item_type.in_(["companion", "accessory"]),
    ).order_by(Item.id).all()
    for state, item in equipment:
        result[state.character_id].equipment.append(CharacterCardItemRead(
            item_id=item.id, item_type=item.item_type, name=item.name,
            description=item.description_after_purchase if item.special_merchant else item.description_user,
            image_url=item.image_after_purchase_url if item.special_merchant else item.image_url,
            effects=item.effects or [],
        ))
    return list(result.values())


def update_character_flags(db: Session, character_id: int, data: CharacterFlagsUpdate) -> CharacterRead:
    character = _get_character_or_404(db, character_id)
    character.caution = data.caution
    character.warning_count = data.warning_count
    db.commit()
    db.refresh(character)
    return _to_character_read(character)


def delete_character(db: Session, character_id: int) -> str | None:
    character = _get_character_or_404(db, character_id)

    image_url = character.image_url
    # rewards.id를 참조하는 정산 요청을 먼저 지워야 보상 이력을 안전하게 지울 수 있다.
    db.query(SettlementRequest).filter(SettlementRequest.character_id == character_id).delete()
    db.query(Reward).filter(Reward.character_id == character_id).delete()
    db.query(CharacterItemState).filter(CharacterItemState.character_id == character_id).delete()
    db.query(CharacterSkillUnlock).filter(CharacterSkillUnlock.character_id == character_id).delete()
    invalidate_active_battle_skills_cache([character_id])
    db.query(Purchase).filter(Purchase.character_id == character_id).delete()
    db.query(ItemUsage).filter(ItemUsage.character_id == character_id).delete()
    db.query(ChallengeProgress).filter(ChallengeProgress.character_id == character_id).delete()
    db.query(MissionProgress).filter(MissionProgress.character_id == character_id).delete()
    db.query(AttendanceEntry).filter(AttendanceEntry.character_id == character_id).delete()
    db.delete(character)
    db.commit()
    return image_url


def get_character_detail(db: Session, character_id: int) -> CharacterDetailRead:
    """도전과제/캐릭터 생성 시 이미 진행도 행을 함께 만들어두므로(create_character_for_member,
    create_character, create_challenge) 여기서 다시 시드할 필요가 없다."""
    character = _get_character_or_404(db, character_id)

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
            Challenge.image_url,
            Challenge.purchase_image_url,
            ChallengeProgress.acquired_via_item,
            Challenge.reward,
            Challenge.reward_items,
        )
        .join(ChallengeProgress, Challenge.id == ChallengeProgress.challenge_id)
        .filter(ChallengeProgress.character_id == character.id)
        .filter(ChallengeProgress.achieved.is_(True))
        .order_by(ChallengeProgress.updated_at.desc())
        .all()
    )

    achieved_mission_rows = (
        db.query(
            Mission.id.label("mission_id"),
            Mission.chapter,
            Mission.name,
            Mission.description,
            Mission.image_url,
            Mission.reward,
            Mission.reward_items,
        )
        .join(MissionProgress, Mission.id == MissionProgress.mission_id)
        .filter(MissionProgress.character_id == character.id)
        .filter(MissionProgress.achieved.is_(True))
        .order_by(MissionProgress.updated_at.desc())
        .all()
    )

    def _remaining_owned(row) -> int:
        used_quantity = item_states_by_id[row.item_id].used_quantity if row.item_id in item_states_by_id else 0
        if items_by_id[row.item_id].item_type == "consumable":
            return row.quantity - used_quantity
        return row.quantity

    return CharacterDetailRead(
        **_character_read_kwargs(character),
        owned_items=[
            CharacterOwnedItemRead(
                item_id=row.item_id,
                item_name=row.item_name,
                item_description=(items_by_id[row.item_id].description_after_purchase if items_by_id[row.item_id].special_merchant else row.item_description),
                item_image_url=(items_by_id[row.item_id].image_after_purchase_url if items_by_id[row.item_id].special_merchant else items_by_id[row.item_id].image_url),
                item_type=items_by_id[row.item_id].item_type,
                effects=items_by_id[row.item_id].effects or [],
                quantity=row.quantity,
                used_quantity=item_states_by_id[row.item_id].used_quantity if row.item_id in item_states_by_id else 0,
                equipped=item_states_by_id[row.item_id].equipped if row.item_id in item_states_by_id else False,
                battle_only=items_by_id[row.item_id].battle_only,
            )
            for row in owned_item_rows
            if _remaining_owned(row) > 0
        ],
        achieved_challenges=[
            CharacterAchievedChallengeRead(
                acquired_via_item=row.acquired_via_item,
                challenge_id=row.challenge_id,
                chapter=row.chapter,
                name=row.name,
                description=row.description,
                image_url=(row.purchase_image_url or row.image_url) if row.acquired_via_item else row.image_url,
                reward=row.reward,
                reward_items=row.reward_items or [],
            )
            for row in achieved_challenge_rows
        ],
        achieved_missions=[
            CharacterAchievedMissionRead(
                mission_id=row.mission_id,
                chapter=row.chapter,
                name=row.name,
                description=row.description,
                image_url=row.image_url,
                reward=row.reward,
                reward_items=row.reward_items or [],
            )
            for row in achieved_mission_rows
        ],
        item_history=get_item_history(db, character.id),
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


def _attended_dates_for_character(db: Session, character_id: int) -> set[date]:
    """레거시 출석부 기록과 새 출석 엔트리를 합쳐 한 캐릭터의 출석 날짜 집합을 만든다.
    캐릭터별 조회 경로(예: 캐릭터 정보 화면)에서는 전체 캐릭터를 스캔하는
    _attended_dates_by_character 대신 이 함수를 써서 다른 캐릭터의 출석 기록까지 읽지 않는다."""
    present_dates: set[date] = set()
    legacy_rows = db.query(AttendanceRecord.attendance_date, AttendanceRecord.character_ids).all()
    for attendance_date, character_ids in legacy_rows:
        if character_id in (character_ids or []):
            present_dates.add(attendance_date)
    entry_rows = (
        db.query(AttendanceEntry.attendance_date)
        .filter(AttendanceEntry.character_id == character_id)
        .all()
    )
    present_dates.update(attendance_date for attendance_date, in entry_rows)
    return present_dates


def _attendance_streak(db: Session, character_id: int) -> int:
    """오늘(미출석이면 어제)부터 거슬러 올라가며 연속으로 출석한 일수."""
    present_dates = _attended_dates_for_character(db, character_id)
    return _streak_ending_at(present_dates, _today())


def _chapters_by_name(db: Session) -> dict[str, Chapter]:
    return {c.name: c for c in db.query(Chapter).all()}


def _active_chapter(chapters_by_name: dict[str, Chapter]) -> Chapter | None:
    today = _today()
    for chapter in chapters_by_name.values():
        if chapter.start_date <= today <= chapter.end_date:
            return chapter
    return None


def get_shop_status(db: Session) -> ShopState:
    state = db.get(ShopState, SHOP_STATE_ID)
    if state is None:
        state = ShopState(id=SHOP_STATE_ID, is_open=True)
        db.add(state)
        db.commit()
        db.refresh(state)
    return state


def update_shop_status(db: Session, is_open: bool) -> ShopState:
    state = get_shop_status(db)
    state.is_open = is_open
    db.commit()
    db.refresh(state)
    return state


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


def _validate_item_recollection_chapter(db: Session, data: ItemCreate) -> None:
    recollection_effects = [effect for effect in data.effects if effect.stat == "mission_exp_recollection"]
    if len(recollection_effects) > 1:
        raise HTTPException(status_code=400, detail="회고록 효과는 아이템에 하나만 추가할 수 있습니다.")
    chapters = {
        (effect.chapter or "").strip()
        for effect in data.effects
        if effect.stat == "mission_exp_recollection"
    }
    if len(chapters) > 1:
        raise HTTPException(status_code=400, detail="회고록 효과는 하나의 챕터만 지정할 수 있습니다.")
    if chapters and db.query(Chapter.id).filter(Chapter.name == next(iter(chapters))).first() is None:
        raise HTTPException(status_code=400, detail="회고록 효과에 지정된 챕터가 존재하지 않습니다.")


def _validate_item_acquisition_chapter(db: Session, data: ItemCreate) -> None:
    for effect in data.effects:
        if effect.stat == "challenge_acquisition" and db.query(Chapter.id).filter(Chapter.name == effect.chapter.strip()).first() is None:
            raise HTTPException(status_code=400, detail="도전과제 획득 효과에 지정된 챕터가 존재하지 않습니다.")


def _apply_item_data(item: Item, data: ItemCreate) -> None:
    item.name = data.name
    item.price_gold = data.price_gold
    item.price_cp = data.price_cp
    item.description_user = data.description_user
    item.special_merchant = data.special_merchant
    item.description_after_purchase = data.description_after_purchase
    item.purchase_limit_per_character = data.purchase_limit_per_character
    item.purchase_limit_global = data.purchase_limit_global
    item.available_from_chapter = data.available_from_chapter
    item.available_until_chapter = data.available_until_chapter
    item.item_type = data.item_type
    item.restricted_mission_id = data.restricted_mission_id
    item.effects = [effect.model_dump() for effect in data.effects]
    item.sale_paused = data.sale_paused
    item.battle_only = data.battle_only


def create_item(db: Session, data: ItemCreate) -> Item:
    _validate_item_chapter_window(db, data)
    _validate_item_restricted_mission(db, data)
    _validate_item_recollection_chapter(db, data)
    _validate_item_acquisition_chapter(db, data)
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
    _validate_item_recollection_chapter(db, data)
    _validate_item_acquisition_chapter(db, data)
    equipped = db.query(CharacterItemState).filter(
        CharacterItemState.item_id == item_id, CharacterItemState.equipped.is_(True)
    ).first()
    if equipped and (item.item_type != data.item_type or (item.effects or []) != [e.model_dump() for e in data.effects]):
        raise HTTPException(status_code=400, detail="장착 중인 아이템의 종류나 효과는 모든 캐릭터가 해제한 후 수정할 수 있습니다.")
    _apply_item_data(item, data)
    db.commit()
    db.refresh(item)
    return item


def delete_item(db: Session, item_id: int) -> list[str]:
    item = db.get(Item, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="아이템을 찾을 수 없습니다.")

    image_urls = [url for url in (item.image_url, item.image_after_purchase_url) if url]
    equipped_character_ids = [
        character_id
        for character_id, in db.query(CharacterItemState.character_id)
        .filter_by(item_id=item_id, equipped=True)
        .all()
    ]
    if equipped_character_ids:
        equipped_characters = (
            db.query(Character)
            .filter(Character.id.in_(equipped_character_ids))
            .with_for_update()
            .all()
        )
        for character in equipped_characters:
            _apply_item_effects(character, item.effects or [], sign=-1)
    db.query(CharacterItemState).filter(CharacterItemState.item_id == item_id).delete()
    db.query(Purchase).filter(Purchase.item_id == item_id).delete()
    db.query(ItemUsage).filter(ItemUsage.item_id == item_id).delete()
    db.delete(item)
    db.commit()
    return image_urls


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
            next_hp = _floor_amount(character.hp + delta_hp)
            if not character.over_heal:
                next_hp = min(next_hp, character.hp_max)
            character.hp = next_hp
            continue
        attr = "def_" if stat == "def" else stat
        value_type = ITEM_EFFECT_STAT_TYPES[stat]
        delta = effect["delta"] * sign
        current = getattr(character, attr)
        next_value = _floor_amount(current + delta) if value_type is int else float(current + delta)
        if attr == "hp" and not character.over_heal:
            next_value = min(next_value, character.hp_max)
        setattr(character, attr, next_value)

        # 최대 체력/마나가 바뀌면 현재 체력/마나도 같은 만큼 함께 움직인다(늘면 늘고, 줄면 줄어듦).
        if attr == "hp_max":
            character.hp = max(0, character.hp + (next_value - current))
            if not character.over_heal:
                character.hp = min(character.hp, character.hp_max)
        elif attr == "mp_max":
            character.mp = max(0, min(character.mp + (next_value - current), character.mp_max))


# calculate_stat_grade_totals()의 결과 키 → Character 속성명 매핑 ("def"는 예약어 회피용 def_에 대응).
_GRADE_TOTAL_TO_ATTR = {
    "atk": "atk", "def": "def_", "hp_max": "hp_max", "dmg_p": "dmg_p", "dmg_r": "dmg_r",
    "presence": "presence", "heal_eff": "heal_eff", "skill_eff_fixed": "skill_eff_fixed",
    "skill_eff_true": "skill_eff_true", "mp_max": "mp_max", "mp_regen": "mp_regen",
}


def _apply_grade_choice(character: Character, chosen_stats: list[str], required_count: int) -> None:
    """가능성/잠재성의 메달: 선택한 능력치의 등급을 1씩 올리고, 그로 인한 파생 스탯 증가분만 더한다
    (스킬/다른 아이템으로 이미 붙어 있는 보너스는 건드리지 않는다)."""
    if len(chosen_stats) != required_count or len(set(chosen_stats)) != required_count:
        raise HTTPException(status_code=400, detail=f"능력치를 정확히 {required_count}개, 중복 없이 선택해야 합니다.")
    if any(stat not in GRADE_STAT_FIELDS for stat in chosen_stats):
        raise HTTPException(status_code=400, detail="용기/인내/자애/지혜 중에서만 선택할 수 있습니다.")

    before = calculate_stat_grade_totals(
        character.stat_courage, character.stat_endurance, character.stat_charity, character.stat_wisdom,
    )
    for stat in chosen_stats:
        setattr(character, stat, getattr(character, stat) + 1)
    after = calculate_stat_grade_totals(
        character.stat_courage, character.stat_endurance, character.stat_charity, character.stat_wisdom,
    )
    for key, attr in _GRADE_TOTAL_TO_ATTR.items():
        delta = after[key] - before[key]
        if not delta:
            continue
        setattr(character, attr, getattr(character, attr) + delta)
        # 최대 체력/마나가 바뀌면 현재 체력/마나도 같은 만큼 함께 움직인다.
        if attr == "hp_max":
            character.hp = max(0, character.hp + delta)
            if not character.over_heal:
                character.hp = min(character.hp, character.hp_max)
        elif attr == "mp_max":
            character.mp = max(0, min(character.mp + delta, character.mp_max))


def upgrade_character_stat_with_ap(db: Session, character_id: int, stat: str, amount: int) -> CharacterDetailRead:
    """AP를 소모해 능력치(용기/인내/자애/지혜) 등급을 amount만큼 올리고, 파생 스탯 증가분을 반영한다."""
    if stat not in GRADE_STAT_FIELDS:
        raise HTTPException(status_code=400, detail="용기/인내/자애/지혜 중에서만 선택할 수 있습니다.")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="1 이상 입력해야 합니다.")

    character = _get_character_or_404(db, character_id)
    try:
        ap_cost = get_stat_upgrade_ap_cost(getattr(character, stat), amount)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if character.ap < ap_cost:
        raise HTTPException(status_code=400, detail=f"AP가 부족합니다. (필요: {ap_cost})")

    before = calculate_stat_grade_totals(
        character.stat_courage, character.stat_endurance, character.stat_charity, character.stat_wisdom,
    )
    setattr(character, stat, getattr(character, stat) + amount)
    character.ap -= ap_cost
    after = calculate_stat_grade_totals(
        character.stat_courage, character.stat_endurance, character.stat_charity, character.stat_wisdom,
    )
    for key, attr in _GRADE_TOTAL_TO_ATTR.items():
        delta = after[key] - before[key]
        if not delta:
            continue
        setattr(character, attr, getattr(character, attr) + delta)
        # 최대 체력/마나가 바뀌면 현재 체력/마나도 같은 만큼 함께 움직인다.
        if attr == "hp_max":
            character.hp = max(0, character.hp + delta)
            if not character.over_heal:
                character.hp = min(character.hp, character.hp_max)
        elif attr == "mp_max":
            character.mp = max(0, min(character.mp + delta, character.mp_max))

    db.commit()
    return get_character_detail(db, character_id)


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


def _validate_delivery_date_slot(db: Session, item_id: int, delivery_date: date | None, delivery_note: str | None) -> dict:
    if delivery_date is None or not (delivery_note or "").strip():
        raise HTTPException(status_code=400, detail="날짜와 지문을 모두 입력해 주세요.")
    if delivery_date <= _today():
        raise HTTPException(status_code=400, detail="미래 날짜만 선택할 수 있습니다.")
    existing = db.query(DeliveryRequest).filter(DeliveryRequest.item_id == item_id).all()
    taken = {req.payload.get("date") for req in existing if isinstance(req.payload, dict)}
    if delivery_date.isoformat() in taken:
        raise HTTPException(status_code=400, detail="이미 다른 요청이 선택한 날짜입니다.")
    return {"date": delivery_date.isoformat(), "note": delivery_note.strip()}


def get_delivery_recipients(db: Session) -> list[dict]:
    return [{"id": character.id, "name": character.name} for character in (
        db.query(Character).join(Member, Character.member_id == Member.id)
        .filter(Member.role.in_(["RUNNER", "STAFF"]))
        .order_by(Character.name, Character.id).all()
    )]


def _validate_delivery_freeform(db: Session, recipient_id: int | None, delivery_image_url: str | None, delivery_letter: str | None) -> dict:
    recipient = next((c for c in get_delivery_recipients(db) if c["id"] == recipient_id), None)
    if recipient is None:
        raise HTTPException(status_code=400, detail="선물 상자를 받을 러너 또는 스태프 캐릭터 1명을 선택해 주세요.")
    image_url = (delivery_image_url or "").strip() or None
    letter = (delivery_letter or "").strip() or None
    if image_url is None and letter is None:
        raise HTTPException(status_code=400, detail="이미지 또는 편지 중 최소 하나는 입력해 주세요.")
    return {"image_url": image_url, "letter": letter, "recipient_id": recipient["id"], "recipient_name": recipient["name"]}


def get_taken_delivery_dates(db: Session, item_id: int) -> list[str]:
    """해당 아이템의 배달 요청(질문권 등)이 이미 선점한 날짜 목록. 상태와 무관하게 전부 포함한다."""
    rows = db.query(DeliveryRequest).filter(DeliveryRequest.item_id == item_id).all()
    return sorted({row.payload.get("date") for row in rows if isinstance(row.payload, dict) and row.payload.get("date")})


def use_item(
    db: Session,
    character_id: int,
    item_id: int,
    chosen_stats: list[str] | None = None,
    delivery_date: date | None = None,
    delivery_note: str | None = None,
    delivery_image_url: str | None = None,
    delivery_letter: str | None = None,
    delivery_recipient_id: int | None = None,
    mission_id: int | None = None,
    challenge_id: int | None = None,
) -> CharacterDetailRead:
    character = (
        db.query(Character)
        .filter(Character.id == character_id)
        .with_for_update()
        .populate_existing()
        .first()
    )
    if character is None:
        raise HTTPException(status_code=404, detail="캐릭터를 찾을 수 없습니다.")
    item = db.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="아이템을 찾을 수 없습니다.")
    if item.item_type != "consumable":
        raise HTTPException(status_code=400, detail="소모형 아이템만 사용할 수 있습니다.")
    if item.battle_only:
        raise HTTPException(status_code=400, detail="전투 중에만 사용할 수 있는 아이템입니다.")

    owned_quantity = _sum_quantity(db, item_id, character_id)
    state = _get_or_create_item_state(db, character_id, item_id)
    if state.used_quantity >= owned_quantity:
        raise HTTPException(status_code=400, detail="사용 가능한 수량이 없습니다.")

    special_stats = {effect.get("stat") for effect in (item.effects or [])}
    # 배달형 아이템은 실제 효과 적용 전에 입력값을 검증해, 잘못된 요청이 아이템만 소모시키지 않게 한다.
    delivery_payload: dict | None = None
    if "delivery_date_slot" in special_stats:
        delivery_payload = _validate_delivery_date_slot(db, item_id, delivery_date, delivery_note)
    elif "delivery_freeform" in special_stats:
        delivery_payload = _validate_delivery_freeform(db, delivery_recipient_id, delivery_image_url, delivery_letter)

    selected_challenge = None
    if "challenge_acquisition" in special_stats:
        selected_challenge = next((challenge for challenge in _eligible_acquisition_challenges(db, character_id, item) if challenge.id == challenge_id), None)
        if selected_challenge is None:
            raise HTTPException(status_code=400, detail="해당 챕터의 미달성 도전과제를 선택해 주세요.")
        progress = db.query(ChallengeProgress).filter_by(character_id=character_id, challenge_id=selected_challenge.id).first()
        if progress is None:
            progress = ChallengeProgress(character_id=character_id, challenge_id=selected_challenge.id)
            db.add(progress)
        progress.achieved = True
        progress.acquired_via_item = True

    selected_mission = None
    if "mission_exp_recollection" in special_stats:
        selected_mission = next((mission for mission in _eligible_recollection_missions(db, character_id, item) if mission.id == mission_id), None)
        if selected_mission is None:
            raise HTTPException(status_code=400, detail="경험치를 받을 미달성 임무를 선택해 주세요. 이미 회고한 임무는 선택할 수 없습니다.")
        character.exp += _recollection_experience(selected_mission)
        _apply_growth_from_exp(db, character)

    _apply_item_effects(character, item.effects or [], sign=1)
    # 특수 효과: 기술 리셋(소모한 SP 환급). 능력치 효과와 별개로 처리한다.
    if "ap_reset" in special_stats:
        _reset_character_skills(db, character)
    # 특수 효과: 능력치 등급 선택 강화 (가능성의 메달=1개, 잠재성의 메달=2개).
    if "grade_choice_1" in special_stats:
        _apply_grade_choice(character, chosen_stats or [], 1)
    elif "grade_choice_2" in special_stats:
        _apply_grade_choice(character, chosen_stats or [], 2)
    state.used_quantity += 1
    usage = ItemUsage(
        character_id=character_id, item_id=item_id, quantity=1,
        selected_challenge_id=selected_challenge.id if selected_challenge else None,
        selected_challenge_name=selected_challenge.name if selected_challenge else None,
        selected_mission_id=selected_mission.id if selected_mission else None,
        selected_mission_name=selected_mission.name if selected_mission else None,
        granted_experience=_recollection_experience(selected_mission) if selected_mission else 0,
    )
    db.add(usage)
    if delivery_payload is not None:
        db.flush()  # DeliveryRequest.item_usage_id에 쓸 usage.id 확보
        db.add(DeliveryRequest(
            character_id=character_id,
            item_id=item_id,
            item_usage_id=usage.id,
            payload=delivery_payload,
        ))
    db.commit()
    return get_character_detail(db, character_id)


def get_delivery_requests(db: Session) -> list[DeliveryRequestRead]:
    rows = (
        db.query(DeliveryRequest, Character.name.label("character_name"), Item.name.label("item_name"))
        .join(Character, DeliveryRequest.character_id == Character.id)
        .join(Item, DeliveryRequest.item_id == Item.id)
        .order_by(DeliveryRequest.created_at.desc())
        .all()
    )
    return [
        DeliveryRequestRead(
            id=row.DeliveryRequest.id,
            character_id=row.DeliveryRequest.character_id,
            character_name=row.character_name,
            item_id=row.DeliveryRequest.item_id,
            item_name=row.item_name,
            status=row.DeliveryRequest.status,
            payload=row.DeliveryRequest.payload,
            created_at=row.DeliveryRequest.created_at,
            completed_at=row.DeliveryRequest.completed_at,
        )
        for row in rows
    ]


def complete_delivery_request(db: Session, request_id: int) -> DeliveryRequestRead:
    request = db.get(DeliveryRequest, request_id)
    if request is None:
        raise HTTPException(status_code=404, detail="배달 요청을 찾을 수 없습니다.")
    if request.status == "completed":
        raise HTTPException(status_code=400, detail="이미 완료된 요청입니다.")
    request.status = "completed"
    request.completed_at = now_kst()
    db.commit()
    character_name = db.query(Character.name).filter(Character.id == request.character_id).scalar()
    item_name = db.query(Item.name).filter(Item.id == request.item_id).scalar()
    return DeliveryRequestRead(
        id=request.id,
        character_id=request.character_id,
        character_name=character_name or "",
        item_id=request.item_id,
        item_name=item_name or "",
        status=request.status,
        payload=request.payload,
        created_at=request.created_at,
        completed_at=request.completed_at,
    )


def equip_item(db: Session, character_id: int, item_id: int) -> CharacterDetailRead:
    character = db.query(Character).filter(Character.id == character_id).with_for_update().populate_existing().first()
    if character is None:
        raise HTTPException(status_code=404, detail="캐릭터를 찾을 수 없습니다.")
    item = db.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="아이템을 찾을 수 없습니다.")
    if item.item_type not in ("companion", "accessory"):
        raise HTTPException(status_code=400, detail="동반자 또는 장신구만 장착할 수 있습니다.")

    owned_quantity = _sum_quantity(db, item_id, character_id)
    if owned_quantity <= 0:
        raise HTTPException(status_code=400, detail="보유하고 있지 않은 아이템입니다.")

    state = _get_or_create_item_state(db, character_id, item_id)
    if state.equipped:
        raise HTTPException(status_code=400, detail="이미 장착 중인 아이템입니다.")

    if item.item_type in ("companion", "accessory"):
        previous = (
            db.query(CharacterItemState, Item)
            .join(Item, Item.id == CharacterItemState.item_id)
            .filter(CharacterItemState.character_id == character_id,
                    CharacterItemState.equipped.is_(True), Item.item_type == item.item_type)
            .all()
        )
        for previous_state, previous_item in previous:
            _apply_item_effects(character, previous_item.effects or [], sign=-1)
            previous_state.equipped = False

    _apply_item_effects(character, item.effects or [], sign=1)
    state.equipped = True
    db.commit()
    return get_character_detail(db, character_id)


def unequip_item(db: Session, character_id: int, item_id: int) -> CharacterDetailRead:
    character = db.query(Character).filter(Character.id == character_id).with_for_update().populate_existing().first()
    if character is None:
        raise HTTPException(status_code=404, detail="캐릭터를 찾을 수 없습니다.")
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


def delete_challenge(db: Session, challenge_id: int) -> str | None:
    challenge = db.get(Challenge, challenge_id)
    if not challenge:
        raise HTTPException(status_code=404, detail="도전과제를 찾을 수 없습니다.")

    image_url = challenge.image_url
    db.query(ChallengeProgress).filter(ChallengeProgress.challenge_id == challenge_id).delete()
    db.delete(challenge)
    db.commit()
    return image_url


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


def _recollection_chapter(item: Item) -> str | None:
    for effect in item.effects or []:
        if effect.get("stat") == "mission_exp_recollection":
            chapter = str(effect.get("chapter") or "").strip()
            return chapter or None
    return None


def _eligible_recollection_missions(db: Session, character_id: int, item: Item) -> list[Mission]:
    chapter = _recollection_chapter(item)
    if chapter is None:
        return []
    completed_ids = _rewarded_mission_ids(db, character_id) | {
        mission_id for mission_id, in db.query(MissionProgress.mission_id)
        .filter(MissionProgress.character_id == character_id, MissionProgress.achieved.is_(True))
        .all()
    }
    recollected_ids = {
        mission_id for mission_id, in db.query(Purchase.selected_mission_id)
        .filter(
            Purchase.character_id == character_id,
            Purchase.selected_mission_id.is_not(None),
        )
        .all()
        if mission_id is not None
    }
    recollected_ids |= {
        mid for mid, in db.query(ItemUsage.selected_mission_id).filter(
            ItemUsage.character_id == character_id, ItemUsage.selected_mission_id.is_not(None),
        ).all()
    }
    excluded_ids = completed_ids | recollected_ids
    query = db.query(Mission).filter(Mission.chapter == chapter, Mission.is_public.is_(True))
    if excluded_ids:
        query = query.filter(Mission.id.notin_(excluded_ids))
    return query.order_by(Mission.created_at.asc(), Mission.id.asc()).all()


def _recollection_experience(mission: Mission) -> int:
    # 기존 개별 경험치 필드와 현재 보상 목록을 일반 임무 보상과 동일하게 합산한다.
    return max(0, mission.reward_experience or 0) + sum(
        grant.get("amount", 0) for grant in mission.reward_items or []
        if grant.get("type") == "stat" and grant.get("stat") == "exp"
    )


def get_recollection_missions(db: Session, character_id: int, item_id: int) -> list[dict]:
    item = db.get(Item, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="아이템을 찾을 수 없습니다.")
    return [{"id": mission.id, "name": mission.name, "reward_experience": _recollection_experience(mission)}
            for mission in _eligible_recollection_missions(db, character_id, item)]


def _recollection_remaining(db: Session, character_id: int, item: Item, eligible_count: int) -> int:
    # 같은 챕터의 다른 회고록도 같은 임무를 대상으로 하므로 미사용 보유량을 함께 차감한다.
    chapter = _recollection_chapter(item)
    outstanding = 0
    for sibling in db.query(Item).all():
        if _recollection_chapter(sibling) != chapter:
            continue
        state = db.query(CharacterItemState).filter_by(character_id=character_id, item_id=sibling.id).first()
        outstanding += max(0, _sum_quantity(db, sibling.id, character_id) - (state.used_quantity if state else 0))
    return max(0, eligible_count - outstanding)


def _challenge_acquisition_chapter(item: Item) -> str | None:
    return next((str(effect.get("chapter") or "").strip() or None for effect in item.effects or []
                 if effect.get("stat") == "challenge_acquisition"), None)


def _eligible_acquisition_challenges(db: Session, character_id: int, item: Item) -> list[Challenge]:
    chapter = _challenge_acquisition_chapter(item)
    if chapter is None:
        return []
    completed = db.query(ChallengeProgress.challenge_id).filter(
        ChallengeProgress.character_id == character_id, ChallengeProgress.achieved.is_(True))
    acquired = db.query(ItemUsage.selected_challenge_id).filter(
        ItemUsage.character_id == character_id, ItemUsage.selected_challenge_id.is_not(None))
    rewarded = db.query(Reward.source_id).filter(
        Reward.character_id == character_id, Reward.type == "challenge", Reward.source_id.is_not(None))
    return db.query(Challenge).filter(
        Challenge.chapter == chapter, Challenge.is_public.is_(True),
        Challenge.id.notin_(completed), Challenge.id.notin_(acquired), Challenge.id.notin_(rewarded),
    ).order_by(Challenge.created_at, Challenge.id).all()


def get_acquisition_challenges(db: Session, character_id: int, item_id: int) -> list[dict]:
    item = db.get(Item, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="아이템을 찾을 수 없습니다.")
    return [{"id": challenge.id, "name": challenge.name} for challenge in _eligible_acquisition_challenges(db, character_id, item)]


def _challenge_acquisition_remaining(db: Session, character_id: int, item: Item, eligible_count: int) -> int:
    # 같은 챕터를 대상으로 하는 모든 아이템의 미사용 수량을 예약분으로 차감한다.
    chapter = _challenge_acquisition_chapter(item)
    sibling_ids = [sibling.id for sibling in db.query(Item).all() if _challenge_acquisition_chapter(sibling) == chapter]
    purchased = db.query(func.coalesce(func.sum(Purchase.quantity), 0)).filter(
        Purchase.character_id == character_id, Purchase.item_id.in_(sibling_ids)).scalar()
    used = db.query(func.coalesce(func.sum(CharacterItemState.used_quantity), 0)).filter(
        CharacterItemState.character_id == character_id, CharacterItemState.item_id.in_(sibling_ids)).scalar()
    return max(0, eligible_count - max(0, purchased - used))


def get_item_names(db: Session) -> list[ItemNameRead]:
    """모든 아이템의 id/이름만 반환한다. 상점에 아직 공개되지 않은 아이템도 보상 표기에는 이름이 필요하다."""
    rows = db.query(Item.id, Item.name).order_by(Item.id).all()
    return [ItemNameRead(id=row.id, name=row.name) for row in rows]


def get_items_with_stock(db: Session, character_id: int | None = None, *, admin: bool = False) -> list[ItemWithStock]:
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
    acquisition_capacity: dict[str, tuple[int, int]] = {}
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
        recollection_chapter = _recollection_chapter(item)
        eligible_missions = (
            _eligible_recollection_missions(db, character_id, item)
            if recollection_chapter is not None and character_id is not None and not admin
            else []
        )
        recollection_available = True
        if recollection_chapter is not None and character_id is not None:
            if admin:
                eligible_missions = _eligible_recollection_missions(db, character_id, item)
            remaining = _recollection_remaining(db, character_id, item, len(eligible_missions))
            remaining_per_character = min(remaining_per_character, remaining) if remaining_per_character is not None else remaining
            recollection_available = remaining > 0
        acquisition_chapter = _challenge_acquisition_chapter(item)
        acquisition_available = True
        if acquisition_chapter is not None:
            if character_id is None:
                if not admin:
                    continue
            else:
                if acquisition_chapter not in acquisition_capacity:
                    eligible_count = len(_eligible_acquisition_challenges(db, character_id, item))
                    acquisition_capacity[acquisition_chapter] = (eligible_count, _challenge_acquisition_remaining(db, character_id, item, eligible_count))
                eligible_count, remaining = acquisition_capacity[acquisition_chapter]
                if not admin and eligible_count == 0:
                    continue
                remaining_per_character = min(remaining_per_character, remaining) if remaining_per_character is not None else remaining
                acquisition_available = remaining > 0
        result.append(ItemWithStock(
            id=item.id,
            name=item.name,
            price_gold=item.price_gold,
            price_cp=item.price_cp,
            description_user=(item.description_after_purchase if item.special_merchant and char_purchased > 0 and not admin else item.description_user),
            special_merchant=item.special_merchant,
            description_after_purchase=item.description_after_purchase if admin else "",
            image_after_purchase_url=item.image_after_purchase_url if admin else None,
            purchase_limit_per_character=item.purchase_limit_per_character,
            purchase_limit_global=item.purchase_limit_global,
            available_from_chapter=item.available_from_chapter,
            available_until_chapter=item.available_until_chapter,
            item_type=item.item_type,
            restricted_mission_id=item.restricted_mission_id,
            image_url=(item.image_after_purchase_url if item.special_merchant and char_purchased > 0 and not admin else item.image_url),
            effects=item.effects or [],
            sale_paused=item.sale_paused,
            battle_only=item.battle_only,
            created_at=item.created_at,
            purchased_by_character=char_purchased,
            purchased_total=total_purchased,
            remaining_per_character=remaining_per_character,
            remaining_global=remaining_global,
            purchasable=(
                _is_item_purchasable(item, chapters_by_name, active_chapter)
                and not restricted_by_mission
                and recollection_available
                and acquisition_available
            ),
            eligible_missions=[
                {"id": mission.id, "name": mission.name, "reward_experience": _recollection_experience(mission)}
                for mission in eligible_missions
            ],
        ))
    return result


def bulk_purchase(db: Session, data: BulkPurchaseRequest, is_admin: bool = False) -> list[Purchase]:
    if not is_admin and not get_shop_status(db).is_open:
        raise HTTPException(status_code=400, detail="지금은 상점 이용이 불가능합니다.")

    # 1. 캐릭터 조회
    character = db.query(Character).filter(Character.id == data.character_id).with_for_update().first()
    if not character:
        raise HTTPException(status_code=404, detail="캐릭터를 찾을 수 없습니다.")

    # 2. 아이템 검증 및 총 비용 계산
    total_cost_gold = 0
    total_cost_cp = 0
    validated: list[tuple[Item, int]] = []
    recollection_in_cart: dict[str, int] = {}
    acquisition_in_cart: dict[str, int] = {}
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

        recollection_chapter = _recollection_chapter(item)
        if recollection_chapter is not None:
            remaining = _recollection_remaining(db, character.id, item, len(_eligible_recollection_missions(db, character.id, item)))
            requested = recollection_in_cart.get(recollection_chapter, 0) + qty
            if requested > remaining:
                raise HTTPException(status_code=400, detail=f"'{item.name}'은(는) 미달성 임무 수와 보유 회고록 수에 따라 {remaining}개까지 구매할 수 있습니다.")
            recollection_in_cart[recollection_chapter] = requested

        acquisition_chapter = _challenge_acquisition_chapter(item)
        if acquisition_chapter is not None:
            remaining = _challenge_acquisition_remaining(db, character.id, item, len(_eligible_acquisition_challenges(db, character.id, item)))
            requested = acquisition_in_cart.get(acquisition_chapter, 0) + qty
            if requested > remaining:
                raise HTTPException(status_code=400, detail=f"'{item.name}'은(는) 미달성 도전과제 수와 보유 아이템 수에 따라 {remaining}개까지 구매할 수 있습니다.")
            acquisition_in_cart[acquisition_chapter] = requested

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
        per_character_sums[item.id] = per_character_sums.get(item.id, 0) + qty
        global_sums[item.id] = global_sums.get(item.id, 0) + qty

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
        purchase = Purchase(character_id=character.id, item_id=item.id, quantity=qty)
        db.add(purchase)
        purchases.append(purchase)

    db.flush()
    purchase_ids = [purchase.id for purchase in purchases]
    db.commit()
    saved_by_id = {
        purchase.id: purchase
        for purchase in db.query(Purchase).filter(Purchase.id.in_(purchase_ids)).all()
    }
    return [saved_by_id[purchase_id] for purchase_id in purchase_ids]


def get_purchases(db: Session, character_id: int | None, item_id: int | None) -> list[PurchaseRead]:
    query = (
        db.query(
            Purchase,
            Character.name.label("character_name"),
            Item.name.label("item_name"),
            Item.image_url.label("item_image_url"),
        )
        .join(Character, Purchase.character_id == Character.id)
        .join(Item, Purchase.item_id == Item.id)
        .filter(Purchase.source == "shop")
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
            item_name=(
                f"{row.item_name} - {row.Purchase.selected_mission_name}"
                if row.Purchase.selected_mission_name else row.item_name
            ),
            item_image_url=row.item_image_url,
            quantity=row.Purchase.quantity,
            selected_mission_id=row.Purchase.selected_mission_id,
            granted_experience=row.Purchase.granted_experience,
            created_at=row.Purchase.created_at,
        )
        for row in rows
    ]


def get_item_history(db: Session, character_id: int) -> list[ItemHistoryEntry]:
    """구매/사용 이력을 시간순으로 병합해 반환한다."""
    purchase_rows = (
        db.query(Purchase, Item.name.label("item_name"), Item.image_url.label("item_image_url"))
        .join(Item, Purchase.item_id == Item.id)
        .filter(Purchase.character_id == character_id)
        .filter(Purchase.source == "shop")
        .all()
    )
    usage_rows = (
        db.query(
            ItemUsage,
            Item.name.label("item_name"),
            Item.image_url.label("item_image_url"),
            DeliveryRequest.status.label("delivery_status"),
        )
        .join(Item, ItemUsage.item_id == Item.id)
        .outerjoin(DeliveryRequest, DeliveryRequest.item_usage_id == ItemUsage.id)
        .filter(ItemUsage.character_id == character_id)
        .all()
    )
    # purchase/usage는 각각 별도 시퀀스의 id를 쓰므로, 병합 목록에서 겹치지 않도록 짝/홀수로 구분해 합성한다.
    entries = [
        ItemHistoryEntry(
            id=row.Purchase.id * 2,
            kind="purchase",
            item_id=row.Purchase.item_id,
            item_name=(
                f"{row.item_name} - {row.Purchase.selected_mission_name}"
                if row.Purchase.selected_mission_name else row.item_name
            ),
            item_image_url=row.item_image_url,
            quantity=row.Purchase.quantity,
            created_at=row.Purchase.created_at,
        )
        for row in purchase_rows
    ] + [
        ItemHistoryEntry(
            id=row.ItemUsage.id * 2 + 1,
            kind="use",
            item_id=row.ItemUsage.item_id,
            item_name=(f"{row.item_name} - {row.ItemUsage.selected_mission_name}"
                       if row.ItemUsage.selected_mission_name else
                       f"{row.item_name} - {row.ItemUsage.selected_challenge_name}" if row.ItemUsage.selected_challenge_name else row.item_name),
            item_image_url=row.item_image_url,
            quantity=row.ItemUsage.quantity,
            created_at=row.ItemUsage.created_at,
            delivery_status=row.delivery_status,
        )
        for row in usage_rows
    ]
    entries.sort(key=lambda e: e.created_at, reverse=True)
    return entries


def _read_challenge_progress(db: Session, challenge_id: int) -> list[ChallengeProgressRead]:
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
        .order_by(Character.name.asc(), Character.id.asc())
        .all()
    )
    paid_character_ids = {
        character_id for character_id, in db.query(Reward.character_id)
        .filter(Reward.type == "challenge", Reward.source_id == challenge_id)
        .all()
    }

    return [
        ChallengeProgressRead(
            character_id=row.character_id,
            character_name=row.character_name,
            character_image_url=row.character_image_url,
            achieved=row.achieved or row.character_id in paid_character_ids,
            memo=row.memo,
            reward_paid=row.character_id in paid_character_ids,
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
    return _read_challenge_progress(db, challenge_id)


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
    paid_character_ids = {
        character_id for character_id, in db.query(Reward.character_id)
        .filter(Reward.type == "challenge", Reward.source_id == challenge_id)
        .filter(Reward.character_id.in_(character_ids))
        .all()
    }

    for entry in data.entries:
        progress = progress_by_character.get(entry.character_id)
        if not progress:
            raise HTTPException(status_code=404, detail="도전과제 진행 현황을 찾을 수 없습니다.")
        progress.achieved = entry.achieved or entry.character_id in paid_character_ids
        progress.memo = entry.memo.strip()
        progress.updated_at = now_kst()

    db.commit()
    return _read_challenge_progress(db, challenge_id)


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


def get_attendance_entries(db: Session, *, runner_visible_only: bool = False) -> list[AttendanceEntryRead]:
    """전체 출석 기록을 최신순으로 반환한다. runner_visible_only=True면 관리자/미연결 캐릭터의 기록은 제외한다."""
    entries = (
        db.query(AttendanceEntry)
        .order_by(AttendanceEntry.attendance_date.desc(), AttendanceEntry.id.desc())
        .all()
    )
    character_ids = {e.character_id for e in entries}
    character_query = db.query(Character).filter(Character.id.in_(character_ids))
    if runner_visible_only:
        character_query = character_query.join(Member, Character.member_id == Member.id).filter(
            Member.role.in_(["RUNNER", "STAFF"])
        )
    characters = {c.id: c for c in character_query.all()} if character_ids else {}

    if runner_visible_only:
        entries = [e for e in entries if e.character_id in characters]

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


def delete_attendance_entry(db: Session, entry_id: int) -> list[AttendanceEntryRead]:
    """출석 등록을 잘못한 경우 관리자가 해당 기록을 삭제한다."""
    entry = db.get(AttendanceEntry, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="출석 기록을 찾을 수 없습니다.")

    db.delete(entry)
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
            rewarded_at=_today(),
        ))
        entry.reward_paid = True
        paid_count += 1

    db.commit()
    return AttendanceRewardPayResult(paid_count=paid_count, entries=get_attendance_entries(db))


NAVER_SESSION_ID = 1
NAVER_ATTENDANCE_CLUB_ID = "31734615"
NAVER_ATTENDANCE_MENU_ID = "21"
NAVER_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def _mask_secret(value: str | None) -> str | None:
    if not value:
        return None
    return value[:3] + "***"


def get_naver_session(db: Session) -> NaverSession:
    session = db.get(NaverSession, NAVER_SESSION_ID)
    if session is None:
        session = NaverSession(id=NAVER_SESSION_ID)
        db.add(session)
        db.commit()
        db.refresh(session)
    return session


def _to_naver_session_read(session: NaverSession) -> NaverSessionRead:
    return NaverSessionRead(
        nid_aut_masked=_mask_secret(session.nid_aut),
        nid_ses_masked=_mask_secret(session.nid_ses),
        has_session=bool(session.nid_aut and session.nid_ses),
        is_valid=session.is_valid,
        last_checked_at=session.last_checked_at,
    )


def get_naver_session_view(db: Session) -> NaverSessionRead:
    return _to_naver_session_read(get_naver_session(db))


def update_naver_session(db: Session, nid_aut: str, nid_ses: str) -> NaverSessionRead:
    session = get_naver_session(db)
    session.nid_aut = nid_aut
    session.nid_ses = nid_ses
    session.is_valid = None
    session.last_checked_at = None
    db.commit()
    db.refresh(session)
    return _to_naver_session_read(session)


async def _fetch_naver_attendance_html(nid_aut: str, nid_ses: str, target_date: date) -> str:
    """네이버 카페 출석부의 특정 날짜 페이지를 쿠키 세션으로 직접 요청한다(브라우저 없이 순수 HTTP GET).

    출석부는 EUC-KR(KSC5601)로 응답하므로 그렇게 디코딩한다.
    """
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                "https://cafe.naver.com/AttendanceView.nhn",
                params={
                    "search.clubid": NAVER_ATTENDANCE_CLUB_ID,
                    "search.menuid": NAVER_ATTENDANCE_MENU_ID,
                    "search.attendyear": f"{target_date.year:04d}",
                    "search.attendmonth": f"{target_date.month:02d}",
                    "search.attendday": f"{target_date.day:02d}",
                },
                cookies={"NID_AUT": nid_aut, "NID_SES": nid_ses},
                headers={"User-Agent": NAVER_USER_AGENT},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"네이버 카페 요청 실패: {exc}")
    return resp.content.decode("euc-kr", errors="replace")


def _is_logged_in_attendance_page(html: str) -> bool:
    """출석자가 0명이어도 로그인 상태면 항상 나오는 목록 컨테이너로 로그인 여부를 판별한다.

    (세션이 만료되면 출석부 대신 "멤버에게 공개된 게시판입니다" 알림 스크립트만 반환된다.)
    """
    return "list_attendance" in html


def _extract_attendance_names(html: str) -> list[str]:
    return re.findall(r'class="p-nick">.*?class="link_text"[^>]*>([^<]+)</a>', html, re.DOTALL)


async def check_naver_session(db: Session) -> NaverSessionRead:
    """저장된 쿠키로 실제 출석부에 접근해 로그인 세션이 살아있는지 검사한다."""
    session = get_naver_session(db)
    if not session.nid_aut or not session.nid_ses:
        raise HTTPException(status_code=400, detail="등록된 네이버 세션 쿠키가 없습니다.")

    html = await _fetch_naver_attendance_html(session.nid_aut, session.nid_ses, _today())
    session.is_valid = _is_logged_in_attendance_page(html)
    session.last_checked_at = now_kst()
    db.commit()
    db.refresh(session)
    return _to_naver_session_read(session)


async def run_auto_attendance(db: Session, target_date: date) -> AutoAttendanceResult:
    """네이버 출석부에서 target_date 출석자 이름을 가져와 DB 캐릭터 이름과 대조해
    출석 미처리 캐릭터는 출석 처리하고, 보상 미지급 캐릭터는 보상을 지급한다."""
    session = get_naver_session(db)
    if not session.nid_aut or not session.nid_ses:
        raise HTTPException(status_code=400, detail="등록된 네이버 세션 쿠키가 없습니다.")

    html = await _fetch_naver_attendance_html(session.nid_aut, session.nid_ses, target_date)
    session.is_valid = _is_logged_in_attendance_page(html)
    session.last_checked_at = now_kst()
    db.commit()

    if not session.is_valid:
        raise HTTPException(
            status_code=502,
            detail="네이버 세션이 만료되어 출석부를 불러올 수 없습니다. 쿠키를 다시 등록해주세요.",
        )

    crawled_names = _extract_attendance_names(html)

    characters_by_name: dict[str, Character] = {}
    for character in db.query(Character).all():
        characters_by_name.setdefault(character.name, character)  # 동명 캐릭터는 먼저 매칭된 쪽 사용

    matched_names: list[str] = []
    unmatched_names: list[str] = []
    matched_characters_by_id: dict[int, Character] = {}
    seen_unmatched_names: set[str] = set()
    for name in crawled_names:
        character = characters_by_name.get(name)
        if character:
            # 같은 캐릭터가 여러 번 글을 남겨도 목록에는 한 번만 나오게 한다(중복 출석/보상 방지는
            # 아래에서 matched_characters_by_id를 캐릭터 ID로 순회하는 것으로 이미 보장된다).
            if character.id not in matched_characters_by_id:
                matched_names.append(name)
            matched_characters_by_id[character.id] = character
        elif name not in seen_unmatched_names:
            seen_unmatched_names.add(name)
            unmatched_names.append(name)

    existing_entries = {
        entry.character_id: entry
        for entry in db.query(AttendanceEntry).filter(AttendanceEntry.attendance_date == target_date).all()
    }

    newly_checked_in: list[Character] = []
    for character in matched_characters_by_id.values():
        if character.id not in existing_entries:
            entry = AttendanceEntry(attendance_date=target_date, character_id=character.id)
            db.add(entry)
            db.flush()
            existing_entries[character.id] = entry
            newly_checked_in.append(character)

    db.commit()

    newly_rewarded: list[Character] = []
    for character in matched_characters_by_id.values():
        entry = existing_entries[character.id]
        if entry.reward_paid:
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
            rewarded_at=_today(),
        ))
        entry.reward_paid = True
        newly_rewarded.append(character)

    db.commit()

    return AutoAttendanceResult(
        attendance_date=target_date,
        crawled_count=len(crawled_names),
        matched_names=matched_names,
        unmatched_names=unmatched_names,
        newly_checked_in=[
            AutoAttendanceCharacterResult(character_id=c.id, character_name=c.name) for c in newly_checked_in
        ],
        newly_rewarded=[
            AutoAttendanceCharacterResult(character_id=c.id, character_name=c.name) for c in newly_rewarded
        ],
    )


def get_attendance_streak_ranking(db: Session) -> list[AttendanceStreakEntry]:
    """연속출석 순위를 5위까지 반환한다. 연속 출석일이 같으면 같은 순위를 공유한다(밀집 순위)."""
    characters = db.query(Character).order_by(Character.name.asc()).all()
    dates_by_character = _attended_dates_by_character(db)
    today = _today()

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
    item_names = _reward_item_names(db, rewards)
    return [_to_reward_read(r, item_names) for r in rewards]


def _has_noncombat_heal_on(db: Session, healer_id: int, on_date: date) -> bool:
    """이 치유 캐릭터가 해당 날짜에 이미 비전투 치유를 사용했는지, 보상 이력으로 판단한다.
    (날짜별로 독립적으로 판단하므로 지난 날짜로 소급 기록해도 오늘 사용 가능 여부에 영향을 주지 않는다.)
    """
    return db.query(Reward).filter(
        Reward.type == "heal",
        Reward.source_id == healer_id,
        Reward.rewarded_at == on_date,
    ).first() is not None


def _to_healer_candidate_read(db: Session, character: Character, today: date) -> HealerCandidateRead:
    return HealerCandidateRead(
        id=character.id,
        name=character.name,
        image_url=character.image_url,
        hp=character.hp,
        hp_max=character.hp_max,
        heal_available=not _has_noncombat_heal_on(db, character.id, today),
    )


def list_healer_candidates(db: Session, on_date: date | None = None) -> list[HealerCandidateRead]:
    """관리 페이지 치유 탭: 치유 포지션 캐릭터와 지정한 날짜(기본값 오늘)의 비전투 치유 사용 가능 여부."""
    target_date = on_date or _today()
    characters = (
        db.query(Character)
        .filter(Character.faction == "치유")
        .order_by(Character.name.asc())
        .all()
    )
    return [_to_healer_candidate_read(db, c, target_date) for c in characters]


def perform_noncombat_heal(
    db: Session,
    healer_id: int,
    target_character_id: int,
    heal_date: date | None = None,
) -> NoncombatHealResult:
    """치유 포지션 캐릭터의 비전투 치유. 날짜당 한 번만 가능하고(지난 날짜로도 기록 가능),
    대상 최대 체력의 25%를 회복시킨다.
    """
    healer = db.get(Character, healer_id)
    if healer is None:
        raise HTTPException(status_code=404, detail="치유 캐릭터를 찾을 수 없습니다.")
    if healer.faction != "치유":
        raise HTTPException(status_code=400, detail="치유 포지션 캐릭터만 비전투 치유를 사용할 수 있습니다.")

    today = _today()
    target_date = heal_date or today
    if target_date > today:
        raise HTTPException(status_code=400, detail="미래 날짜에는 치유를 기록할 수 없습니다.")
    if _has_noncombat_heal_on(db, healer.id, target_date):
        raise HTTPException(status_code=400, detail="해당 날짜에는 이미 비전투 치유를 사용했습니다.")

    target = db.get(Character, target_character_id)
    if target is None:
        raise HTTPException(status_code=404, detail="치유 대상을 찾을 수 없습니다.")

    heal_amount = max(0, _floor_amount(0.25 * target.hp_max))
    before = target.hp
    target.hp = min(target.hp_max, target.hp + heal_amount)
    healed = target.hp - before

    db.add(Reward(
        type="heal",
        character_id=target.id,
        source_id=healer.id,
        label=f"{healer.name}의 치료",
        reward_items=[{"type": "stat_hp", "amount": healed}],
        rewarded_at=target_date,
    ))
    db.commit()
    db.refresh(target)

    return NoncombatHealResult(
        healer=_to_healer_candidate_read(db, healer, today),
        target_character_id=target.id,
        target_hp=target.hp,
        target_hp_max=target.hp_max,
        heal_amount=healed,
    )


# ── Settlement (정산) ────────────────────────────────────────────────────────

SETTLEMENT_GOLD_PER_POST = 1        # 게시글 1개당 1골드
SETTLEMENT_COMMENTS_PER_CP = 50     # 댓글 50개당 1CP
SETTLEMENT_CP_PER_LINK = 1          # 로그 링크 1개당 1CP
SETTLEMENT_CP_PER_NEW_TARGET = 1    # 같은 챕터에서 처음 기입되는 교류 대상 캐릭터 1명당 1CP


def _log_settlement_target_bonus(db: Session, req: SettlementRequest) -> int:
    """같은 챕터에서 같은 러너(캐릭터)의 더 이른 교류 로그에 등장한 적 없는 교류 대상 캐릭터 수 × 1CP."""
    if not req.chapter or not req.target_character_ids:
        return 0
    earlier_requests = (
        db.query(SettlementRequest)
        .filter(SettlementRequest.type == "log")
        .filter(SettlementRequest.chapter == req.chapter)
        .filter(SettlementRequest.character_id == req.character_id)
        .filter(SettlementRequest.id < req.id)
        .all()
    )
    already_appeared: set[int] = set()
    for r in earlier_requests:
        already_appeared.update(r.target_character_ids or [])
    new_targets = [cid for cid in req.target_character_ids if cid not in already_appeared]
    return len(new_targets) * SETTLEMENT_CP_PER_NEW_TARGET


def get_appeared_target_character_ids(db: Session, member: Member) -> list[int]:
    """현재 진행 중인 챕터에서 본인이 이미 교류 로그에 기입한(챕터 내 최초 기입 보너스를 이미 받은)
    캐릭터 id 목록."""
    chapter = _get_active_chapter_model(db)
    if not chapter:
        return []
    own_character_id = get_member_character_id(db, member.id)
    if own_character_id is None:
        return []
    requests = (
        db.query(SettlementRequest)
        .filter(SettlementRequest.type == "log")
        .filter(SettlementRequest.chapter == chapter.name)
        .filter(SettlementRequest.character_id == own_character_id)
        .all()
    )
    seen: set[int] = set()
    for r in requests:
        seen.update(r.target_character_ids or [])
    return sorted(seen)


def get_settlement_target_candidates(db: Session, member: Member) -> list[CharacterRead]:
    """정산 요청의 '교류 대상'으로 고를 수 있는 캐릭터 목록(러너 캐릭터 + 스텝 캐릭터, 본인 캐릭터 제외)."""
    own_character_id = get_member_character_id(db, member.id)
    rows = (
        db.query(Character)
        .join(Member, Character.member_id == Member.id)
        .filter(Member.role.in_(["RUNNER", "STAFF"]))
        .order_by(Character.name.asc())
        .all()
    )
    return [_to_character_read(c) for c in rows if c.id != own_character_id]


def _validate_settlement_targets(db: Session, own_character_id: int, target_ids: list[int]) -> list[int]:
    unique_ids = sorted({cid for cid in target_ids if cid != own_character_id})
    if not unique_ids:
        return []
    valid_ids = {
        row[0]
        for row in (
            db.query(Character.id)
            .join(Member, Character.member_id == Member.id)
            .filter(Member.role.in_(["RUNNER", "STAFF"]))
            .filter(Character.id.in_(unique_ids))
            .all()
        )
    }
    return [cid for cid in unique_ids if cid in valid_ids]


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
        cp = len(req.links or []) * SETTLEMENT_CP_PER_LINK + _log_settlement_target_bonus(db, req)
        return 0, cp

    prev = _latest_paid_board_settlement(db, req.character_id, before_id=req.id)
    return _settlement_suggestion_from_previous(req, prev)


def _settlement_suggestion_from_previous(
    req: SettlementRequest,
    prev: SettlementRequest | None,
) -> tuple[int, int]:
    prev_posts = prev.total_posts if prev else 0
    prev_comments = prev.total_comments if prev else 0
    gold = (req.total_posts or 0) - (prev_posts or 0)
    cp = (req.total_comments or 0) // SETTLEMENT_COMMENTS_PER_CP - (prev_comments or 0) // SETTLEMENT_COMMENTS_PER_CP
    return max(0, gold) * SETTLEMENT_GOLD_PER_POST, max(0, cp)


def _to_settlement_read(
    db: Session,
    req: SettlementRequest,
    character: Character | None,
    suggestion: tuple[int, int] | None = None,
    target_characters: dict[int, Character] | None = None,
) -> SettlementRead:
    suggested_gold, suggested_cp = suggestion if suggestion is not None else _settlement_suggestion(db, req)
    target_ids = req.target_character_ids or []
    if target_characters is None and target_ids:
        target_characters = {
            c.id: c for c in db.query(Character).filter(Character.id.in_(target_ids)).all()
        }
    targets = [
        SettlementTargetRead(id=cid, name=c.name, image_url=c.image_url)
        for cid in target_ids
        if (c := (target_characters or {}).get(cid)) is not None
    ]
    return SettlementRead(
        id=req.id,
        character_id=req.character_id,
        character_name=character.name if character else "(삭제된 캐릭터)",
        character_image_url=character.image_url if character else None,
        type=req.type,
        total_posts=req.total_posts,
        total_comments=req.total_comments,
        links=req.links or [],
        targets=targets,
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
    target_ids = {cid for r in requests for cid in (r.target_character_ids or [])}
    all_character_ids = character_ids | target_ids
    characters = {
        c.id: c for c in db.query(Character).filter(Character.id.in_(all_character_ids)).all()
    } if all_character_ids else {}

    paid_board_requests_by_character: dict[int, list[SettlementRequest]] = {}
    if character_ids:
        paid_board_requests = (
            db.query(SettlementRequest)
            .filter(SettlementRequest.character_id.in_(character_ids))
            .filter(SettlementRequest.type == "board")
            .filter(SettlementRequest.status == "paid")
            .order_by(SettlementRequest.character_id.asc(), SettlementRequest.id.desc())
            .all()
        )
        for paid in paid_board_requests:
            paid_board_requests_by_character.setdefault(paid.character_id, []).append(paid)

    def suggestion_for(req: SettlementRequest) -> tuple[int, int]:
        if req.type == "log":
            cp = len(req.links or []) * SETTLEMENT_CP_PER_LINK + _log_settlement_target_bonus(db, req)
            return 0, cp
        prev = next(
            (
                paid
                for paid in paid_board_requests_by_character.get(req.character_id, [])
                if paid.id != req.id
            ),
            None,
        )
        return _settlement_suggestion_from_previous(req, prev)

    return [
        _to_settlement_read(db, r, characters.get(r.character_id), suggestion_for(r), characters)
        for r in requests
    ]


def create_settlement_request(db: Session, member: Member, data: SettlementCreate) -> list[SettlementRead]:
    character_id = get_member_character_id(db, member.id)
    if character_id is None:
        raise HTTPException(status_code=400, detail="정산을 요청하려면 먼저 캐릭터를 생성해야 합니다.")

    target_character_ids: list[int] = []
    chapter_name: str | None = None
    if data.type == "log":
        active_chapter = _get_active_chapter_model(db)
        chapter_name = active_chapter.name if active_chapter else None
        target_character_ids = _validate_settlement_targets(db, character_id, data.target_character_ids)

    db.add(SettlementRequest(
        character_id=character_id,
        type=data.type,
        total_posts=data.total_posts,
        total_comments=data.total_comments,
        links=data.links,
        target_character_ids=target_character_ids,
        chapter=chapter_name,
    ))
    db.commit()
    return get_settlement_requests(db, character_id)


def cancel_settlement_request(db: Session, member: Member, settlement_id: int) -> list[SettlementRead]:
    """지급 완료되지 않은(pending) 본인의 정산 요청을 취소(삭제)한다."""
    req = db.get(SettlementRequest, settlement_id)
    if not req:
        raise HTTPException(status_code=404, detail="정산 요청을 찾을 수 없습니다.")
    character_id = get_member_character_id(db, member.id)
    if character_id is None or req.character_id != character_id:
        raise HTTPException(status_code=403, detail="본인의 정산 요청만 취소할 수 있습니다.")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="지급 완료된 정산 요청은 취소할 수 없습니다.")

    db.delete(req)
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
        rewarded_at=_today(),
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
    query = db.query(Reward, Character.name, Character.image_url).join(Character, Reward.character_id == Character.id)
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
    rewards = [reward for reward, _, _ in rows]
    item_names = _reward_item_names(db, rewards)
    return [
        RewardWithCharacterRead(
            **_to_reward_read(reward, item_names).model_dump(),
            character_name=character_name,
            character_image_url=character_image_url,
            revoked=reward.id in revoked_ids,
        )
        for reward, character_name, character_image_url in rows
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
                source="reward",
            ))
            negated.append({"type": "item", "item_id": entry.get("item_id"), "quantity": -quantity})
            continue
        negated.append({**entry, "amount": -amount})

    revoke = Reward(
        type="revoke",
        character_id=character.id,
        source_id=reward.id,
        reward_items=negated,
        rewarded_at=_today(),
    )
    db.add(revoke)
    db.flush()
    item_names = _reward_item_names(db, [revoke])
    result = RewardWithCharacterRead(
        **_to_reward_read(revoke, item_names).model_dump(),
        character_name=character.name,
        character_image_url=character.image_url,
        revoked=False,
    )
    db.commit()
    return result


def send_admin_gift(db: Session, data: AdminGiftRequest) -> list[RewardRead]:
    """관리자가 하나 이상의 캐릭터에게 골드·CP·경험치·아이템을 지급하고, 캐릭터별로 '관리자의 선물' 보상 이력을 남긴다."""
    requested_character_ids = list(dict.fromkeys(data.character_ids))
    characters = db.query(Character).filter(Character.id.in_(requested_character_ids)).all()
    characters_by_id = {character.id: character for character in characters}
    missing_character_ids = [character_id for character_id in requested_character_ids if character_id not in characters_by_id]
    if missing_character_ids:
        raise HTTPException(
            status_code=404,
            detail=f"캐릭터를 찾을 수 없습니다: {', '.join(map(str, missing_character_ids))}",
        )

    item_ids = [cart_item.item_id for cart_item in data.items]
    items_map: dict[int, Item] = {}
    if item_ids:
        items_map = {i.id: i for i in db.query(Item).filter(Item.id.in_(item_ids)).all()}
        missing = sorted(set(item_ids) - set(items_map))
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"존재하지 않는 아이템 ID: {', '.join(map(str, missing))}",
            )

    rewards: list[Reward] = []
    for character_id in requested_character_ids:
        character = characters_by_id[character_id]
        reward_items: list[dict] = []
        if data.gold > 0:
            character.gold += data.gold
            reward_items.append({"type": "gold", "amount": data.gold})
        if data.cp > 0:
            character.cp += data.cp
            reward_items.append({"type": "stat", "stat": "cp", "amount": data.cp})
        if data.experience > 0:
            character.exp += data.experience
            reward_items.append({"type": "experience", "amount": data.experience})

        if data.items:
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
            rewarded_at=_today(),
        )
        db.add(reward)
        rewards.append(reward)
        _apply_growth_from_exp(db, character)

    db.flush()
    item_names = {item.id: item.name for item in items_map.values()}
    reward_reads = [_to_reward_read(reward, item_names) for reward in rewards]
    db.commit()
    return reward_reads


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
        character_id
        for character_id, in db.query(Reward.character_id)
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
        _apply_growth_from_exp(db, character)

    db.flush()
    item_names = _reward_item_names(db, created_rewards)
    rewards_read = [_to_reward_read(r, item_names) for r in created_rewards]
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


def delete_mission(db: Session, mission_id: int) -> str | None:
    mission = db.get(Mission, mission_id)
    if not mission:
        raise HTTPException(status_code=404, detail="임무를 찾을 수 없습니다.")

    image_url = mission.image_url
    db.query(Item).filter(Item.restricted_mission_id == mission_id).update({"restricted_mission_id": None})
    db.query(MissionProgress).filter(MissionProgress.mission_id == mission_id).delete()
    db.delete(mission)
    db.commit()
    return image_url


def get_missions(db: Session, chapter: str | None = None) -> list[Mission]:
    query = db.query(Mission)
    if chapter is not None:
        query = query.filter(Mission.chapter == chapter)
    return query.order_by(Mission.created_at.asc(), Mission.id.asc()).all()


def _read_mission_progress(db: Session, mission_id: int) -> list[MissionProgressRead]:
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
        .order_by(Character.name.asc(), Character.id.asc())
        .all()
    )
    paid_character_ids = {
        character_id for character_id, in db.query(Reward.character_id)
        .filter(Reward.type == "mission", Reward.source_id == mission_id)
        .all()
    }
    return [
        MissionProgressRead(
            character_id=row.character_id,
            character_name=row.character_name,
            character_image_url=row.character_image_url,
            achieved=row.achieved or row.character_id in paid_character_ids,
            memo=row.memo,
            reward_paid=row.character_id in paid_character_ids,
        )
        for row in rows
    ]


def get_mission_progress(db: Session, mission_id: int) -> list[MissionProgressRead]:
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="임무를 찾을 수 없습니다.")

    character_ids = [cid for cid, in db.query(Character.id).all()]
    _create_mission_progress_rows(db, [mission.id], character_ids)
    db.commit()
    return _read_mission_progress(db, mission_id)


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
    paid_character_ids = {
        character_id for character_id, in db.query(Reward.character_id)
        .filter(Reward.type == "mission", Reward.source_id == mission_id)
        .filter(Reward.character_id.in_(character_ids))
        .all()
    }

    for entry in data.entries:
        progress = progress_by_character.get(entry.character_id)
        if not progress:
            raise HTTPException(status_code=404, detail="임무 진행 현황을 찾을 수 없습니다.")
        progress.achieved = entry.achieved or entry.character_id in paid_character_ids
        progress.memo = entry.memo.strip()
        progress.updated_at = now_kst()

    db.commit()
    return _read_mission_progress(db, mission_id)


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
        character_id
        for character_id, in db.query(Reward.character_id)
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
        _apply_growth_from_exp(db, character)

    db.flush()
    item_names = _reward_item_names(db, created_rewards)
    rewards_read = [_to_reward_read(r, item_names) for r in created_rewards]
    db.commit()
    return RewardPayResult(paid_count=len(rewards_read), rewards=rewards_read)


# ── Chapter ───────────────────────────────────────────────────────────────────

def _get_active_chapter_model(db: Session, *, today: date | None = None) -> Chapter | None:
    current_day = today or _today()
    return (
        db.query(Chapter)
        .filter(Chapter.start_date <= current_day, Chapter.end_date >= current_day)
        .order_by(Chapter.start_date.desc())
        .first()
    )


def get_chapters(db: Session, *, admin: bool = True) -> list[ChapterRead]:
    chapters = db.query(Chapter).order_by(Chapter.start_date.desc()).all()
    today = _today()
    return [_to_chapter_read(chapter, today=today, admin=admin) for chapter in chapters]


def create_chapter(db: Session, data: ChapterCreate) -> ChapterRead:
    chapter = Chapter(
        name=data.name.strip(),
        start_date=data.start_date,
        end_date=data.end_date,
        battle_date=data.battle_date,
        battle_time=data.battle_time,
        music_url=data.music_url.strip() if data.music_url else None,
        battle_victory_reward_gold=data.battle_victory_reward_gold,
        battle_action_reward_gold=data.battle_action_reward_gold,
        battle_participation_reward_exp=data.battle_participation_reward_exp,
    )
    db.add(chapter)
    db.commit()
    db.refresh(chapter)
    return _to_chapter_read(chapter)


def update_chapter(db: Session, chapter_id: int, data: ChapterCreate) -> ChapterRead:
    chapter = db.get(Chapter, chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="챕터를 찾을 수 없습니다.")
    chapter.name = data.name.strip()
    chapter.start_date = data.start_date
    chapter.end_date = data.end_date
    chapter.battle_date = data.battle_date
    chapter.battle_time = data.battle_time
    chapter.music_url = data.music_url.strip() if data.music_url else None
    chapter.battle_victory_reward_gold = data.battle_victory_reward_gold
    chapter.battle_action_reward_gold = data.battle_action_reward_gold
    chapter.battle_participation_reward_exp = data.battle_participation_reward_exp
    db.commit()
    db.refresh(chapter)
    return _to_chapter_read(chapter)


def delete_chapter(db: Session, chapter_id: int) -> tuple[str | None, str | None]:
    """챕터를 삭제한다. 임무·도전과제·에너미·아이템은 챕터를 이름 문자열로만 참조하므로 FK 제약이 없다."""
    chapter = db.get(Chapter, chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="챕터를 찾을 수 없습니다.")

    image_url = chapter.image_url
    music_url = chapter.music_url
    db.delete(chapter)
    db.commit()
    return image_url, music_url


def get_active_chapter(db: Session, *, admin: bool = True) -> ChapterRead | None:
    today = _today()
    chapter = _get_active_chapter_model(db, today=today)
    if not chapter:
        return None
    return _to_chapter_read(chapter, today=today, admin=admin)


# ── Enemy ─────────────────────────────────────────────────────────────────────

def _to_enemy_read(enemy: Enemy) -> EnemyRead:
    return EnemyRead(
        id=enemy.id,
        name=enemy.name,
        chapter=enemy.chapter,
        image_url=enemy.image_url,
        base_hp=enemy.base_hp,
        hp_per_attacker=enemy.hp_per_attacker,
        hp_per_defender=enemy.hp_per_defender,
        hp_per_healer=enemy.hp_per_healer,
        attack=enemy.attack,
        skills=_enemy_skill_models(enemy.skills),
        created_at=enemy.created_at,
    )


def get_enemies(db: Session, chapter: str | None = None) -> list[EnemyRead]:
    query = db.query(Enemy)
    if chapter is not None:
        query = query.filter(Enemy.chapter == chapter)
    enemies = query.order_by(Enemy.created_at.asc()).all()
    return [_to_enemy_read(e) for e in enemies]


def get_enemies_for_member(db: Session, member: Member, chapter: str | None = None) -> list[EnemyRead]:
    if is_admin_role(member.role):
        return get_enemies(db, chapter)

    today = _today()
    active_chapter = _get_active_chapter_model(db, today=today)
    if not active_chapter or not _is_battle_open(active_chapter):
        return []
    if chapter is not None and chapter != active_chapter.name:
        return []
    return get_enemies(db, active_chapter.name)


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
    return _to_enemy_read(enemy)


def update_enemy(db: Session, enemy_id: int, data: EnemyCreate) -> EnemyRead:
    enemy = db.get(Enemy, enemy_id)
    if not enemy:
        raise HTTPException(status_code=404, detail="에너미를 찾을 수 없습니다.")

    enemy.name = data.name.strip()
    enemy.chapter = data.chapter.strip() if data.chapter else None
    enemy.base_hp = data.base_hp
    enemy.hp_per_attacker = data.hp_per_attacker
    enemy.hp_per_defender = data.hp_per_defender
    enemy.hp_per_healer = data.hp_per_healer
    enemy.attack = data.attack
    enemy.skills = [s.model_dump() for s in data.skills]

    db.commit()
    db.refresh(enemy)
    return _to_enemy_read(enemy)


def delete_enemy(db: Session, enemy_id: int) -> str | None:
    enemy = db.get(Enemy, enemy_id)
    if not enemy:
        raise HTTPException(status_code=404, detail="에너미를 찾을 수 없습니다.")

    image_url = enemy.image_url
    db.delete(enemy)
    db.commit()
    return image_url


# ── Environment (챕터 전투 환경 효과) ──────────────────────────────────────────

def get_environments(db: Session, chapter: str | None = None) -> list[EnvironmentRead]:
    query = db.query(Environment)
    if chapter is not None:
        query = query.filter(Environment.chapter == chapter)
    rows = query.order_by(Environment.id.asc()).all()
    return [EnvironmentRead.model_validate(row) for row in rows]


def create_environment(db: Session, data: EnvironmentCreate) -> EnvironmentRead:
    environment = Environment(
        chapter=data.chapter.strip(),
        name=data.name.strip(),
        color=data.color,
        max_stacks=data.max_stacks,
        dispellable=data.dispellable,
        enemy_condition=data.enemy_condition,
        condition_enemy_id=data.condition_enemy_id,
        stackable=data.stackable,
        stacks_per_round=data.stacks_per_round,
        damage_per_stack=data.damage_per_stack,
    )
    db.add(environment)
    db.commit()
    db.refresh(environment)
    return EnvironmentRead.model_validate(environment)


def update_environment(db: Session, environment_id: int, data: EnvironmentCreate) -> EnvironmentRead:
    environment = db.get(Environment, environment_id)
    if not environment:
        raise HTTPException(status_code=404, detail="환경을 찾을 수 없습니다.")
    environment.chapter = data.chapter.strip()
    environment.name = data.name.strip()
    environment.color = data.color
    environment.max_stacks = data.max_stacks
    environment.dispellable = data.dispellable
    environment.enemy_condition = data.enemy_condition
    environment.condition_enemy_id = data.condition_enemy_id
    environment.stackable = data.stackable
    environment.stacks_per_round = data.stacks_per_round
    environment.damage_per_stack = data.damage_per_stack
    db.commit()
    db.refresh(environment)
    return EnvironmentRead.model_validate(environment)


def delete_environment(db: Session, environment_id: int) -> None:
    environment = db.get(Environment, environment_id)
    if not environment:
        raise HTTPException(status_code=404, detail="환경을 찾을 수 없습니다.")
    db.delete(environment)
    db.commit()


# ── Battle ───────────────────────────────────────────────────────────────────
# 참가자/에너미/하수인 상태는 JSON 스냅샷(dict)으로 BattleSession에 저장한다.
# 아이템 효과의 stat 이름 → 전투 스냅샷 dict 키 매핑(경제/성장 스탯은 전투 중 의미가 없어 제외한다).
BATTLE_ITEM_EFFECT_KEYS: dict[str, str] = {
    "hp": "hp", "hp_max": "max_hp", "mp": "mp", "mp_max": "max_mp",
    "atk": "atk", "atk_p": "atk_p", "def": "def", "def_p": "def_p", "def_eff": "def_eff",
    "dmg_p": "dmg_p", "dmg_r": "dmg_r", "heal_eff": "heal_eff", "skill_target": "skill_target",
    "attn": "attn", "presence": "presence", "sh": "shield",
    "skill_lv": "skill_lv", "skill_eff_true": "skill_eff_true", "skill_eff_fixed": "skill_eff_fixed",
    "skill_cost": "skill_cost",
}

# 아이템 효과 stat → 전투 로그에 표기할 한글 라벨(apps/web/lib/api.ts의 EFFECT_STAT_LABELS와 맞춘다).
BATTLE_ITEM_EFFECT_LABELS: dict[str, str] = {
    "hp": "현재 체력", "hp_max": "최대 체력", "hp_heal_p": "체력", "mp": "MP", "mp_max": "MP 최대치",
    "atk": "공격력", "atk_p": "공격력 증폭(%)", "def": "방어력", "def_p": "방어력 증폭(%)", "def_eff": "방어 효율(%)",
    "dmg_p": "피해 증폭(%)", "dmg_r": "피해 감소(%)", "heal_eff": "치유 효율(%)", "skill_target": "기술 대상",
    "attn": "주목도", "presence": "존재감(%)", "sh": "보호막",
    "skill_lv": "기술 등급", "skill_eff_true": "기술 효율(고정)", "skill_eff_fixed": "기술 효율(비례, %)",
    "skill_cost": "기술 비용",
}

SKILL_LEVEL_SUFFIX_VAR_NAMES = {
    "ab_strike",
    "ab_crushing",
    "ab_harm",
    "ab_anvil",
    "ab_counter",
    "ab_protect",
    "ab_cure",
    "ab_aid",
    "ab_purification",
    "ab_encourage",
    "ab_curse",
    "ab_charge",
}
SUPPORTED_BATTLE_SKILL_VAR_NAMES = set(SKILL_LEVEL_SUFFIX_VAR_NAMES)
SKILL_BOOK_ORDER = ("용맹의 서", "불굴의 서", "헌신의 서", "탐구의 서")

# 아군 턴 발동 순서: 숫자가 낮을수록 먼저 개시된다. 기술은 기술마다 activation_order 값을 따로 갖는다.
BATTLE_ACTION_KIND_PRIORITY: dict[str, int] = {
    "retreat": -1,
    "rescue": -1,
    "item": -1,
    "defend": 3,
    "heal": 5,
    "attack": 8,
    "none": 9,
}


@lru_cache(maxsize=None)
def _skill_spec_map(book: str) -> dict[tuple[int | None, int | None, int], dict]:
    return {
        (spec["branch"], spec["col"], spec["tier"]): spec
        for spec in build_skill_node_specs(book)
    }


def _skill_spec_for_node(node: SkillNode) -> dict | None:
    return _skill_spec_map(node.book).get((node.branch, node.col, node.tier))


def _skill_node_is_unsynced(node: SkillNode, spec: dict | None = None) -> bool:
    resolved_spec = spec or _skill_spec_for_node(node)
    return bool(resolved_spec) and node.trigger_type is None and resolved_spec.get("trigger_type") is not None


def _resolved_skill_node_value(node: SkillNode, field: str):
    spec = _skill_spec_for_node(node) or {}
    current = getattr(node, field)
    if field == "default_name" and _skill_node_is_unsynced(node, spec):
        return current if current not in (None, "") else spec.get("default_name")
    if current is None or current == "":
        return spec.get(field)
    return current


def _resolved_skill_node_powers(node: SkillNode) -> dict[str, float]:
    """이름이 붙은 추가 위력. 행에 값이 없는 슬롯은 시드 기본값으로 채우고, 정의에 없는 키는 버린다."""
    spec = _skill_spec_for_node(node) or {}
    merged = {**(spec.get("powers") or {}), **(node.powers or {})}
    slot_keys = {slot["key"] for slot in skill_power_slots(_resolved_skill_node_value(node, "var_name"))}
    return {
        key: float(value)
        for key, value in merged.items()
        if key in slot_keys and key != "power" and value is not None
    }


def _skill_node_power_slots(node: SkillNode) -> list[SkillPowerSlot]:
    return [SkillPowerSlot(**slot) for slot in skill_power_slots(_resolved_skill_node_value(node, "var_name"))]


def _resolved_skill_node_name(node: SkillNode) -> str:
    return str(_resolved_skill_node_value(node, "default_name") or node.default_name)


def _romanize(value: int) -> str:
    numerals = (
        (1000, "M"),
        (900, "CM"),
        (500, "D"),
        (400, "CD"),
        (100, "C"),
        (90, "XC"),
        (50, "L"),
        (40, "XL"),
        (10, "X"),
        (9, "IX"),
        (5, "V"),
        (4, "IV"),
        (1, "I"),
    )
    remaining = max(0, int(value))
    if remaining <= 0:
        return ""
    pieces: list[str] = []
    for amount, glyph in numerals:
        while remaining >= amount:
            pieces.append(glyph)
            remaining -= amount
    return "".join(pieces)


def _strip_trailing_roman_suffix(name: str) -> str:
    stripped = name.strip()
    match = re.match(r"^(.*?)(?:\s+([IVXLCDM]+))?$", stripped)
    if not match:
        return stripped
    base, suffix = match.group(1), match.group(2)
    return base if suffix else stripped


def _format_skill_name_for_level(name: str, var_name: str | None, skill_lv: int) -> str:
    # 같은 이름이 여러 단계에 걸친 기술은 이름 자체에 단계 숫자가 붙는다(위해 I …).
    # 그런 이름에 등급 숫자까지 덧붙이면 "위해 I · I"가 되므로 이름을 그대로 쓴다.
    if var_name not in SKILL_LEVEL_SUFFIX_VAR_NAMES or skill_lv <= 0:
        return name
    if re.search(r"\s[IVXLCDM]+$", name):
        return name
    suffix = _romanize(skill_lv)
    return f"{name} {suffix}" if suffix else name


def _skill_display_name(node: SkillNode, *, skill_lv: int, custom_name: str | None = None) -> str:
    base_name = custom_name if custom_name else _resolved_skill_node_name(node)
    return _format_skill_name_for_level(base_name, _resolved_skill_node_value(node, "var_name"), skill_lv)


def _normalize_duplicate_skill_node_names(db: Session, *, book: str | None = None) -> bool:
    query = db.query(SkillNode).filter(SkillNode.tier > 0)
    if book is not None:
        query = query.filter(SkillNode.book == book)

    nodes = (
        query
        .order_by(
            SkillNode.book.asc(),
            SkillNode.tier.asc(),
            SkillNode.branch.asc(),
            SkillNode.col.asc(),
            SkillNode.id.asc(),
        )
        .all()
    )

    groups: dict[tuple[str, str], list[SkillNode]] = {}
    for node in nodes:
        base_name = _strip_trailing_roman_suffix(node.default_name)
        groups.setdefault((node.book, base_name), []).append(node)

    changed = False
    for (_book, base_name), same_name_nodes in groups.items():
        if len(same_name_nodes) <= 1:
            continue
        for node in same_name_nodes:
            normalized_name = f"{base_name} {_romanize(node.tier)}"
            if node.default_name != normalized_name:
                node.default_name = normalized_name
                changed = True

    return changed


def _korean_subject_particle(name: str) -> str:
    """이름의 마지막 한글 음절에 받침이 있으면 '이', 없으면 '가'를 반환한다."""
    if not name:
        return "가"
    code = ord(name[-1]) - 0xAC00
    return "이" if 0 <= code <= 0xD7A3 - 0xAC00 and code % 28 else "가"


def _snapshot_combatant(character: Character) -> dict:
    max_hp = max(_floor_amount(character.hp_max * (1 + character.hp_max_p)), character.hp, 1)
    return {
        "character_id": character.id,
        "name": character.name,
        "image_url": character.image_url,
        "faction": character.faction,
        "stat_courage": character.stat_courage,
        "stat_endurance": character.stat_endurance,
        "stat_charity": character.stat_charity,
        "stat_wisdom": character.stat_wisdom,
        "atk": character.atk, "atk_p": character.atk_p, "dmg_p": character.dmg_p,
        "skill_lv": character.skill_lv, "skill_eff_true": character.skill_eff_true,
        "skill_eff_fixed": character.skill_eff_fixed, "skill_cost": character.skill_cost,
        "def": character.def_, "def_p": character.def_p, "def_eff": character.def_eff, "dmg_r": character.dmg_r,
        "heal_eff": character.heal_eff, "skill_target": max(1, character.skill_target or 1),
        "over_heal": bool(character.over_heal),
        # 주목도(attn)는 캐릭터 고정 스탯이 아니라 전투 중 행동으로 쌓이는 값이다. 전투/난입 시작 시 0에서 출발한다.
        "attn": 0, "presence": character.presence, "lv": character.lv,
        "hp": min(character.hp, max_hp) if character.hp > 0 else max_hp,
        "max_hp": max_hp,
        "shield": (character.sh or 0) + (character.start_sh or 0),
        "mp": min(character.mp, character.mp_max), "max_mp": character.mp_max,
        "hp_regen_true": character.hp_regen_true, "hp_regen_fixed": character.hp_regen_fixed,
        "mp_regen": character.mp_regen,
        # 0은 "원래 파티원"을 뜻하는 센티널이다(라운드 번호는 1부터 시작하므로 절대 일치하지 않음).
        # 난입 캐릭터만 join_battle에서 실제 합류 라운드 번호로 덮어써 그 라운드에 한해 피격/치유 대상에서 제외된다.
        "downed": False, "retreated": False, "joined_round": 0,
        # 이번 라운드에 "방어"를 선택했는지와, 그렇다면 누구 대신 맞아줄지(기본값 본인). 매 아군 턴 시작 시 초기화된다.
        "defending": False, "protect_target": None,
        # 전투 보상 계산용: "무반응"이 아닌 행동을 실제로 선택한 라운드 수.
        "action_reward_rounds": 0,
        "action_reward_version": 2,
        # 챕터 환경 효과별 누적 스택. {environment_id(str): 스택 수}. 전투/난입 시작 시 0에서 출발한다.
        "env_stacks": {},
        # 환경 스택을 얻은 순서. 같은 environment_id를 스택 수만큼 보관한다.
        "env_stack_order": [],
        # 지속형/혼합형 기술에서 남긴 버프·디버프. [{"effect_type", "skill_name", ...}, ...]
        "status_effects": [],
    }


# ── 라운드 처리 공용 헬퍼 ──
def _combatant_active(p: dict) -> bool:
    return not p["downed"] and not p["retreated"]


def _just_joined(p: dict, round_no: int) -> bool:
    # 이번 라운드에 난입한 캐릭터는 그 라운드에 행동할 수 없고, 공격/치유 대상도 될 수 없다.
    return p["joined_round"] == round_no


def _combatant_targetable(p: dict, round_no: int) -> bool:
    return _combatant_active(p) and not _just_joined(p, round_no)


def _healable(p: dict, round_no: int) -> bool:
    # 치유 대상은 기절한 캐릭터도 포함한다(퇴각/난입 캐릭터만 제외).
    return not p["retreated"] and not _just_joined(p, round_no)


def _enemy_targetable(enemy: dict, round_no: int) -> bool:
    # 이번 라운드에 참가한 에너미는 다음 라운드부터 행동 및 피격 대상이 된다.
    return enemy["hp"] > 0 and enemy.get("joined_round", 0) != round_no


def _floor_amount(value: float) -> int:
    """최종 데미지/치유량 등은 소수점을 반올림하지 않고 내림(버림) 처리한다."""
    return math.floor(value) if value >= 0 else -math.ceil(-value)


def _eff_def(p: dict) -> int:
    return _floor_amount(p["def"] * (1 + p["def_p"]) * (1 + p["def_eff"]))


def _skill_coef(p: dict) -> float:
    return 1 + p["skill_lv"] * p["skill_eff_fixed"]


def _ensure_status_effects(target: dict) -> list[dict]:
    effects = target.get("status_effects")
    if isinstance(effects, list):
        return effects
    target["status_effects"] = []
    return target["status_effects"]


def _ensure_combatant_snapshot_defaults(p: dict) -> None:
    p.setdefault("stat_courage", 0)
    p.setdefault("stat_endurance", 0)
    p.setdefault("stat_charity", 0)
    p.setdefault("stat_wisdom", 0)
    p.setdefault("joined_round", 0)
    p.setdefault("defending", False)
    p.setdefault("protect_target", None)
    p.setdefault("action_reward_rounds", 0)
    p.setdefault("env_stacks", {})
    p.setdefault("env_stack_order", [])
    _ensure_status_effects(p)


def _legacy_join_reward_was_counted(session: BattleSession, participant: dict) -> bool:
    joined_round = int(participant.get("joined_round", 0) or 0)
    if joined_round <= 0:
        return False
    character_id = participant.get("character_id")
    return any(
        snapshot.get("round") == joined_round
        and snapshot.get("phase") == "ally"
        and any(
            value.get("character_id") == character_id
            for value in (snapshot.get("participants") or [])
        )
        for snapshot in (session.round_snapshots or [])
    )


def _meaningful_action_reward_rounds(participant: dict, session: BattleSession | None = None) -> int:
    """실제로 무반응 외 행동을 선택한 라운드 수를 반환한다.

    구버전은 난입 라운드를 행동 보상 1회로 잘못 더했으므로, 난입 캐릭터의 기존 수치에서
    그 1회를 제외한다. version 2부터는 실제 행동만 기록한다.
    """
    rounds = max(0, int(participant.get("action_reward_rounds", 0) or 0))
    version = max(1, int(participant.get("action_reward_version", 1) or 1))
    if version < 2 and session is not None and _legacy_join_reward_was_counted(session, participant):
        rounds = max(0, rounds - 1)
    return rounds


def _enemy_skill_is_aoe(skill: dict) -> bool:
    return skill.get("skill_type") == "광역 공격" and not skill.get("manual_target_count", False)


def _select_enemy_skill_targets(
    participants: list[dict],
    *,
    round_no: int,
    target_count: int,
    auto_target_mode: str,
) -> list[dict]:
    candidates = [participant for participant in participants if _combatant_targetable(participant, round_no)]
    count = min(max(1, target_count), len(candidates))
    if auto_target_mode == "random":
        return random.sample(candidates, count)
    return sorted(candidates, key=lambda target: -(target["attn"] + target["presence"]))[:count]


def _apply_environment_stack_delta(
    target: dict,
    *,
    environment_id: int,
    stack_delta: int,
    stackable: bool,
    max_stacks: int,
) -> tuple[int, int]:
    stacks = dict(target.get("env_stacks", {}))
    stack_order = _normalized_environment_stack_order(target)
    key = str(environment_id)
    previous_stacks = max(0, int(stacks.get(key, 0)))
    next_stacks = previous_stacks
    if stack_delta > 0 and (stackable or previous_stacks == 0):
        next_stacks = previous_stacks + stack_delta
        if max_stacks > 0:
            next_stacks = min(next_stacks, max_stacks)
    if next_stacks > 0:
        stacks[key] = next_stacks
    elif key in stacks:
        stacks.pop(key, None)
    gained = max(0, next_stacks - previous_stacks)
    if gained > 0:
        stack_order.extend([key] * gained)
    elif next_stacks <= 0:
        stack_order = [stack_key for stack_key in stack_order if stack_key != key]
    if stacks != target.get("env_stacks", {}):
        target["env_stacks"] = stacks
    if stack_order or target.get("env_stack_order"):
        target["env_stack_order"] = stack_order
    return previous_stacks, next_stacks


def _ensure_enemy_snapshot_defaults(enemy: dict) -> None:
    enemy.setdefault("joined_round", 0)
    _ensure_status_effects(enemy)


def _remove_non_stackable_status_effects(
    participants: list[dict],
    enemies: list[dict],
    *,
    source_character_id: int,
    var_name: str,
) -> None:
    for target in [*participants, *enemies]:
        effects = _ensure_status_effects(target)
        target["status_effects"] = [
            effect for effect in effects
            if not (
                effect.get("source_character_id") == source_character_id
                and effect.get("var_name") == var_name
            )
        ]


def _consume_purification_guard_stack(target: dict) -> bool:
    effects = _ensure_status_effects(target)
    next_effects: list[dict] = []
    consumed = False
    for effect in effects:
        if not consumed and effect.get("effect_type") == "purification_guard":
            stacks = max(0, int(effect.get("stacks", 0)))
            if stacks > 0:
                stacks -= 1
                consumed = True
                if stacks > 0:
                    updated = dict(effect)
                    updated["stacks"] = stacks
                    next_effects.append(updated)
                continue
        next_effects.append(effect)
    if consumed:
        target["status_effects"] = next_effects
    return consumed


def _add_status_effect(
    target: dict,
    effect: dict,
    *,
    participants: list[dict],
    enemies: list[dict],
) -> bool:
    if effect.get("affinity") == "debuff" and _consume_purification_guard_stack(target):
        return False
    source_character_id = effect.get("source_character_id")
    var_name = effect.get("var_name")
    if not effect.get("stackable") and isinstance(source_character_id, int) and isinstance(var_name, str):
        _remove_non_stackable_status_effects(
            participants,
            enemies,
            source_character_id=source_character_id,
            var_name=var_name,
        )
    _ensure_status_effects(target).append(effect)
    return True


def _remove_status_effects_by_affinity(target: dict, affinity: str, count: int) -> tuple[int, list[str]]:
    if count <= 0:
        return 0, []
    removed = 0
    removed_names: list[str] = []
    kept: list[dict] = []
    for effect in _ensure_status_effects(target):
        if removed < count and effect.get("affinity") == affinity:
            removed += 1
            if effect.get("effect_type") == "stat_modifier":
                stat = effect["stat"]
                target[stat] = target.get(stat, 0) - effect.get("applied_delta", 0)
            removed_names.append(effect.get("skill_name") or effect.get("var_name") or affinity)
            continue
        kept.append(effect)
    target["status_effects"] = kept
    return removed, removed_names


def _normalized_environment_stack_order(target: dict) -> list[str]:
    """환경 스택의 획득 순서를 보정한다. 순서 정보가 없는 기존 전투는 보유 dict 순서를 사용한다."""
    stacks = {
        str(key): max(0, int(value))
        for key, value in (target.get("env_stacks") or {}).items()
        if int(value) > 0
    }
    remaining = dict(stacks)
    normalized: list[str] = []
    for raw_key in target.get("env_stack_order") or []:
        key = str(raw_key)
        if remaining.get(key, 0) <= 0:
            continue
        normalized.append(key)
        remaining[key] -= 1
    for key in stacks:
        normalized.extend([key] * remaining[key])
    return normalized


def _remove_oldest_environment_stacks(db: Session, target: dict, count: int) -> tuple[int, list[str]]:
    if count <= 0:
        return 0, []
    stacks = {
        str(key): max(0, int(value))
        for key, value in (target.get("env_stacks") or {}).items()
        if int(value) > 0
    }
    if not stacks:
        return 0, []

    environments = db.query(Environment).filter(
        Environment.id.in_([int(key) for key in stacks]),
        Environment.dispellable.is_(True),
    ).all()
    removable_by_key = {str(environment.id): environment for environment in environments}
    removed_names: list[str] = []
    kept_order: list[str] = []
    for key in _normalized_environment_stack_order(target):
        environment = removable_by_key.get(key)
        if len(removed_names) < count and environment is not None and stacks.get(key, 0) > 0:
            stacks[key] -= 1
            removed_names.append(environment.name)
            continue
        kept_order.append(key)

    target["env_stacks"] = {key: value for key, value in stacks.items() if value > 0}
    target["env_stack_order"] = kept_order
    return len(removed_names), removed_names


def _format_cleansed_names(names: list[str]) -> str:
    """해제한 약화 이름을 묶어 "늪의 저주 × 2, 위해"처럼 표기한다."""
    counts: dict[str, int] = {}
    for name in names:
        counts[name] = counts.get(name, 0) + 1
    return ", ".join(name if count == 1 else f"{name} × {count}" for name, count in counts.items())


def _cleanse_combat_debuffs(db: Session, target: dict, count: int) -> tuple[int, list[str]]:
    removed, names = _remove_status_effects_by_affinity(target, "debuff", count)
    if removed < count:
        environment_removed, environment_names = _remove_oldest_environment_stacks(db, target, count - removed)
        removed += environment_removed
        names.extend(environment_names)
    return removed, names


def _add_combat_stat_stack(target: dict, *, source: str, name: str, stat: str, amount: float, percent: bool, stackable: bool, debuff: bool = True) -> bool:
    effects = list(_ensure_status_effects(target))
    matching = [effect for effect in effects if effect.get("stack_source") == source]
    if matching and not stackable:
        return False
    if debuff and _consume_purification_guard_stack(target):
        return False
    effects = list(_ensure_status_effects(target))
    current = target.get(stat, 0)
    # 같은 능력치에 걸린 효과를 역산해 원래 값 기준으로 퍼센트 스택을 더한다.
    base = current - sum(effect.get("applied_delta", 0) for effect in effects if effect.get("effect_type") == "stat_modifier" and effect.get("stat") == stat)
    delta = abs(base) * amount / 100 if percent else amount
    if isinstance(current, int):
        delta = _floor_amount(delta)
    delta = -delta if debuff else delta
    if debuff:
        delta = max(-current, delta)
    target[stat] = current + delta
    target["status_effects"] = effects + [{
        "effect_type": "stat_modifier", "affinity": "debuff" if debuff else "buff", "skill_name": name,
        "stack_source": source, "stat": stat, "applied_delta": delta, "stackable": stackable, "stacks": 1,
    }]
    return True


def _apply_minion_phase(participants: list[dict], enemies: list[dict], summons: list[dict], round_no: int, phase: str, events: list[str]) -> None:
    for minion in summons:
        kind = minion.get("action_type", "attack")
        if minion["hp"] <= 0 or kind == "attack" or minion.get("trigger_phase") != phase or minion.get("trigger_round", round_no) > round_no or minion.get("last_trigger_round") == round_no:
            continue
        name = _summon_log_name(minion)
        if kind == "buff":
            target = next((enemy for enemy in enemies if enemy["enemy_id"] == minion.get("buff_enemy_id") and enemy["hp"] > 0), None)
            if target:
                stat = "attack" if minion.get("buff_stat", "attack") == "attack" else "damage_bonus"
                target.setdefault(stat, 0.0)
                amount = minion.get("effect_percent", 0)
                _add_combat_stat_stack(target, source=f"minion:{minion.get('spawn_round', 0)}:{minion['id']}", name=name, stat=stat,
                                      amount=amount if stat == "attack" else amount / 100,
                                      percent=stat == "attack", stackable=True, debuff=False)
                events.append(f"👹 하수인 {name} 강화 → {target['name']} {'공격력' if stat == 'attack' else '피해량'} +{amount}%")
        else:
            for target in participants:
                if not _combatant_targetable(target, round_no):
                    continue
                if kind == "debuff":
                    stat = minion.get("effect_stat", "atk")
                    amount = minion.get("effect_percent", 0)
                    applied = _add_combat_stat_stack(target, source=f"minion:{minion.get('spawn_round', 0)}:{minion['id']}", name=name, stat=stat, amount=amount, percent=True, stackable=True)
                    events.append(f"👹 하수인 {name} 약화 → {target['name']} {BATTLE_ITEM_EFFECT_LABELS.get(stat, stat)} -{amount}%{' (방지)' if not applied else ''}")
                elif kind == "explosion":
                    raw = max(0, minion["attack"] - (_eff_def(target) if target.get("defending") else 0))
                    damage = max(0, _floor_amount(raw * (1 - target.get("dmg_r", 0))))
                    damage, absorbed = _apply_hit(target, damage)
                    events.append(f"💥 하수인 {name} 폭발 → {target['name']} {damage} 피해 [{target['hp']}/{target['max_hp']}]")
                    if target["hp"] <= 0:
                        target["downed"] = True
        minion["last_trigger_round"] = round_no
        if kind == "explosion":
            minion["hp"] = 0
            events.append(f"👹 하수인 {name} 폭발 후 소멸")


def _consume_one_time_outgoing_damage_bonus(actor: dict) -> float:
    consumed = 0.0
    kept: list[dict] = []
    for effect in _ensure_status_effects(actor):
        if effect.get("effect_type") == "outgoing_damage_bonus_once":
            consumed += float(effect.get("value", 0.0))
            continue
        kept.append(effect)
    actor["status_effects"] = kept
    return consumed


def _persistent_outgoing_damage_bonus(actor: dict) -> float:
    bonus = 0.0
    for effect in _ensure_status_effects(actor):
        effect_type = effect.get("effect_type")
        if effect_type == "outgoing_damage_bonus":
            bonus += float(effect.get("value", 0.0))
        elif effect_type == "purification_guard":
            stacks = max(0, int(effect.get("stacks", 0)))
            bonus += stacks * float(effect.get("damage_bonus_per_stack", 0.05))
    return bonus


def _consume_outgoing_damage_amplification(actor: dict) -> float:
    return (
        float(actor["dmg_p"])
        + _persistent_outgoing_damage_bonus(actor)
        + _consume_one_time_outgoing_damage_bonus(actor)
    )


def _consume_one_time_outgoing_damage_penalty(actor: dict) -> float:
    consumed = 0.0
    kept: list[dict] = []
    for effect in _ensure_status_effects(actor):
        if effect.get("effect_type") == "outgoing_damage_penalty_once":
            consumed += float(effect.get("value", 0.0))
            continue
        kept.append(effect)
    actor["status_effects"] = kept
    return consumed


def _counter_effects_for_target(target: dict) -> list[dict]:
    return [
        effect
        for effect in _ensure_status_effects(target)
        if effect.get("effect_type") == "counter"
    ]


def _battle_skill_cost(actor: dict, skill: dict) -> int:
    return max(0, _floor_amount(float(skill.get("cost") or 0) + actor["skill_cost"]))


def _formula_number(value: int | float) -> str:
    return f"{value:g}" if isinstance(value, float) else str(value)


def _signed_number(value: int | float) -> str:
    return f"{value:+g}" if isinstance(value, float) else f"{value:+d}"


def _damage_from_skill_power(actor: dict, skill_power: float, skill_eff_fixed: float) -> tuple[int, str]:
    damage_amp = _consume_outgoing_damage_amplification(actor)
    raw = (
        actor["atk"]
        * (1 + actor["atk_p"])
        * (skill_power * (1 + skill_eff_fixed))
        * (1 + damage_amp)
        + actor["skill_eff_true"]
    )
    formula = (
        f"floor(공격력 {_formula_number(actor['atk'])} × "
        f"(1 + 공격력 증폭률 {_formula_number(actor['atk_p'])}) × "
        f"(기술 위력 {_formula_number(skill_power)} × "
        f"(1 + 기술 효율 비례 {_formula_number(skill_eff_fixed)})) × "
        f"(1 + 피해 증폭 {_formula_number(damage_amp)}) + "
        f"기술 효율 고정 {_formula_number(actor['skill_eff_true'])})"
    )
    return max(0, _floor_amount(raw)), formula


def _apply_damage_attn(actor: dict, damage: int) -> None:
    attn_mult = 4 if actor["faction"] == "수비" else 1
    actor["attn"] += _floor_amount(damage * attn_mult * (1 + actor["presence"]))


def _apply_heal_attn(actor: dict, healed: float) -> None:
    actor["attn"] += _floor_amount(healed * 2 * (1 + actor["presence"]))


def _apply_multi_heal_attn(actor: dict, healed_values: list[int]) -> None:
    """여러 명을 치유하면 통합 회복값을 회복 받은 인원으로 나눈 값이 주목도 계산의 최종 회복값이 된다."""
    healed_values = [value for value in healed_values if value > 0]
    if healed_values:
        _apply_heal_attn(actor, sum(healed_values) / len(healed_values))


def _skill_heal_amount(
    actor: dict,
    target: dict,
    skill_power: float,
    skill_eff_fixed: float,
    *,
    include_heal_efficiency: bool = True,
) -> tuple[int, str]:
    """기술 치유량과 계산식을 만든다. 피해 계산과 같이 기술 위력 비례를 곱한 뒤 기술 효율 고정을 더한다."""
    heal_eff = actor["heal_eff"] if include_heal_efficiency else 0
    raw = target["max_hp"] * ((skill_power * (1 + skill_eff_fixed)) * (1 + heal_eff)) + actor["skill_eff_true"]
    # 치유 효율을 아예 적용하지 않는 기술(모루 등)만 계산식에서도 해당 항을 뺀다.
    heal_eff_term = f" × (1 + 치유 효율 {_formula_number(heal_eff)})" if include_heal_efficiency else ""
    formula = (
        f"floor(최대 체력 {_formula_number(target['max_hp'])} × "
        f"(기술 위력 {_formula_number(skill_power)} × "
        f"(1 + 기술 효율 비례 {_formula_number(skill_eff_fixed)}))"
        f"{heal_eff_term} + "
        f"기술 효율 고정 {_formula_number(actor['skill_eff_true'])})"
    )
    return max(0, _floor_amount(raw)), formula


def _apply_skill_heal(
    actor: dict,
    target: dict,
    heal_amount: int,
    *,
    allow_overheal: bool = False,
    grant_attention: bool = True,
) -> tuple[int, bool]:
    before = target["hp"]
    next_hp = target["hp"] + heal_amount
    if not allow_overheal and not target.get("over_heal"):
        next_hp = min(next_hp, target["max_hp"])
    target["hp"] = next_hp
    healed = target["hp"] - before
    revived = bool(target.get("downed")) and target["hp"] > 0
    if revived:
        target["downed"] = False
    if grant_attention:
        _apply_heal_attn(actor, healed)
    return healed, revived


def _skill_heal_formula(target: dict, heal_formula: str, before_hp: int, *, allow_overheal: bool = False) -> str:
    if allow_overheal or target.get("over_heal"):
        return heal_formula
    return f"min({heal_formula}, 잃은 체력 {_formula_number(target['max_hp'] - before_hp)})"


def _apply_damage_to_enemy(enemy: dict, damage: int) -> tuple[int, bool]:
    dealt = min(damage, enemy["hp"])
    overkill = damage > enemy["hp"]
    enemy["hp"] = max(0, enemy["hp"] - damage)
    return dealt, overkill


def _explicit_skill_targets(keys: list[str], candidates: dict, count: int) -> list:
    if len(keys) != len(set(keys)) or len(keys) != min(count, len(candidates)):
        raise HTTPException(status_code=400, detail=f"기술 적용 대상을 {min(count, len(candidates))}명 선택해 주세요.")
    if any(key not in candidates for key in keys):
        raise HTTPException(status_code=400, detail="선택한 기술 대상에게 적용할 수 없습니다.")
    return [candidates[key] for key in keys]


def _skill_power_value(skill: dict, key: str, default: float = 0.0) -> float:
    """이름이 붙은 추가 기술 위력(예: 반격의 반격 피해)을 읽는다."""
    try:
        return float((skill.get("powers") or {}).get(key, default))
    except (TypeError, ValueError):
        return default


def _skill_target_count(skill: dict) -> int:
    """기술 적용 인원은 기술 노드의 '기술 대상'(SELF 또는 1 이상의 정수)만 따른다."""
    target = str(skill.get("target") or "").strip().upper()
    if target.isdigit():
        return max(1, int(target))
    return 1


def _skill_has_tier6_bonus(skill: dict) -> bool:
    return int(skill.get("tier") or 0) >= 6


def _skill_lv_from_tier(skill: dict) -> int:
    """기술의 발동 강도(skill_lv)는 기술트리 depth에서 도출된다: 루트(1단계)만 있으면 0, 다음 depth를 하나 더 활성화할 때마다 1씩 오른다."""
    return max(0, int(skill.get("tier") or 1) - 1)


def _battle_skill_name(skill: dict) -> str:
    return _format_skill_name_for_level(
        str(skill.get("display_name") or skill.get("default_name") or "기술"),
        skill.get("var_name"),
        _skill_lv_from_tier(skill),
    )


def _apply_ongoing_telegraph_skill_effects(
    enemies: list[dict],
    events: list[str],
    calculations: dict[str, str | list[str]],
) -> None:
    for enemy in enemies:
        if enemy["hp"] <= 0:
            continue
        # 같은 시전자가 같은 기술을 여러 번 걸었으면 한 줄로 합치고, 계산식에 각 피해량을 보여준다.
        grouped: dict[tuple[object, str, str], list[int]] = {}
        for effect in list(_ensure_status_effects(enemy)):
            if effect.get("effect_type") != "ongoing_damage" or effect.get("trigger_phase") != "telegraph":
                continue
            damage = max(0, int(effect.get("damage", 0)))
            if damage <= 0:
                continue
            key = (
                effect.get("source_character_id"),
                str(effect.get("source_name") or "알 수 없는 시전자"),
                str(effect.get("skill_name") or "지속 효과"),
            )
            grouped.setdefault(key, []).append(damage)
        for (_source_id, source_name, skill_name), damages in grouped.items():
            dealt, overkill = _apply_damage_to_enemy(enemy, sum(damages))
            events.append(
                f"☠️ {source_name}의 {skill_name} → "
                f"{enemy['name']}에게 {dealt} 지속 피해 · [{enemy['hp']}/{enemy['max_hp']}]"
                f"{' (오버킬)' if overkill else ''}"
            )
            total_formula = " + ".join(str(damage) for damage in damages)
            if overkill:
                calculations[events[-1]] = f"min({total_formula}, 남은 체력 {enemy['hp'] + dealt})"
            elif len(damages) > 1:
                calculations[events[-1]] = f"({total_formula})"
            if enemy["hp"] <= 0:
                events.append(f"💀 {enemy['name']} 격파")
                break


def _assign_summon_log_numbers(summons: list[dict]) -> None:
    # 이전에 생성된 전투 데이터에도 같은 이름의 하수인이 여럿이면 안정적인 번호를 부여한다.
    summons_by_name: dict[str, list[dict]] = {}
    for summon in summons:
        summons_by_name.setdefault(summon["name"], []).append(summon)
    for same_name_summons in summons_by_name.values():
        if len(same_name_summons) <= 1:
            continue
        used_numbers = {
            summon["log_number"]
            for summon in same_name_summons
            if isinstance(summon.get("log_number"), int)
        }
        next_number = 1
        for summon in sorted(same_name_summons, key=lambda value: value["id"]):
            if isinstance(summon.get("log_number"), int):
                continue
            while next_number in used_numbers:
                next_number += 1
            summon["log_number"] = next_number
            used_numbers.add(next_number)


def _summon_log_name(summon: dict) -> str:
    number = summon.get("log_number")
    return f"{summon['name']}{number}" if isinstance(number, int) else summon["name"]


def _apply_hit(recipient: dict, dmg: int) -> tuple[int, int]:
    """보호막 흡수 후 HP를 깎는다. (실제 감소된 dmg, 흡수량)을 반환한다."""
    absorbed = min(recipient["shield"], dmg)
    recipient["shield"] -= absorbed
    dmg -= absorbed
    recipient["hp"] = max(0, recipient["hp"] - dmg)
    return dmg, absorbed


def _build_protect_map(participants: list[dict]) -> dict[int, int]:
    """{보호받는 캐릭터ID: 대신 맞아줄 방어자ID}. 자기 자신을 보호 대상으로 고른 경우는 제외한다."""
    protect_map: dict[int, int] = {}
    for p in participants:
        if not p.get("defending"):
            continue
        target_id = p.get("protect_target")
        if target_id is None or target_id == p["character_id"]:
            continue
        protect_map.setdefault(target_id, p["character_id"])
    return protect_map


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
        "skills": _normalized_enemy_skill_payloads(enemy.skills),
        "joined_round": 0,
        "status_effects": [],
    }


def _apply_item_effects_to_snapshot(db: Session, p: dict, effects: list[dict], sign: int) -> tuple[list[str], list[str]]:
    """전투 중 아이템 사용 시 참가자 스냅샷에 효과를 적용한다.
    (로그에 덧붙일 부가 설명, 실제로 적용된 스탯 변화량 문구) 튜플을 반환한다."""
    notes: list[str] = []
    deltas: list[str] = []
    for effect in effects:
        stat = effect["stat"]
        if stat == "hp_heal_p":
            before_hp = p["hp"]
            delta_hp = p["max_hp"] * effect["delta"] * sign
            next_hp = _floor_amount(p["hp"] + delta_hp)
            if not p["over_heal"]:
                next_hp = min(next_hp, p["max_hp"])
            p["hp"] = next_hp
            applied = p["hp"] - before_hp
            if applied != 0:
                deltas.append(f"{BATTLE_ITEM_EFFECT_LABELS['hp_heal_p']} {_signed_number(applied)}")
            continue
        if stat == "cleanse_debuffs":
            if sign > 0:
                total = len(_ensure_status_effects(p)) + sum(p.get("env_stacks", {}).values())
                _, cleared_names = _cleanse_combat_debuffs(db, p, total)
                if cleared_names:
                    notes.append(f"{_format_cleansed_names(cleared_names)} 약화 해제!")
            continue
        key = BATTLE_ITEM_EFFECT_KEYS.get(stat)
        if key is None or stat not in ITEM_EFFECT_STAT_TYPES:
            continue
        value_type = ITEM_EFFECT_STAT_TYPES[stat]
        delta = effect["delta"] * sign
        current = p[key]
        next_value = _floor_amount(current + delta) if value_type is int else float(current + delta)
        if key == "hp" and not p["over_heal"]:
            next_value = min(next_value, p["max_hp"])
        p[key] = next_value
        applied = p[key] - current
        if applied != 0:
            label = BATTLE_ITEM_EFFECT_LABELS.get(stat, stat)
            deltas.append(f"{label} {_signed_number(applied)}")
    return notes, deltas


def _query_active_battle_skills_by_character(db: Session, character_ids: list[int]) -> dict[int, dict[int, dict]]:
    if not character_ids:
        return {}

    for book in SKILL_BOOK_ORDER:
        _seed_skill_tree_if_empty(db, book)

    skill_levels = dict(
        db.query(Character.id, Character.skill_lv)
        .filter(Character.id.in_(character_ids))
        .all()
    )
    rows = (
        db.query(CharacterSkillUnlock, SkillNode)
        .join(SkillNode, CharacterSkillUnlock.node_id == SkillNode.id)
        .filter(
            CharacterSkillUnlock.character_id.in_(character_ids),
            SkillNode.tier > 0,
            SkillNode.is_public.is_(True),
        )
        .all()
    )

    best_by_character_and_book: dict[tuple[int, str], tuple[CharacterSkillUnlock, SkillNode]] = {}
    for unlock, node in rows:
        key = (unlock.character_id, node.book)
        current = best_by_character_and_book.get(key)
        if current is None:
            best_by_character_and_book[key] = (unlock, node)
            continue
        current_unlock, current_node = current
        if node.tier > current_node.tier or (
            node.tier == current_node.tier and unlock.unlocked_at > current_unlock.unlocked_at
        ):
            best_by_character_and_book[key] = (unlock, node)

    by_character: dict[int, dict[int, dict]] = {character_id: {} for character_id in character_ids}
    for (character_id, _book), (unlock, node) in best_by_character_and_book.items():
        by_character.setdefault(character_id, {})[node.id] = {
            "id": node.id,
            "book": node.book,
            "tier": node.tier,
            "default_name": _resolved_skill_node_name(node),
            "display_name": _skill_display_name(
                node,
                skill_lv=skill_levels.get(character_id, 0),
                custom_name=unlock.custom_name,
            ),
            "image_url": unlock.custom_image_url or node.image_url,
            "trigger_type": _resolved_skill_node_value(node, "trigger_type"),
            "category": _resolved_skill_node_value(node, "category"),
            "stackable": _resolved_skill_node_value(node, "stackable"),
            "cost": _resolved_skill_node_value(node, "cost"),
            "power": _resolved_skill_node_value(node, "power"),
            "powers": _resolved_skill_node_powers(node),
            "target": _resolved_skill_node_value(node, "target"),
            "target_side": _resolved_skill_node_value(node, "target_side"),
            "activation_order": _resolved_skill_node_value(node, "activation_order"),
            "cleanse_count": _resolved_skill_node_value(node, "cleanse_count"),
            "formula": _resolved_skill_node_value(node, "formula"),
            "description": _resolved_skill_node_value(node, "description"),
            "var_name": _resolved_skill_node_value(node, "var_name"),
        }
    return by_character


# 관리자 전투 화면은 참가자마다 4개 기술 트리를 따로 읽지 않고, 이 배치 조회 결과를
# 짧게 공유한다. 전투 계산은 아래 캐시를 거치지 않아 기술 수정값을 즉시 반영한다.
_ACTIVE_BATTLE_SKILLS_CACHE_TTL_SECONDS = 60.0
_active_battle_skills_cache: dict[tuple[int, ...], tuple[float, dict[int, dict[int, dict]]]] = {}
_active_battle_skills_cache_lock = threading.RLock()


def invalidate_active_battle_skills_cache(character_ids: list[int] | None = None) -> None:
    with _active_battle_skills_cache_lock:
        if character_ids is None:
            _active_battle_skills_cache.clear()
            return
        changed = set(character_ids)
        for key in list(_active_battle_skills_cache):
            if changed.intersection(key):
                _active_battle_skills_cache.pop(key, None)


def _get_cached_active_battle_skills_by_character(
    db: Session,
    character_ids: list[int],
) -> dict[int, dict[int, dict]]:
    key = tuple(sorted(set(character_ids)))
    if not key:
        return {}
    now = time.monotonic()
    # 잠금 안에서 최초 조회까지 끝내 동시에 열린 관리자 화면이 같은 DB 조회를
    # 중복 실행하는 캐시 스탬피드도 막는다.
    with _active_battle_skills_cache_lock:
        for cached_key, (expires_at, _cached_value) in list(_active_battle_skills_cache.items()):
            if now >= expires_at:
                _active_battle_skills_cache.pop(cached_key, None)
        cached = _active_battle_skills_cache.get(key)
        if cached is not None and now < cached[0]:
            return copy.deepcopy(cached[1])
        result = _query_active_battle_skills_by_character(db, list(key))
        _active_battle_skills_cache[key] = (
            time.monotonic() + _ACTIVE_BATTLE_SKILLS_CACHE_TTL_SECONDS,
            copy.deepcopy(result),
        )
        return result


def get_battle_active_skills(db: Session, session_id: int) -> dict:
    participants = db.query(BattleSession.participants).filter(BattleSession.id == session_id).scalar()
    if participants is None:
        raise HTTPException(status_code=404, detail="전투를 찾을 수 없습니다.")
    character_ids = [
        int(participant["character_id"])
        for participant in (participants or [])
        if participant.get("character_id") is not None
    ]
    by_character = _get_cached_active_battle_skills_by_character(db, character_ids)
    book_order = {book: index for index, book in enumerate(SKILL_BOOK_ORDER)}
    return {
        "skills_by_character": {
            character_id: sorted(
                skills.values(),
                key=lambda skill: (book_order.get(skill["book"], len(book_order)), skill["id"]),
            )
            for character_id, skills in by_character.items()
        }
    }


def _empty_battle_log_metrics() -> dict[str, int]:
    return {
        "ally_skill_damage": 0,
        "ally_basic_damage": 0,
        "ally_healing": 0,
        "enemy_damage": 0,
    }


def _battle_event_amount(event: str, suffix: str) -> int:
    match = re.search(rf"(\d[\d,]*)\s+{suffix}", event)
    return int(match.group(1).replace(",", "")) if match else 0


def _battle_environment_damage_amount(event: str) -> int:
    if not event.startswith("　→"):
        return 0
    match = re.search(r"·\s*피해\s+(\d[\d,]*)\s+\[", event)
    return int(match.group(1).replace(",", "")) if match else 0


def _battle_log_entry_metrics(entry: dict) -> dict[str, int]:
    """이전에 저장된 전투도 통계를 볼 수 있도록 행동 로그의 결과값만 분류한다.

    적과 하수인의 공격뿐 아니라 환경으로 실제 적용된 피해도 적 피해량에 포함한다.
    """
    metrics = _empty_battle_log_metrics()
    phase = entry.get("phase")
    for raw_event in entry.get("events") or []:
        event = str(raw_event)
        metrics["enemy_damage"] += _battle_environment_damage_amount(event)
        healing = _battle_event_amount(event, "치유")
        if phase == "ally" and healing > 0:
            metrics["ally_healing"] += healing

        damage = _battle_event_amount(event, r"(?:지속 |반격 )?피해")
        if damage <= 0:
            continue

        if event.startswith(("✨", "🌊", "☠️")):
            metrics["ally_skill_damage"] += damage
        elif event.startswith("↩️"):
            metrics["ally_skill_damage"] += damage
        elif phase == "ally" and event.startswith("⚔️"):
            action_label = event.split(":", 1)[0]
            if "의 " not in action_label:
                metrics["ally_basic_damage"] += damage
            else:
                metrics["ally_skill_damage"] += damage
        elif event.startswith(("🔥", "💥")) or (
            event.startswith("👹 하수인") and "공격 →" in event
        ):
            metrics["enemy_damage"] += damage
    return metrics


def _battle_log_with_metrics(log: list | None) -> list[dict]:
    return [
        {**dict(entry), "metrics": _battle_log_entry_metrics(dict(entry))}
        for entry in (log or [])
    ]


def _to_battle_session_read(db: Session, session: BattleSession) -> BattleSessionRead:
    environments = {str(env.id): env for env in db.query(Environment).filter(Environment.chapter == session.chapter).all()} if session.chapter else {}
    enemies = _normalized_battle_enemies(session.enemies)
    participants = [{**participant, "environment_stacks": [
        {"id": int(env_id), "name": environments[env_id].name if env_id in environments else "환경",
         "color": environments[env_id].color if env_id in environments else "#e879f9", "count": count}
        for env_id, count in participant.get("env_stacks", {}).items() if count > 0
    ]} for participant in session.participants]
    return BattleSessionRead(
        id=session.id,
        mode=session.mode,
        chapter=session.chapter,
        status=session.status,
        round=session.round,
        phase=session.phase,
        pending_enemy_actions=session.pending_enemy_actions,
        enemies=enemies,
        summons=session.summons,
        participants=participants,
        log=_battle_log_with_metrics(session.log),
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


_BATTLE_PUBLIC_COLUMNS = (
    BattleSession.id,
    BattleSession.mode,
    BattleSession.chapter,
    BattleSession.status,
    BattleSession.round,
    BattleSession.phase,
    BattleSession.pending_enemy_actions,
    BattleSession.enemies,
    BattleSession.summons,
    BattleSession.participants,
    BattleSession.log,
    BattleSession.created_at,
    BattleSession.updated_at,
)


def _get_battle_for_update(db: Session, session_id: int) -> BattleSession | None:
    """전투 변경 요청을 직렬화해 같은 턴의 중복 실행과 JSON 상태 덮어쓰기를 막는다."""
    return (
        db.query(BattleSession)
        .filter(BattleSession.id == session_id)
        .with_for_update()
        .first()
    )


def _commit_battle_session(db: Session, session: BattleSession) -> BattleSessionRead:
    """공개 응답을 flush 직후 만들고 커밋해, 커지는 비공개 롤백 JSON의 재조회까지 피한다."""
    db.flush()
    result = _to_battle_session_read(db, session)
    db.commit()
    return result


def _new_battle_rollback_state() -> dict:
    return {
        "version": 1,
        "battle_characters": {},
        "reward_characters": {},
        "item_usages": [],
    }


def _get_battle_rollback_state(session: BattleSession) -> dict:
    raw = session.rollback_state if isinstance(session.rollback_state, dict) else {}
    if raw.get("version") != 1:
        return {"version": raw.get("version", 0)}
    return {
        "version": 1,
        "battle_characters": dict(raw.get("battle_characters") or {}),
        "reward_characters": dict(raw.get("reward_characters") or {}),
        "item_usages": list(raw.get("item_usages") or []),
    }


def _remember_battle_character_state(state: dict, character: Character) -> dict:
    battle_characters = dict(state.get("battle_characters") or {})
    battle_characters.setdefault(
        str(character.id),
        {
            "hp": character.hp,
            "mp": character.mp,
        },
    )
    return {**state, "battle_characters": battle_characters}


def _remember_reward_character_state(state: dict, character: Character) -> dict:
    reward_characters = dict(state.get("reward_characters") or {})
    reward_characters.setdefault(
        str(character.id),
        {
            "gold": character.gold,
            "exp": character.exp,
            "lv": character.lv,
            "ap": character.ap,
        },
    )
    return {**state, "reward_characters": reward_characters}


def _revert_item_usages(db: Session, item_usages: list[dict]) -> None:
    """item_usages 항목들(전투 롤백/턴 되돌리기 공용)만큼 CharacterItemState.used_quantity를 되돌리고,
    영구 이력인 ItemUsage 행도 함께 삭제한다."""
    usage_totals: dict[tuple[int, int], int] = {}
    usage_row_ids: list[int] = []
    for entry in item_usages:
        item_usage_id = entry.get("item_usage_id")
        character_id = entry.get("character_id")
        item_id = entry.get("item_id")
        quantity = int(entry.get("quantity", 0) or 0)
        if item_usage_id is not None:
            usage_row_ids.append(int(item_usage_id))
        if character_id is None or item_id is None or quantity <= 0:
            continue
        key = (int(character_id), int(item_id))
        usage_totals[key] = usage_totals.get(key, 0) + quantity

    if usage_totals:
        character_id_filters = sorted({character_id for character_id, _item_id in usage_totals})
        item_id_filters = sorted({item_id for _character_id, item_id in usage_totals})
        item_states = {
            (state.character_id, state.item_id): state
            for state in db.query(CharacterItemState).filter(
                CharacterItemState.character_id.in_(character_id_filters),
                CharacterItemState.item_id.in_(item_id_filters),
            ).all()
        }
        for key, quantity in usage_totals.items():
            item_state = item_states.get(key)
            if item_state is None:
                continue
            item_state.used_quantity = max(0, item_state.used_quantity - quantity)

    if usage_row_ids:
        db.query(ItemUsage).filter(ItemUsage.id.in_(usage_row_ids)).delete(synchronize_session=False)


def _remember_item_usage(state: dict, usage: ItemUsage) -> dict:
    item_usages = list(state.get("item_usages") or [])
    item_usages.append(
        {
            "item_usage_id": usage.id,
            "character_id": usage.character_id,
            "item_id": usage.item_id,
            "quantity": usage.quantity,
        }
    )
    return {**state, "item_usages": item_usages}


def start_battle(db: Session, member: Member, data: BattleStartRequest) -> BattleSessionRead:
    characters = db.query(Character).filter(Character.id.in_(data.character_ids)).all()
    if len(characters) != len(set(data.character_ids)):
        raise HTTPException(status_code=400, detail="존재하지 않는 캐릭터가 포함되어 있습니다.")
    enemies_db = db.query(Enemy).filter(Enemy.id.in_(data.enemy_ids)).all()
    if len(enemies_db) != len(set(data.enemy_ids)):
        raise HTTPException(status_code=400, detail="존재하지 않는 에너미가 포함되어 있습니다.")
    rollback_state = _new_battle_rollback_state()
    if data.mode == "real":
        for character in characters:
            rollback_state = _remember_battle_character_state(rollback_state, character)

    session = BattleSession(
        mode=data.mode,
        chapter=enemies_db[0].chapter,
        status="in_progress",
        round=1,
        enemies=[_snapshot_enemy(e, characters) for e in enemies_db],
        summons=[],
        participants=[_snapshot_combatant(c) for c in characters],
        log=[],
        rollback_state=rollback_state,
        created_by=member.id,
    )
    db.add(session)
    return _commit_battle_session(db, session)


def get_battle_session(db: Session, session_id: int, member: Member) -> BattleSessionRead:
    session = (
        db.query(BattleSession)
        .options(load_only(*_BATTLE_PUBLIC_COLUMNS))
        .filter(BattleSession.id == session_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="전투를 찾을 수 없습니다.")
    # 러너는 실전(real) 전투만 관전할 수 있다. 연습 전투는 관리자 전용이다.
    if not is_admin_role(member.role) and session.mode != "real":
        raise HTTPException(status_code=403, detail="열람 권한이 없습니다.")
    return _to_battle_session_read(db, session)


def get_live_real_battle(
    db: Session,
    known_session_id: int | None = None,
    known_updated_at: datetime | None = None,
) -> tuple[BattleSessionRead | None, bool]:
    """러너 관전용: 진행 중인 실전 전투 중 가장 최근 것을 반환한다(없으면 None)."""
    metadata = (
        db.query(BattleSession.id, BattleSession.updated_at)
        .filter(BattleSession.mode == "real", BattleSession.status == "in_progress")
        .order_by(BattleSession.id.desc())
        .first()
    )
    if metadata is None:
        return None, False

    if known_session_id == metadata.id and known_updated_at is not None:
        stored_updated_at = metadata.updated_at
        if stored_updated_at.tzinfo is None:
            stored_updated_at = stored_updated_at.replace(tzinfo=KST)
        if known_updated_at.tzinfo is None:
            known_updated_at = known_updated_at.replace(tzinfo=KST)
        if stored_updated_at.astimezone(timezone.utc) == known_updated_at.astimezone(timezone.utc):
            return None, True

    session = (
        db.query(BattleSession)
        .options(load_only(*_BATTLE_PUBLIC_COLUMNS))
        .filter(BattleSession.id == metadata.id)
        .first()
    )
    return (_to_battle_session_read(db, session) if session else None), False


def get_battle_sessions(
    db: Session,
    mode: str | None = None,
    status: str | None = None,
) -> list[BattleSessionSummary]:
    query = db.query(
        BattleSession.id,
        BattleSession.mode,
        BattleSession.chapter,
        BattleSession.status,
        BattleSession.round,
        BattleSession.enemies,
        BattleSession.created_at,
        BattleSession.updated_at,
    )
    if mode is not None:
        query = query.filter(BattleSession.mode == mode)
    if status is not None:
        query = query.filter(BattleSession.status == status)
    rows = query.order_by(BattleSession.id.desc()).all()
    session_ids = [r.id for r in rows]
    rewarded_session_ids = (
        {sid for sid, in db.query(Reward.source_id).filter(Reward.type == "battle", Reward.source_id.in_(session_ids)).distinct()}
        if session_ids else set()
    )
    return [
        BattleSessionSummary(
            id=r.id,
            mode=r.mode,
            chapter=r.chapter,
            status=r.status,
            round=r.round,
            enemy_names=[e.get("name", "") for e in (r.enemies or [])],
            rewards_sent=r.id in rewarded_session_ids,
            created_at=r.created_at,
            updated_at=r.updated_at,
        )
        for r in rows
    ]


def delete_battle_session(db: Session, session_id: int) -> None:
    session = _get_battle_for_update(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="전투를 찾을 수 없습니다.")
    if session.mode == "real":
        raise HTTPException(status_code=400, detail="실전 전투는 삭제 대신 롤백을 사용해 주세요.")
    db.delete(session)
    db.commit()


def terminate_battle(db: Session, session_id: int) -> BattleSessionRead:
    session = _get_battle_for_update(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="전투를 찾을 수 없습니다.")
    if session.status != "in_progress":
        raise HTTPException(status_code=400, detail="이미 종료된 전투입니다.")

    session.status = "early_terminated"
    session.log = list(session.log) + [{
        "round": session.round,
        "events": ["⏹️ 전투 조기 종료"],
    }]
    if session.mode == "real":
        _finalize_real_battle(db, list(session.participants))

    return _commit_battle_session(db, session)


def join_battle(db: Session, session_id: int, data: BattleJoinRequest) -> BattleSessionRead:
    session = _get_battle_for_update(db, session_id)
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
    if session.mode == "real":
        rollback_state = _get_battle_rollback_state(session)
        if rollback_state.get("version") == 1:
            session.rollback_state = _remember_battle_character_state(rollback_state, character)
    return _commit_battle_session(db, session)


def join_battle_enemy(db: Session, session_id: int, data: BattleEnemyJoinRequest) -> BattleSessionRead:
    session = _get_battle_for_update(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="전투를 찾을 수 없습니다.")
    if session.status != "in_progress":
        raise HTTPException(status_code=400, detail="이미 종료된 전투입니다.")
    enemy = db.get(Enemy, data.enemy_id)
    if not enemy:
        raise HTTPException(status_code=404, detail="에너미를 찾을 수 없습니다.")
    if enemy.chapter != session.chapter:
        raise HTTPException(status_code=400, detail="현재 전투 챕터에 소속된 에너미만 추가할 수 있습니다.")

    enemies = list(session.enemies)
    if any(e["enemy_id"] == enemy.id for e in enemies):
        raise HTTPException(status_code=400, detail="이미 전투에 참여 중인 에너미입니다.")

    character_ids = [p["character_id"] for p in session.participants]
    party = db.query(Character).filter(Character.id.in_(character_ids)).all() if character_ids else []
    snapshot = _snapshot_enemy(enemy, party)
    snapshot["joined_round"] = session.round
    enemies.append(snapshot)
    session.enemies = enemies
    return _commit_battle_session(db, session)


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


def resolve_battle_telegraph(db: Session, session_id: int, data: BattleTelegraphRequest) -> BattleSessionRead:
    """1턴: 적의 행동 암시. 에너미의 공격 패턴과 (지정 공격이면) 공격 대상을 확정해 둔다."""
    session = _get_battle_for_update(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="전투를 찾을 수 없습니다.")
    if session.status != "in_progress":
        raise HTTPException(status_code=400, detail="이미 종료된 전투입니다.")
    if session.phase != "telegraph":
        raise HTTPException(status_code=400, detail="지금은 적의 행동 암시 턴이 아닙니다.")

    round_no = session.round
    participants = [dict(p) for p in session.participants]
    enemies = _normalized_battle_enemies(session.enemies)
    summons = [dict(s) for s in session.summons]
    for p in participants:
        _ensure_combatant_snapshot_defaults(p)
    for enemy in enemies:
        _ensure_enemy_snapshot_defaults(enemy)

    # 실전은 "이전 턴 다시 진행하기"를 위해 이 턴의 행동이 반영되기 전 상태를 남겨둔다.
    if session.mode == "real":
        session.round_snapshots = list(session.round_snapshots) + [{
            "round": round_no,
            "phase": "telegraph",
            "participants": [dict(p) for p in participants],
            "enemies": [dict(e) for e in enemies],
            "summons": [dict(s) for s in summons],
            "pending_enemy_actions": [dict(a) for a in session.pending_enemy_actions],
            "item_usages": [],
        }]

    by_char_id = {p["character_id"]: p for p in participants}
    enemies_by_id = {e["enemy_id"]: e for e in enemies}

    events: list[str] = []
    # 값: 이벤트 문자열 하나에 계산 결과 숫자가 여럿(예: 재생의 HP/MP)이면 등장 순서대로 담은 리스트,
    # 하나뿐이면 문자열 그대로.
    calculations: dict[str, str | list[str]] = {}
    for enemy in enemies:
        if enemy.get("joined_round", 0) == round_no:
            particle = _korean_subject_particle(enemy["name"])
            events.append(f"{enemy['name']}{particle} 전투에 참가했습니다!")

    # 0) 라운드 시작 재생 (난입 캐릭터도 생존해 있으므로 재생은 받는다)
    for p in participants:
        if not _combatant_active(p):
            continue
        hp_heal = p["hp_regen_true"] + _floor_amount(p["max_hp"] * p["hp_regen_fixed"])
        mp_heal = p["mp_regen"]
        if hp_heal > 0:
            p["hp"] = min(p["max_hp"], p["hp"] + hp_heal)
        if mp_heal > 0:
            p["mp"] = min(p["max_mp"], p["mp"] + mp_heal)
        if hp_heal > 0 or mp_heal > 0:
            events.append(f"♻️ {p['name']} 재생 (+{hp_heal} HP / +{mp_heal} MP)")
            calculations[events[-1]] = [
                f"고정 체력 재생 {_formula_number(p['hp_regen_true'])} + "
                f"floor(최대 체력 {_formula_number(p['max_hp'])} × 비율 체력 재생 {_formula_number(p['hp_regen_fixed'])})",
                f"MP 재생량 {_formula_number(p['mp_regen'])}",
            ]

    _apply_minion_phase(participants, enemies, summons, round_no, "telegraph", events)
    _apply_ongoing_telegraph_skill_effects(enemies, events, calculations)
    if all(enemy["hp"] <= 0 for enemy in enemies):
        session.status = "victory"
        events.append("🏆 지속 효과로 전투 승리")
        session.participants = participants
        session.enemies = enemies
        session.summons = [summon for summon in summons if summon["hp"] > 0]
        session.log = list(session.log) + [{"round": round_no, "phase": "telegraph", "events": events, "calculations": calculations}]
        if session.mode == "real":
            _finalize_real_battle(db, participants)
        return _commit_battle_session(db, session)

    # 환경 효과: 이번 라운드에 이미 보유한 스택으로 고정 피해를 먼저 입힌 뒤 스택을 쌓는다.
    environments = (
        db.query(Environment).filter(Environment.chapter == session.chapter).order_by(Environment.id.asc()).all()
        if session.chapter else []
    )
    environment_by_id = {env.id: env for env in environments}
    affected = [p for p in participants if _combatant_targetable(p, round_no)]
    for env in environments:
        if not affected:
            break
        condition_enemy = next((enemy for enemy in enemies if enemy["enemy_id"] == env.condition_enemy_id), None)
        condition_alive = condition_enemy is not None and condition_enemy["hp"] > 0
        if env.enemy_condition == "alive" and not condition_alive:
            continue
        if env.enemy_condition == "dead" and condition_alive:
            continue
        stack_note = f"+{env.stacks_per_round}" if env.stackable else f"미보유 대상 +{env.stacks_per_round}"
        max_note = f"최대 {env.max_stacks}스택" if env.max_stacks > 0 else "스택 제한 없음"
        damage_events: list[str] = []
        newly_downed_names: list[str] = []
        for p in affected:
            current_stacks = max(0, int(p["env_stacks"].get(str(env.id), 0)))
            dmg = current_stacks * env.damage_per_stack
            if dmg > 0:
                # 환경은 적의 공격이 아닌 맵 효과라 방어력, 피해 감소, 보호를 적용하지 않는다.
                p["hp"] = max(0, p["hp"] - dmg)
                damage_event = f"　→ {p['name']} · 피해 {dmg} [{p['hp']}/{p['max_hp']}]"
                damage_events.append(damage_event)
                calculations[damage_event] = (
                    f"환경 데미지 {_formula_number(env.damage_per_stack)} × 보유 스택수 {current_stacks}"
                )
                if p["hp"] == 0 and not p["downed"]:
                    p["downed"] = True
                    newly_downed_names.append(p["name"])
            _apply_environment_stack_delta(
                p,
                environment_id=env.id,
                stack_delta=env.stacks_per_round,
                stackable=env.stackable,
                max_stacks=env.max_stacks,
            )
        if damage_events:
            events.append(f"🌫️ 환경 · {env.name}")
            events.extend(damage_events)
        events.append(f"🌫️ 환경 · {env.name} 스택 {stack_note} ({max_note})")
        if newly_downed_names:
            events.append(f"💫 {', '.join(sorted(newly_downed_names))} 기절")

    if not any(_combatant_active(p) for p in participants):
        session.status = "defeat"
        events.append("💀 전투 패배")
        session.participants = participants
        session.enemies = enemies
        session.summons = [summon for summon in summons if summon["hp"] > 0]
        session.log = list(session.log) + [{"round": round_no, "phase": "telegraph", "events": events, "calculations": calculations}]
        if session.mode == "real":
            _finalize_real_battle(db, participants)
        return _commit_battle_session(db, session)

    events.append("📣 적의 행동 암시!")
    pending_actions: list[dict] = []
    next_summon_id = max([s["id"] for s in summons], default=0)
    for action in data.enemy_actions:
        enemy = enemies_by_id.get(action.enemy_id)
        if not enemy or not _enemy_targetable(enemy, round_no):
            continue

        skill = None
        if action.skill_index is not None and 0 <= action.skill_index < len(enemy["skills"]):
            skill = enemy["skills"][action.skill_index]

        if action.kind == "attack" and skill and skill["skill_type"] != "소환":
            is_aoe = _enemy_skill_is_aoe(skill)
            if is_aoe:
                target_ids = [p["character_id"] for p in participants if _combatant_targetable(p, round_no)]
                target_label = "전원"
            else:
                target_count = len(set(action.target_character_ids)) if skill.get("manual_target_count") else max(1, skill["target_count"])
                if skill.get("manual_target_count") and target_count == 0 and any(_combatant_targetable(p, round_no) for p in participants):
                    raise HTTPException(status_code=400, detail="수동 지정 기술의 대상을 1명 이상 선택해 주세요.")
                chosen = [
                    cid for cid in dict.fromkeys(action.target_character_ids)
                    if cid in by_char_id and _combatant_targetable(by_char_id[cid], round_no)
                ][:target_count]
                if skill.get("manual_target_count") and len(chosen) != target_count:
                    raise HTTPException(status_code=400, detail="현재 공격할 수 없는 대상이 포함되어 있습니다.")
                if not chosen:
                    chosen = [p["character_id"] for p in _select_enemy_skill_targets(
                        participants,
                        round_no=round_no,
                        target_count=target_count,
                        auto_target_mode=skill.get("auto_target_mode", "attention"),
                    )]
                target_ids = chosen
                target_label = ", ".join(by_char_id[cid]["name"] for cid in target_ids) if target_ids else "대상 없음"
            events.append(f"🔮 {enemy['name']} - {skill['name']}")
            if skill["skill_type"] == "지속 디버프":
                events.append(f"이번 차례 약화 대상 : {target_label}")
            elif skill["skill_type"] == "환경":
                environment = environment_by_id.get(int(skill.get("environment_id") or 0))
                if environment is None:
                    raise HTTPException(status_code=400, detail="환경 스킬에 사용할 환경을 찾을 수 없습니다.")
                stack_delta = max(1, int(skill.get("environment_stack_count") or 1))
                events.append(f"이번 차례 환경 대상 : {target_label} / {environment.name} +{stack_delta}")
            else:
                base = _floor_amount(enemy["attack"] * skill["damage_percent"] / 100)
                events.append(f"이번 차례 공격 대상 : {target_label} / 예상 피해 : {base}")
            pending_actions.append({
                "enemy_id": enemy["enemy_id"], "kind": "attack",
                "skill_index": action.skill_index, "target_character_ids": target_ids,
            })
        elif action.kind == "summon" and skill and skill["skill_type"] == "소환":
            count = skill.get("summon_count") or 1
            summon_name = skill.get("summon_name") or f"{enemy['name']}의 하수인"
            same_name_summons = [s for s in summons if s["name"] == summon_name]
            if same_name_summons and any(not isinstance(s.get("log_number"), int) for s in same_name_summons):
                for number, existing_summon in enumerate(
                    sorted(same_name_summons, key=lambda value: value["id"]),
                    start=1,
                ):
                    existing_summon["log_number"] = number
            next_log_number = max(
                (s.get("log_number", 0) for s in same_name_summons),
                default=0,
            )
            for _ in range(count):
                next_summon_id += 1
                next_log_number += 1
                summons.append({
                    "id": next_summon_id,
                    "spawn_round": round_no,
                    "action_type": skill.get("summon_action_type", "attack"),
                    "trigger_phase": skill.get("summon_trigger_phase", "enemy"),
                    "trigger_round": round_no + (1 if skill.get("summon_trigger_phase") == "telegraph" else 0),
                    "effect_stat": skill.get("summon_effect_stat", "atk"),
                    "effect_percent": skill.get("summon_effect_percent", 0),
                    "buff_enemy_id": skill.get("summon_buff_enemy_id") or enemy["enemy_id"],
                    "buff_stat": skill.get("summon_buff_stat", "attack"),
                    "name": summon_name,
                    "hp": skill.get("summon_hp") or 1,
                    "max_hp": skill.get("summon_hp") or 1,
                    "attack": skill.get("summon_attack") or 0,
                    "log_number": next_log_number if same_name_summons or count > 1 else None,
                })
            events.append(f"👹 {enemy['name']} - {skill['name']} → {summon_name} x{count} 소환!")
            pending_actions.append({
                "enemy_id": enemy["enemy_id"], "kind": "summon",
                "skill_index": action.skill_index, "target_character_ids": [],
            })
        else:
            events.append(f"🔮 {enemy['name']} - 무반응 예정")
            pending_actions.append({
                "enemy_id": enemy["enemy_id"], "kind": "none",
                "skill_index": None, "target_character_ids": [],
            })

    session.pending_enemy_actions = pending_actions
    session.phase = "ally"
    session.participants = participants
    session.summons = [summon for summon in summons if summon["hp"] > 0]
    session.log = list(session.log) + [{"round": round_no, "phase": "telegraph", "events": events, "calculations": calculations}]

    return _commit_battle_session(db, session)


def resolve_battle_ally_turn(db: Session, session_id: int, data: BattleAllyTurnRequest) -> BattleSessionRead:
    """2턴: 아군 턴. 방어/공격/기술/아이템/구조/치유/퇴각을 처리한다."""
    session = _get_battle_for_update(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="전투를 찾을 수 없습니다.")
    if session.status != "in_progress":
        raise HTTPException(status_code=400, detail="이미 종료된 전투입니다.")
    if session.phase != "ally":
        raise HTTPException(status_code=400, detail="지금은 아군 턴이 아닙니다.")

    round_no = session.round
    participants = [dict(p) for p in session.participants]
    enemies = [dict(e) for e in session.enemies]
    summons = [dict(s) for s in session.summons]
    rollback_state = _get_battle_rollback_state(session) if session.mode == "real" else None
    for p in participants:
        _ensure_combatant_snapshot_defaults(p)
    for enemy in enemies:
        _ensure_enemy_snapshot_defaults(enemy)

    # 실전은 "이전 턴 다시 진행하기"를 위해 이 턴의 행동이 반영되기 전 상태를 남겨둔다.
    # 아이템 사용 내역(turn_item_usages)은 아래 처리 중에 채워지므로, 완성된 뒤 함수 끝에서 append한다.
    turn_snapshot = {
        "round": round_no,
        "phase": "ally",
        "participants": [dict(p) for p in participants],
        "enemies": [dict(e) for e in enemies],
        "summons": [dict(s) for s in summons],
        "pending_enemy_actions": [dict(a) for a in session.pending_enemy_actions],
    } if session.mode == "real" else None
    turn_item_usages: list[dict] = []
    events: list[str] = ["🗡️ 조사단의 행동!"]
    _apply_minion_phase(participants, enemies, summons, round_no, "ally", events)
    # 값: 이벤트 문자열 하나에 계산 결과 숫자가 여럿(예: 재생의 HP/MP)이면 등장 순서대로 담은 리스트,
    # 하나뿐이면 문자열 그대로.
    calculations: dict[str, str | list[str]] = {}

    by_char_id = {p["character_id"]: p for p in participants}
    enemies_by_id = {e["enemy_id"]: e for e in enemies}
    actions_by_char = {a.character_id: a for a in data.character_actions}
    skill_book_order = {book: index for index, book in enumerate(SKILL_BOOK_ORDER)}
    battle_skills_by_character = _query_active_battle_skills_by_character(
        db,
        [p["character_id"] for p in participants],
    )

    living = [p for p in participants if _combatant_active(p)]
    actable = [p for p in living if not _just_joined(p, round_no)]

    # 행동 보상 집계: 실제로 "무반응"이 아닌 행동을 선택한 캐릭터에게만 1라운드씩 적립한다.
    for p in actable:
        action = actions_by_char.get(p["character_id"])
        if action and action.kind != "none":
            p["action_reward_rounds"] += 1

    # 0.5) 반격 태세는 시전한 그 라운드에만 유지된다. 이전 버전에서 남은 라운드 한정 효과도 정리한다.
    for p in participants:
        effects = _ensure_status_effects(p)
        kept = [
            e for e in effects
            if not (
                (e.get("effect_type") == "counter" and e.get("round") != round_no)
                or (
                    isinstance(e.get("expires_round"), int)
                    and e["expires_round"] < round_no
                )
            )
        ]
        if len(kept) != len(effects):
            p["status_effects"] = kept

    # 1) 방어 태세 표시 (수비 포지션 한정으로 다른 캐릭터를 지정해 대신 맞아줄 수 있음. 기본값은 본인)
    for p in participants:
        p["defending"] = False
        p["protect_target"] = None
    for p in actable:
        action = actions_by_char.get(p["character_id"])
        if not (action and action.kind == "defend"):
            continue
        requested_target_id = action.protect_target_character_id or p["character_id"]
        protect_target = by_char_id.get(requested_target_id)
        wants_redirect = requested_target_id != p["character_id"]
        can_redirect = (
            wants_redirect
            and p["faction"] == "수비"
            and protect_target is not None
            and _combatant_targetable(protect_target, round_no)
            and p["mp"] >= 1
        )
        protect_target_id = requested_target_id if can_redirect else p["character_id"]
        p["defending"] = True
        p["protect_target"] = protect_target_id
        attn_gain = _floor_amount((p["lv"] * 20) * (1 + p["presence"]))
        p["attn"] += attn_gain
        attn_formula = (
            f"floor(성장 등급 {_formula_number(p['lv'])} × 20 × "
            f"(1 + 존재감 {_formula_number(p['presence'])}))"
        )
        if protect_target_id != p["character_id"]:
            p["mp"] -= 1
            _note_mp_spent(p, 1)
            events.append(
                f"🛡️ {p['name']} 방어 태세 → {by_char_id[protect_target_id]['name']} 보호 · "
                f"+{attn_gain} 주목도"
            )
        elif wants_redirect and p["faction"] == "수비" and p["mp"] < 1:
            events.append(f"⚠️ {p['name']} MP 부족으로 보호 대상을 지정하지 못해 본인만 방어합니다.")
            events.append(f"🛡️ {p['name']} 방어 태세 · +{attn_gain} 주목도")
        else:
            events.append(f"🛡️ {p['name']} 방어 태세 · +{attn_gain} 주목도")
        calculations[events[-1]] = attn_formula

    def _ordered_targetable_enemies(preferred_enemy_id: int | None) -> list[dict]:
        ordered = [enemy for enemy in enemies if _enemy_targetable(enemy, round_no)]
        if preferred_enemy_id is None:
            return ordered
        preferred = next((enemy for enemy in ordered if enemy["enemy_id"] == preferred_enemy_id), None)
        if preferred is None:
            return ordered
        return [preferred] + [enemy for enemy in ordered if enemy["enemy_id"] != preferred_enemy_id]

    initial_enemy_damage_candidates = {
        f"enemy:{enemy['enemy_id']}": ("enemy", enemy)
        for enemy in enemies
        if _enemy_targetable(enemy, round_no)
    }
    initial_healable_candidates = {f"ally:{target['character_id']}": target for target in participants if _healable(target, round_no)}
    initial_active_candidates = {f"ally:{target['character_id']}": target for target in participants if _combatant_targetable(target, round_no)}

    def _resolve_damage_targets(preferred_enemy_id: int | None, count: int, keys: list[str] | None = None) -> list[tuple[str, dict]]:
        if keys is not None:
            # 선택 창에서는 에너미만 지정한다. 실제 타격 시 살아 있는 하수인이 선택 슬롯을
            # 앞에서부터 가로채며, 남은 슬롯만 관리자가 고른 에너미에게 적용된다.
            selected = _explicit_skill_targets(keys, initial_enemy_damage_candidates, count)
            targets: list[tuple[str, dict]] = [
                ("summon", summon) for summon in summons if summon["hp"] > 0
            ][:count]
            remaining = count - len(targets)
            if remaining > 0:
                # 앞선 행동으로 쓰러진 선택 대상은 건너뛰되 선택하지 않은 에너미로 바꾸지 않는다.
                targets.extend(
                    (kind, target)
                    for kind, target in selected
                    if target["hp"] > 0
                )
            return targets[:count]
        targets: list[tuple[str, dict]] = []
        for summon in summons:
            if summon["hp"] <= 0:
                continue
            targets.append(("summon", summon))
            if len(targets) >= count:
                return targets
        for enemy in _ordered_targetable_enemies(preferred_enemy_id):
            targets.append(("enemy", enemy))
            if len(targets) >= count:
                break
        return targets

    def _enemy_targets(preferred_enemy_id: int | None, count: int, keys: list[str] | None = None) -> list[dict]:
        """약화처럼 하수인을 노리지 않는 기술의 대상. 기술의 '기술 대상' 수만큼 에너미를 고른다."""
        if keys is not None:
            return [
                enemy for _kind, enemy in _explicit_skill_targets(keys, initial_enemy_damage_candidates, count)
                if enemy["hp"] > 0
            ]
        return _ordered_targetable_enemies(preferred_enemy_id)[:count]

    def _apply_damage_to_summon(summon: dict, damage: int) -> tuple[int, bool]:
        dealt = min(damage, summon["hp"])
        overkill = damage > summon["hp"]
        summon["hp"] = max(0, summon["hp"] - damage)
        return dealt, overkill

    def _ally_targets(
        actor: dict,
        action: CharacterActionInput,
        count: int,
        *,
        active_only: bool = False,
        exclude_actor: bool = False,
    ) -> list[dict]:
        """기술의 '기술 대상' 수만큼 아군을 고른다. 지정 값이 없으면 지정 대상 → 시전자 → 나머지 순으로 채운다."""
        def eligible(target: dict) -> bool:
            if exclude_actor and target["character_id"] == actor["character_id"]:
                return False
            return _combatant_targetable(target, round_no) if active_only else _healable(target, round_no)

        candidates = {
            key: target
            for key, target in (initial_active_candidates if active_only else initial_healable_candidates).items()
            if not (exclude_actor and target["character_id"] == actor["character_id"])
        }
        if action.skill_target_keys is not None:
            return [
                target for target in _explicit_skill_targets(action.skill_target_keys, candidates, count)
                if eligible(target)
            ]
        chosen = by_char_id.get(action.target_character_id) if action.target_character_id else None
        ordered: list[dict] = []
        picked_ids: set[int] = set()
        for ally in [chosen, actor, *participants]:
            if ally is None or ally["character_id"] in picked_ids or not eligible(ally):
                continue
            ordered.append(ally)
            picked_ids.add(ally["character_id"])
        return ordered[:count]

    def _multi_ally_targets(count: int, keys: list[str] | None = None) -> list[dict]:
        # 체력 낮은 순 → 동률이면 주목도 높은 순 → 그것도 같으면 이름 가나다순.
        healable = [p for p in participants if _healable(p, round_no)]
        if keys is not None:
            return [target for target in _explicit_skill_targets(keys, initial_healable_candidates, count) if _healable(target, round_no)]
        return sorted(healable, key=lambda target: (target["hp"], -target["attn"], target["name"]))[:count]

    def _selected_skill(actor: dict, action: CharacterActionInput) -> dict | None:
        available = battle_skills_by_character.get(actor["character_id"], {})
        if not available:
            return None
        selected = available.get(action.skill_node_id) if action.skill_node_id is not None else None
        if selected is None:
            ordered_skills = sorted(
                available.values(),
                key=lambda skill: (
                    skill_book_order.get(str(skill.get("book")), len(skill_book_order)),
                    -int(skill.get("tier") or 0),
                    int(skill.get("id") or 0),
                ),
            )
            selected = ordered_skills[0] if ordered_skills else None
        if selected is None:
            return None
        resolved = dict(selected)
        resolved["display_name"] = _battle_skill_name(resolved)
        return resolved

    # MP 소모는 그 행동이 남긴 첫 로그 줄 끝에 "· MP -n [현재/최대]"로 덧붙인다.
    pending_mp_note: dict[str, object] = {}

    def _note_mp_spent(actor: dict, spent: int) -> None:
        if spent > 0:
            pending_mp_note.update({
                "index": len(events),
                "text": f" · MP -{spent} [{actor['mp']}/{actor['max_mp']}]",
            })

    def _flush_mp_note() -> None:
        if not pending_mp_note:
            return
        index = int(pending_mp_note["index"])
        text = str(pending_mp_note["text"])
        pending_mp_note.clear()
        if index >= len(events):
            return
        previous = events[index]
        events[index] = previous + text
        if previous in calculations:
            calculations[events[index]] = calculations.pop(previous)

    def _spend_skill_cost(actor: dict, skill: dict | None) -> None:
        skill_cost = _battle_skill_cost(actor, skill) if skill is not None else max(0, int(actor["skill_cost"]))
        if actor["mp"] < skill_cost:
            return
        actor["mp"] -= skill_cost
        _note_mp_spent(actor, skill_cost)

    queued_actions: list[tuple[int, int, dict, CharacterActionInput, dict | None]] = []
    for order_index, p in enumerate(actable):
        action = actions_by_char.get(p["character_id"])
        if action is None or action.kind == "none":
            continue
        selected_skill = _selected_skill(p, action) if action.kind == "skill" else None
        if action.kind == "skill" and selected_skill is not None and selected_skill.get("activation_order") is not None:
            priority = int(selected_skill["activation_order"])
        else:
            priority = BATTLE_ACTION_KIND_PRIORITY.get(action.kind, BATTLE_ACTION_KIND_PRIORITY["attack"])
        queued_actions.append((priority, order_index, p, action, selected_skill))
    queued_actions.sort(key=lambda entry: (entry[0], entry[1]))

    # 아이템 사용 행동에 쓰일 아이템을 미리 한 번에 조회해 행동 처리 루프에서의 개별 조회(N+1)를 없앤다.
    item_action_ids = {
        entry[3].item_id for entry in queued_actions if entry[3].kind == "item" and entry[3].item_id
    }
    items_by_id: dict[int, Item] = (
        {item.id: item for item in db.query(Item).filter(Item.id.in_(item_action_ids)).all()}
        if item_action_ids
        else {}
    )

    # 실전 아이템 사용은 캐릭터 단위로 잠근 뒤 보유량/사용 상태를 일괄 조회한다.
    # 전투 밖 아이템 사용과 동시에 들어와도 초과 사용을 막고, 행동마다 2개씩 발생하던 쿼리를 고정 3개로 줄인다.
    item_action_keys = {
        (entry[2]["character_id"], entry[3].item_id)
        for entry in queued_actions
        if session.mode == "real" and entry[3].kind == "item" and entry[3].item_id
    }
    owned_by_character_item: dict[tuple[int, int], int] = {}
    item_states_by_character_item: dict[tuple[int, int], CharacterItemState] = {}
    if item_action_keys:
        item_character_ids = sorted({character_id for character_id, _item_id in item_action_keys})
        used_item_ids = sorted({item_id for _character_id, item_id in item_action_keys})
        db.query(Character.id).filter(Character.id.in_(item_character_ids)).order_by(Character.id).with_for_update().all()
        owned_by_character_item = {
            (character_id, item_id): quantity
            for character_id, item_id, quantity in (
                db.query(
                    Purchase.character_id,
                    Purchase.item_id,
                    func.coalesce(func.sum(Purchase.quantity), 0),
                )
                .filter(
                    Purchase.character_id.in_(item_character_ids),
                    Purchase.item_id.in_(used_item_ids),
                )
                .group_by(Purchase.character_id, Purchase.item_id)
                .all()
            )
        }
        existing_states = (
            db.query(CharacterItemState)
            .filter(
                CharacterItemState.character_id.in_(item_character_ids),
                CharacterItemState.item_id.in_(used_item_ids),
            )
            .with_for_update()
            .all()
        )
        item_states_by_character_item = {
            (state.character_id, state.item_id): state for state in existing_states
        }
        for character_id, item_id in item_action_keys:
            key = (character_id, item_id)
            if key not in item_states_by_character_item:
                # flush 전이라 컬럼 default(0)가 아직 적용되지 않으므로 명시적으로 0을 지정해 둔다.
                state = CharacterItemState(character_id=character_id, item_id=item_id, used_quantity=0)
                db.add(state)
                item_states_by_character_item[key] = state

    # 2) 위에서 매긴 발동 순서(priority)대로 행동을 처리한다.
    for _priority, _order_index, p, action, selected_skill in queued_actions:
        _flush_mp_note()
        if p["retreated"]:
            continue

        supported_skill = (
            action.kind == "skill"
            and selected_skill is not None
            and selected_skill.get("var_name") in SUPPORTED_BATTLE_SKILL_VAR_NAMES
        )

        if action.kind == "skill" and selected_skill is not None:
            skill_cost = _battle_skill_cost(p, selected_skill)
            if p["mp"] < skill_cost:
                events.append(f"⚠️ {p['name']}의 {selected_skill['display_name']} 사용 실패 (MP 부족)")
                continue

        if supported_skill:
            skill_name = str(selected_skill["display_name"])
            var_name = str(selected_skill.get("var_name") or "")
            skill_lv = _skill_lv_from_tier(selected_skill)
            skill_power = float(selected_skill.get("power") or 0.0)
            skill_eff_fixed = float(p["skill_eff_fixed"] or 0.0)
            tier6_bonus = _skill_has_tier6_bonus(selected_skill)

            if var_name == "ab_strike":
                targets = _resolve_damage_targets(
                    action.target_enemy_id, _skill_target_count(selected_skill), action.skill_target_keys
                )
                if not targets:
                    continue
                _spend_skill_cost(p, selected_skill)
                damage, damage_formula = _damage_from_skill_power(p, skill_power, skill_eff_fixed)
                _apply_damage_attn(p, damage)
                target_kind, target = targets[0]
                if target_kind == "summon":
                    dealt, overkill = _apply_damage_to_summon(target, damage)
                    summon_name = _summon_log_name(target)
                    events.append(
                        f"✨ {p['name']}의 {skill_name} → 하수인 {summon_name} {dealt} 피해 · "
                        f"[{target['hp']}/{target['max_hp']}]"
                        f"{' (오버킬)' if overkill else ''}"
                    )
                    calculations[events[-1]] = f"min({damage_formula}, 남은 체력 {target['hp'] + dealt})"
                    if target["hp"] <= 0:
                        events.append(f"💀 하수인 {summon_name} 처치")
                else:
                    dealt, overkill = _apply_damage_to_enemy(target, damage)
                    events.append(
                        f"✨ {p['name']}의 {skill_name} → {target['name']} {dealt} 피해 · "
                        f"[{target['hp']}/{target['max_hp']}]"
                        f"{' (오버킬)' if overkill else ''}"
                    )
                    calculations[events[-1]] = f"min({damage_formula}, 남은 체력 {target['hp'] + dealt})"
                    if target["hp"] <= 0:
                        events.append(f"💀 {target['name']} 격파")
                continue

            if var_name == "ab_crushing":
                targets = _resolve_damage_targets(
                    action.target_enemy_id, _skill_target_count(selected_skill), action.skill_target_keys
                )
                if not targets:
                    continue
                _spend_skill_cost(p, selected_skill)
                damage, damage_formula = _damage_from_skill_power(p, skill_power, skill_eff_fixed)
                total_damage_for_attn = 0
                for target_kind, target in targets:
                    total_damage_for_attn += damage
                    if target_kind == "summon":
                        dealt, overkill = _apply_damage_to_summon(target, damage)
                        summon_name = _summon_log_name(target)
                        events.append(
                            f"🌊 {p['name']}의 {skill_name} → 하수인 {summon_name} {dealt} 피해 · "
                            f"[{target['hp']}/{target['max_hp']}]"
                            f"{' (오버킬)' if overkill else ''}"
                        )
                        calculations[events[-1]] = f"min({damage_formula}, 남은 체력 {target['hp'] + dealt})"
                        if target["hp"] <= 0:
                            events.append(f"💀 하수인 {summon_name} 처치")
                        continue

                    dealt, overkill = _apply_damage_to_enemy(target, damage)
                    events.append(
                        f"🌊 {p['name']}의 {skill_name} → {target['name']} {dealt} 피해 · "
                        f"[{target['hp']}/{target['max_hp']}]"
                        f"{' (오버킬)' if overkill else ''}"
                    )
                    calculations[events[-1]] = f"min({damage_formula}, 남은 체력 {target['hp'] + dealt})"
                    if target["hp"] <= 0:
                        events.append(f"💀 {target['name']} 격파")
                    if tier6_bonus:
                        _add_status_effect(
                            target,
                            {
                                "effect_type": "outgoing_damage_penalty_once",
                                "affinity": "debuff",
                                "source_character_id": p["character_id"],
                                "source_name": p["name"],
                                "skill_name": skill_name,
                                "var_name": var_name,
                                "stackable": bool(selected_skill.get("stackable")),
                                "value": 0.05,
                            },
                            participants=participants,
                            enemies=enemies,
                        )
                if total_damage_for_attn > 0:
                    _apply_damage_attn(p, total_damage_for_attn)
                continue

            if var_name == "ab_harm":
                targets = _resolve_damage_targets(
                    action.target_enemy_id, _skill_target_count(selected_skill), action.skill_target_keys
                )
                if not targets:
                    continue
                _spend_skill_cost(p, selected_skill)
                damage, damage_formula = _damage_from_skill_power(p, skill_power, skill_eff_fixed)
                _apply_damage_attn(p, damage)
                target_kind, target = targets[0]
                if target_kind == "summon":
                    dealt, overkill = _apply_damage_to_summon(target, damage)
                    summon_name = _summon_log_name(target)
                    events.append(
                        f"☠️ {p['name']}의 {skill_name} → 하수인 {summon_name} {dealt} 피해 · "
                        f"[{target['hp']}/{target['max_hp']}]"
                        f"{' (오버킬)' if overkill else ''}"
                    )
                    calculations[events[-1]] = f"min({damage_formula}, 남은 체력 {target['hp'] + dealt})"
                    if target["hp"] <= 0:
                        events.append(f"💀 하수인 {summon_name} 처치")
                else:
                    dealt, overkill = _apply_damage_to_enemy(target, damage)
                    events.append(
                        f"☠️ {p['name']}의 {skill_name} → {target['name']} {dealt} 피해 · "
                        f"[{target['hp']}/{target['max_hp']}]"
                        f"{' (오버킬)' if overkill else ''}"
                    )
                    calculations[events[-1]] = f"min({damage_formula}, 남은 체력 {target['hp'] + dealt})"
                    if target["hp"] <= 0:
                        events.append(f"💀 {target['name']} 격파")
                    else:
                        _add_status_effect(
                            target,
                            {
                                "effect_type": "ongoing_damage",
                                "affinity": "debuff",
                                "trigger_phase": "telegraph",
                                "damage": damage,
                                "source_character_id": p["character_id"],
                                "source_name": p["name"],
                                "skill_name": skill_name,
                                "var_name": var_name,
                                "stackable": bool(selected_skill.get("stackable")),
                            },
                            participants=participants,
                            enemies=enemies,
                        )
                        events.append(f"　↳ {target['name']}에게 지속 피해가 누적됩니다.")
                continue

            if var_name == "ab_anvil":
                _spend_skill_cost(p, selected_skill)
                heal_amount, heal_formula = _skill_heal_amount(
                    p,
                    p,
                    skill_power,
                    skill_eff_fixed,
                    include_heal_efficiency=False,
                )
                before_hp = p["hp"]
                healed, revived = _apply_skill_heal(p, p, heal_amount, grant_attention=False)
                p["attn"] += healed
                cleanse_count = max(0, int(selected_skill.get("cleanse_count") or 0))
                # 모루도 정화처럼 약화 효과와 환경 스택을 함께 해제한다.
                removed, removed_names = _cleanse_combat_debuffs(db, p, cleanse_count)
                log = (
                    f"🪨 {p['name']}의 {skill_name} → {healed} 치유"
                    f"{' (부활)' if revived else ''}"
                )
                if removed > 0:
                    removed_by_name: dict[str, int] = {}
                    for removed_name in removed_names:
                        removed_by_name[removed_name] = removed_by_name.get(removed_name, 0) + 1
                    log += " · " + " / ".join(
                        f"{removed_name} 스택 -{count}"
                        for removed_name, count in removed_by_name.items()
                    )
                elif cleanse_count > 0:
                    log += " · 해제할 스택 없음"
                events.append(log)
                calculations[events[-1]] = _skill_heal_formula(p, heal_formula, before_hp)
                continue

            if var_name == "ab_counter":
                targets = _ally_targets(p, action, _skill_target_count(selected_skill), active_only=True)
                if not targets:
                    continue
                _spend_skill_cost(p, selected_skill)
                reduction_bonus = max(0.0, skill_power * (1 + skill_eff_fixed))
                for target in targets:
                    _add_status_effect(
                        target,
                        {
                            "effect_type": "counter",
                            "affinity": "buff",
                            "source_character_id": p["character_id"],
                            "source_name": p["name"],
                            "skill_name": skill_name,
                            "var_name": var_name,
                            "stackable": bool(selected_skill.get("stackable")),
                            "skill_lv": skill_lv,
                            "skill_eff_fixed": skill_eff_fixed,
                            "damage_reduction": reduction_bonus,
                            "counter_damage": _skill_power_value(selected_skill, "counter_damage", 2.0),
                            "counter_atk": p["atk"],
                            "counter_atk_p": p["atk_p"],
                            "counter_def": p["def"],
                            "counter_def_p": p["def_p"],
                            "counter_def_eff": p["def_eff"],
                            "counter_skill_eff_true": p["skill_eff_true"],
                            "round": round_no,
                        },
                        participants=participants,
                        enemies=enemies,
                    )
                    # 피해 감소는 대상이 받고, 반격 자체는 시전자가 수행한다.
                    events.append(
                        f"↩️ {p['name']}의 {skill_name} → {target['name']} "
                        f"(피해 감소 +{_floor_amount(reduction_bonus * 100)}%) · {p['name']} 반격 태세"
                    )
                    calculations[events[-1]] = (
                        f"floor(기술 위력 {_formula_number(skill_power)} × "
                        f"(1 + 기술 효율 비례 {_formula_number(skill_eff_fixed)}) × 100)%"
                    )
                continue

            if var_name == "ab_protect":
                targets = _ally_targets(p, action, _skill_target_count(selected_skill))
                if not targets:
                    continue
                _spend_skill_cost(p, selected_skill)
                attn_transfer = _skill_power_value(selected_skill, "attn_transfer", 0.0)
                attn_reduction_pct = min(1.0, max(0.0, attn_transfer * (1 + skill_eff_fixed)))
                healed_values: list[int] = []
                for target in targets:
                    heal_amount, heal_formula = _skill_heal_amount(p, target, skill_power, skill_eff_fixed)
                    before_hp = target["hp"]
                    healed, revived = _apply_skill_heal(p, target, heal_amount, grant_attention=False)
                    healed_values.append(healed)
                    attn_before = max(0, target["attn"])
                    reduced_attn = _floor_amount(attn_before * attn_reduction_pct)
                    target["attn"] -= reduced_attn
                    gained_attn = _floor_amount((reduced_attn * 2) * (1 + p["presence"]))
                    p["attn"] += gained_attn
                    events.append(
                        f"🛡️ {p['name']}의 {skill_name} → {target['name']} {healed} 치유"
                        f"{' (부활)' if revived else ''} · [{target['hp']}/{target['max_hp']}]"
                        f" · 주목도 {reduced_attn} 이전 / {gained_attn} 획득"
                    )
                    calculations[events[-1]] = [
                        _skill_heal_formula(target, heal_formula, before_hp),
                        (
                            f"floor(대상 주목도 {_formula_number(attn_before)} × "
                            f"주목도 이전 {_formula_number(attn_transfer)} × "
                            f"(1 + 기술 효율 비례 {_formula_number(skill_eff_fixed)}))"
                        ),
                        (
                            f"floor(이전 주목도 {_formula_number(reduced_attn)} × 2 × "
                            f"(1 + 존재감 {_formula_number(p['presence'])}))"
                        ),
                    ]
                _apply_multi_heal_attn(p, healed_values)
                continue

            if var_name == "ab_cure":
                targets = _ally_targets(p, action, _skill_target_count(selected_skill))
                if not targets:
                    continue
                _spend_skill_cost(p, selected_skill)
                healed_values = []
                for target in targets:
                    heal_amount, heal_formula = _skill_heal_amount(p, target, skill_power, skill_eff_fixed)
                    before_hp = target["hp"]
                    healed, revived = _apply_skill_heal(
                        p, target, heal_amount, allow_overheal=tier6_bonus, grant_attention=False
                    )
                    healed_values.append(healed)
                    removed = 0
                    removed_names: list[str] = []
                    if tier6_bonus:
                        removed, removed_names = _cleanse_combat_debuffs(db, target, skill_lv % 6)
                    log = (
                        f"💚 {p['name']}의 {skill_name} → {target['name']} {healed} 치유"
                        f"{' (부활)' if revived else ''} · [{target['hp']}/{target['max_hp']}]"
                    )
                    if removed > 0:
                        log += f" / 약화 {removed}개 해제 ({_format_cleansed_names(removed_names)})"
                    events.append(log)
                    calculations[events[-1]] = _skill_heal_formula(
                        target, heal_formula, before_hp, allow_overheal=tier6_bonus
                    )
                _apply_multi_heal_attn(p, healed_values)
                continue

            if var_name == "ab_aid":
                # 구호는 대상을 고르지 않고 현재 체력이 낮은 순으로 자동 지정한다.
                targets = _multi_ally_targets(_skill_target_count(selected_skill))
                if not targets:
                    continue
                _spend_skill_cost(p, selected_skill)
                damage_bonus = max(0.0, skill_lv * 0.01)
                healed_values = []
                for target in targets:
                    heal_amount, heal_formula = _skill_heal_amount(p, target, skill_power, skill_eff_fixed)
                    before_hp = target["hp"]
                    healed, revived = _apply_skill_heal(p, target, heal_amount, grant_attention=False)
                    healed_values.append(healed)
                    events.append(
                        f"🕊️ {p['name']}의 {skill_name} → {target['name']} {healed} 치유"
                        f"{' (부활)' if revived else ''} · [{target['hp']}/{target['max_hp']}]"
                    )
                    calculations[events[-1]] = _skill_heal_formula(target, heal_formula, before_hp)
                    if tier6_bonus and damage_bonus > 0:
                        _add_status_effect(
                            target,
                            {
                                "effect_type": "outgoing_damage_bonus_once",
                                "affinity": "buff",
                                "source_character_id": p["character_id"],
                                "source_name": p["name"],
                                "skill_name": skill_name,
                                "var_name": var_name,
                                "stackable": bool(selected_skill.get("stackable")),
                                "value": damage_bonus,
                            },
                            participants=participants,
                            enemies=enemies,
                        )
                        events.append(
                            f"　↳ {target['name']} 다음 공격 피해 +{_floor_amount(damage_bonus * 100)}%"
                        )
                _apply_multi_heal_attn(p, healed_values)
                continue

            if var_name == "ab_purification":
                targets = _ally_targets(p, action, _skill_target_count(selected_skill))
                if not targets:
                    continue
                _spend_skill_cost(p, selected_skill)
                healed_values = []
                for target in targets:
                    heal_amount, heal_formula = _skill_heal_amount(p, target, skill_power, skill_eff_fixed)
                    before_hp = target["hp"]
                    healed, revived = _apply_skill_heal(p, target, heal_amount, grant_attention=False)
                    healed_values.append(healed)
                    cleanse_count = max(0, int(selected_skill.get("cleanse_count") or 0))
                    removed, removed_names = _cleanse_combat_debuffs(db, target, cleanse_count)
                    if tier6_bonus and removed > 0:
                        _add_status_effect(
                            target,
                            {
                                "effect_type": "purification_guard",
                                "affinity": "buff",
                                "source_character_id": p["character_id"],
                                "source_name": p["name"],
                                "skill_name": skill_name,
                                "var_name": var_name,
                                "stackable": bool(selected_skill.get("stackable")),
                                "stacks": removed,
                                "damage_bonus_per_stack": 0.05,
                            },
                            participants=participants,
                            enemies=enemies,
                        )
                    log = (
                        f"✨ {p['name']}의 {skill_name} → {target['name']} {healed} 치유"
                        f"{' (부활)' if revived else ''} · [{target['hp']}/{target['max_hp']}]"
                    )
                    if removed > 0:
                        log += f" / 약화 {removed}개 해제 ({_format_cleansed_names(removed_names)})"
                    if tier6_bonus and removed > 0:
                        log += f" / 약화 방지 {removed}스택"
                    events.append(log)
                    calculations[events[-1]] = _skill_heal_formula(target, heal_formula, before_hp)
                _apply_multi_heal_attn(p, healed_values)
                continue

            if var_name == "ab_encourage":
                targets = _ally_targets(p, action, _skill_target_count(selected_skill), active_only=True)
                if not targets:
                    continue
                _spend_skill_cost(p, selected_skill)
                bonus = max(0.0, skill_power * (1 + skill_eff_fixed))
                for target in targets:
                    _add_status_effect(
                        target,
                        {
                            "effect_type": "outgoing_damage_bonus_once",
                            "affinity": "buff",
                            "source_character_id": p["character_id"],
                            "source_name": p["name"],
                            "skill_name": skill_name,
                            "var_name": var_name,
                            "stackable": bool(selected_skill.get("stackable")),
                            "value": bonus,
                            "expires_round": round_no,
                        },
                        participants=participants,
                        enemies=enemies,
                    )
                    events.append(
                        f"📣 {p['name']}의 {skill_name} → {target['name']} 피해 증폭 +{_floor_amount(bonus * 100)}%"
                    )
                    calculations[events[-1]] = (
                        f"floor(기술 위력 {_formula_number(skill_power)} × "
                        f"(1 + 기술 효율 비례 {_formula_number(skill_eff_fixed)}) × 100)%"
                    )
                continue

            if var_name == "ab_curse":
                target_enemies = _enemy_targets(
                    action.target_enemy_id, _skill_target_count(selected_skill), action.skill_target_keys
                )
                if not target_enemies:
                    continue
                _spend_skill_cost(p, selected_skill)
                penalty = max(0.0, skill_power * (1 + skill_eff_fixed))
                for target_enemy in target_enemies:
                    _add_status_effect(
                        target_enemy,
                        {
                            "effect_type": "outgoing_damage_penalty_once",
                            "affinity": "debuff",
                            "source_character_id": p["character_id"],
                            "source_name": p["name"],
                            "skill_name": skill_name,
                            "var_name": var_name,
                            "stackable": bool(selected_skill.get("stackable")),
                            "value": penalty,
                        },
                        participants=participants,
                        enemies=enemies,
                    )
                    events.append(
                        f"🔮 {p['name']}의 {skill_name} → {target_enemy['name']} 피해 증폭 -{_floor_amount(penalty * 100)}%"
                    )
                    calculations[events[-1]] = (
                        f"floor(기술 위력 {_formula_number(skill_power)} × "
                        f"(1 + 기술 효율 비례 {_formula_number(skill_eff_fixed)}) × 100)%"
                    )
                continue

            if var_name == "ab_charge":
                # 충전은 시전자 자신에게는 걸 수 없다.
                targets = _ally_targets(
                    p, action, _skill_target_count(selected_skill), active_only=True, exclude_actor=True
                )
                if not targets:
                    continue
                _spend_skill_cost(p, selected_skill)
                mana_restored = max(0, _floor_amount(skill_power * (1 + skill_eff_fixed)))
                for target in targets:
                    before_mp = target["mp"]
                    target["mp"] = min(target["max_mp"], target["mp"] + mana_restored)
                    actually_restored = target["mp"] - before_mp
                    events.append(
                        f"🔋 {p['name']}의 {skill_name} → {target['name']} MP {actually_restored} 회복 · "
                        f"[{target['mp']}/{target['max_mp']}]"
                    )
                    calculations[events[-1]] = (
                        f"min(floor(기술 위력 {_formula_number(skill_power)} × "
                        f"(1 + 기술 효율 비례 {_formula_number(skill_eff_fixed)})), "
                        f"잃은 MP {_formula_number(target['max_mp'] - before_mp)})"
                    )
                continue

        if action.kind in ("attack", "skill"):
            target_enemy = enemies_by_id.get(action.target_enemy_id) if action.target_enemy_id else None
            if target_enemy is None or not _enemy_targetable(target_enemy, round_no):
                target_enemy = next((enemy for enemy in enemies if _enemy_targetable(enemy, round_no)), None)
            if target_enemy is None:
                continue
            damage_amp = _consume_outgoing_damage_amplification(p)
            if action.kind == "skill":
                _spend_skill_cost(p, selected_skill)
                raw = (p["atk"] * (1 + p["atk_p"]) + p["skill_eff_true"]) * (1 + damage_amp) * _skill_coef(p)
                damage_formula = (
                    f"floor((공격력 {_formula_number(p['atk'])} × "
                    f"(1 + 공격력 증폭률 {_formula_number(p['atk_p'])}) + "
                    f"고정 기술 효율 {_formula_number(p['skill_eff_true'])}) × "
                    f"(1 + 피해 증폭 {_formula_number(damage_amp)}) × "
                    f"(1 + 기술 등급 {_formula_number(p['skill_lv'])} × "
                    f"기술 효율 {_formula_number(p['skill_eff_fixed'])}))"
                )
            else:
                # 일반 공격은 기술 효율(skill_eff_true/skill_eff_fixed) 보너스를 받지 않는다 - 그건 기술 사용 전용이다.
                raw = p["atk"] * (1 + p["atk_p"]) * (1 + damage_amp)
                damage_formula = (
                    f"floor(공격력 {_formula_number(p['atk'])} × "
                    f"(1 + 공격력 증폭률 {_formula_number(p['atk_p'])}) × "
                    f"(1 + 피해 증폭 {_formula_number(damage_amp)}))"
                )
            dmg = max(0, _floor_amount(raw))
            attn_mult = 4 if p["faction"] == "수비" else 1
            p["attn"] += _floor_amount(dmg * attn_mult * (1 + p["presence"]))

            target_summon = next((summon for summon in summons if summon["hp"] > 0), None)
            if target_summon is not None:
                dealt, overkill = _apply_damage_to_summon(target_summon, dmg)
                target_summon_name = _summon_log_name(target_summon)
                action_label = (
                    f"{p['name']}의 {selected_skill['display_name']}"
                    if action.kind == "skill" and selected_skill is not None
                    else f"{p['name']} 공격"
                )
                events.append(
                    f"⚔️ {action_label}: 하수인 {target_summon_name}에게 {dealt} 피해 "
                    f"[{target_summon['hp']}/{target_summon['max_hp']}]"
                    f"{' (오버킬)' if overkill else ''}"
                )
                calculations[events[-1]] = f"min({damage_formula}, 남은 체력 {target_summon['hp'] + dealt})"
                if target_summon["hp"] <= 0:
                    events.append(f"💀 하수인 {target_summon_name} 처치")
                continue

            dealt = min(dmg, target_enemy["hp"])
            overkill = dmg > target_enemy["hp"]
            target_enemy["hp"] = max(0, target_enemy["hp"] - dmg)
            action_label = (
                f"{p['name']}의 {selected_skill['display_name']}"
                if action.kind == "skill" and selected_skill is not None
                else f"{p['name']} 공격"
            )
            events.append(
                f"⚔️ {action_label}: {dealt} 피해 · "
                f"{target_enemy['name']} [{target_enemy['hp']}/{target_enemy['max_hp']}]"
                f"{' (오버킬)' if overkill else ''}"
            )
            calculations[events[-1]] = (
                f"min({damage_formula}, 남은 체력 {target_enemy['hp'] + dealt})"
            )
            if target_enemy["hp"] <= 0:
                events.append(f"💀 {target_enemy['name']} 격파")

        elif action.kind == "item":
            item = items_by_id.get(action.item_id) if action.item_id else None
            if item is None or item.item_type != "consumable":
                events.append(f"⚠️ {p['name']} 사용할 아이템이 지정되지 않았습니다.")
                continue
            if _challenge_acquisition_chapter(item) is not None:
                events.append(f"⚠️ {p['name']}: 도전과제 획득 아이템은 캐릭터 정보에서 사용해 주세요.")
                continue
            if session.mode == "real":
                key = (p["character_id"], item.id)
                owned = owned_by_character_item.get(key, 0)
                state = item_states_by_character_item[key]
                if state.used_quantity >= owned:
                    events.append(f"⚠️ {p['name']}: {item.name}을(를) 보유하고 있지 않습니다.")
                    continue
                state.used_quantity += 1
                usage = ItemUsage(character_id=p["character_id"], item_id=item.id, quantity=1)
                db.add(usage)
                db.flush()
                if rollback_state and rollback_state.get("version") == 1:
                    rollback_state = _remember_item_usage(rollback_state, usage)
                turn_item_usages.append({
                    "item_usage_id": usage.id,
                    "character_id": usage.character_id,
                    "item_id": usage.item_id,
                    "quantity": usage.quantity,
                })
            cleanse_notes, effect_deltas = _apply_item_effects_to_snapshot(db, p, item.effects or [], sign=1)
            log = f"🎒 {p['name']} {item.name} 사용"
            if effect_deltas:
                log += f" ({', '.join(effect_deltas)})"
            if cleanse_notes:
                log += " · " + " · ".join(cleanse_notes)
            events.append(log)

        elif action.kind == "rescue":
            target = by_char_id.get(action.target_character_id) if action.target_character_id else None
            if target is None or not target["downed"]:
                events.append(f"⚠️ {p['name']} 구조 대상이 없습니다.")
                continue
            target["hp"] = max(1, _floor_amount(target["max_hp"] * 0.1))
            target["downed"] = False
            events.append(f"🚑 {p['name']} → {target['name']} 구조! {target['name']} 부활 [HP {target['hp']}/{target['max_hp']}]")

        elif action.kind == "retreat":
            p["retreated"] = True
            events.append(f"🏳️ {p['name']} 퇴각")

        elif action.kind == "heal":
            # 이 시점에 에너미가 전부 죽어 승리가 확정됐다면 치유는 생략한다.
            if all(enemy["hp"] <= 0 for enemy in enemies):
                continue
            if p["faction"] != "치유":
                events.append(f"⚠️ {p['name']}: 치유 포지션만 치유를 사용할 수 있습니다.")
                continue
            if p["mp"] < 1:
                events.append(f"⚠️ {p['name']} 치유 실패 (MP 부족)")
                continue

            chosen = by_char_id.get(action.target_character_id) if action.target_character_id else None
            target = chosen if chosen and _healable(chosen, round_no) else p
            heal = max(0, _floor_amount(0.25 * target["max_hp"] * (1 + p["heal_eff"])))
            p["mp"] -= 1
            _note_mp_spent(p, 1)

            before = target["hp"]
            next_hp = target["hp"] + heal
            if not target["over_heal"]:
                next_hp = min(next_hp, target["max_hp"])
            target["hp"] = next_hp
            healed = target["hp"] - before
            p["attn"] += _floor_amount(healed * 2 * (1 + p["presence"]))
            revived = target["downed"] and target["hp"] > 0
            if revived:
                target["downed"] = False
            events.append(
                f"💚 {p['name']} → {target['name']} {healed} 치유{' (부활)' if revived else ''} · "
                f"{target['name']} [{before}→{target['hp']}/{target['max_hp']}]"
            )
            heal_formula = (
                f"floor(기본 치유 비율 0.25 × 최대 체력 {_formula_number(target['max_hp'])} × "
                f"(1 + 치유 효율 {_formula_number(p['heal_eff'])}))"
            )
            calculations[events[-1]] = (
                heal_formula if target["over_heal"]
                else f"min({heal_formula}, 잃은 체력 {_formula_number(target['max_hp'] - before)})"
            )

    _flush_mp_note()

    # 격려처럼 해당 라운드에만 유효한 효과는 아군 행동이 모두 끝나면 소멸한다.
    for p in participants:
        p["status_effects"] = [
            effect for effect in _ensure_status_effects(p)
            if not (
                isinstance(effect.get("expires_round"), int)
                and effect["expires_round"] <= round_no
            )
        ]

    victory = all(e["hp"] <= 0 for e in enemies)
    no_active_left = not any(_combatant_active(p) for p in participants)

    if victory:
        session.status = "victory"
        events.append("🏆 전투 승리")
    elif no_active_left:
        session.status = "defeat"
        events.append("💀 전투 패배")
    else:
        session.phase = "enemy"

    session.participants = participants
    session.enemies = enemies
    session.summons = [summon for summon in summons if summon["hp"] > 0]
    if rollback_state and rollback_state.get("version") == 1:
        session.rollback_state = rollback_state
    session.log = list(session.log) + [{
        "round": round_no,
        "phase": "ally",
        "events": events,
        "calculations": calculations,
    }]
    if turn_snapshot is not None:
        turn_snapshot["item_usages"] = turn_item_usages
        session.round_snapshots = list(session.round_snapshots) + [turn_snapshot]

    if session.status != "in_progress" and session.mode == "real":
        _finalize_real_battle(db, participants)

    return _commit_battle_session(db, session)


def resolve_battle_enemy_turn(db: Session, session_id: int) -> BattleSessionRead:
    """3턴: 에너미 턴. 1턴에서 암시한 행동과 하수인의 자동 공격을 처리하고 라운드를 마무리한다."""
    session = _get_battle_for_update(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="전투를 찾을 수 없습니다.")
    if session.status != "in_progress":
        raise HTTPException(status_code=400, detail="이미 종료된 전투입니다.")
    if session.phase != "enemy":
        raise HTTPException(status_code=400, detail="지금은 에너미 턴이 아닙니다.")

    round_no = session.round
    participants = [dict(p) for p in session.participants]
    enemies = _normalized_battle_enemies(session.enemies)
    summons = [dict(s) for s in session.summons]
    for p in participants:
        _ensure_combatant_snapshot_defaults(p)
    for enemy in enemies:
        _ensure_enemy_snapshot_defaults(enemy)

    # 실전은 "이전 턴 다시 진행하기"를 위해 이 턴의 행동이 반영되기 전 상태를 남겨둔다.
    if session.mode == "real":
        session.round_snapshots = list(session.round_snapshots) + [{
            "round": round_no,
            "phase": "enemy",
            "participants": [dict(p) for p in participants],
            "enemies": [dict(e) for e in enemies],
            "summons": [dict(s) for s in summons],
            "pending_enemy_actions": [dict(a) for a in session.pending_enemy_actions],
            "item_usages": [],
        }]

    events: list[str] = ["👹 에너미의 행동!"]
    _apply_minion_phase(participants, enemies, summons, round_no, "enemy", events)
    calculations: dict[str, str] = {}

    by_char_id = {p["character_id"]: p for p in participants}
    enemies_by_id = {e["enemy_id"]: e for e in enemies}
    environment_by_id = (
        {env.id: env for env in db.query(Environment).filter(Environment.chapter == session.chapter).all()}
        if session.chapter else {}
    )
    protect_map = _build_protect_map(participants)

    def hit(
        attacker: dict,
        target: dict,
        base: float,
        base_formula: str,
    ) -> tuple[dict, int, int, bool, list[dict], str]:
        """방어 지정 대상이 있으면 방어자가 대신 맞고, 반격 버프가 있으면 즉시 처리한다."""
        protector_id = protect_map.get(target["character_id"])
        recipient = target
        redirected = False
        if protector_id is not None and protector_id != target["character_id"]:
            protector = by_char_id.get(protector_id)
            if protector is not None and _combatant_active(protector):
                recipient = protector
                redirected = True
        counter_effects = _counter_effects_for_target(recipient)
        extra_reduction = sum(float(effect.get("damage_reduction", 0.0)) for effect in counter_effects)
        # 피해 감소율(dmg_r)은 방어 행동을 취했을 때만 적용된다. 반격 태세 등 별도 버프의 감소율(extra_reduction)은 무관하게 항상 적용된다.
        base_reduction = recipient["dmg_r"] if recipient["defending"] else 0.0
        total_reduction = min(0.95, max(0.0, base_reduction + extra_reduction))
        dmg = _floor_amount(base * (1 - total_reduction))
        damage_formula = (
            f"floor(({base_formula}) × "
            f"(1 - 총 피해 감소율 {_formula_number(total_reduction)}))"
        )
        if recipient["defending"]:
            effective_defense = _eff_def(recipient)
            dmg = max(0, dmg - effective_defense)
            damage_formula = (
                f"max(최소 피해 0, {damage_formula} - "
                f"유효 방어력 {_formula_number(effective_defense)})"
            )
        shield_before = recipient["shield"]
        dmg, absorbed = _apply_hit(recipient, dmg)
        damage_formula = (
            f"max(최소 피해 0, {damage_formula} - "
            f"보호막 {_formula_number(shield_before)})"
        )
        counter_results: list[dict] = []
        for effect in counter_effects:
            if attacker["hp"] <= 0:
                break
            counter_actor = by_char_id.get(effect.get("source_character_id"))
            # 반격 시점의 시전자 능력치를 쓰되, 시전자가 세션에서 빠졌으면 부여 당시 스냅샷으로 계산한다.
            def counter_stat(actor_key: str, snapshot_key: str, fallback: float) -> float:
                if counter_actor is not None:
                    return float(counter_actor[actor_key])
                return float(effect.get(snapshot_key, fallback))

            counter_atk = counter_stat("atk", "counter_atk", recipient["atk"])
            counter_atk_p = counter_stat("atk_p", "counter_atk_p", 0.0)
            counter_def = counter_stat("def", "counter_def", recipient["def"])
            counter_def_p = counter_stat("def_p", "counter_def_p", 0.0)
            counter_def_eff = counter_stat("def_eff", "counter_def_eff", 0.0)
            counter_eff_true = counter_stat("skill_eff_true", "counter_skill_eff_true", 0.0)
            counterattacker_name = str(
                counter_actor["name"] if counter_actor is not None else effect.get("source_name") or recipient["name"]
            )
            counter_multiplier = float(effect.get("counter_damage", 2.0))
            counter_eff_fixed = float(effect.get("skill_eff_fixed", 0.0))
            counter_damage_amp = (
                _consume_outgoing_damage_amplification(counter_actor) if counter_actor is not None else 0.0
            )
            counter_damage = max(
                0,
                _floor_amount(
                    (
                        (
                            counter_atk * (1 + counter_atk_p)
                            + counter_def * (1 + counter_def_p) * (1 + counter_def_eff)
                        )
                        * counter_multiplier
                        * (1 + counter_eff_fixed)
                        + counter_eff_true
                    )
                    * (1 + counter_damage_amp)
                ),
            )
            if counter_damage <= 0:
                continue
            dealt, overkill = _apply_damage_to_enemy(attacker, counter_damage)
            counter_results.append({
                "skill_name": effect.get("skill_name") or "반격",
                "counterattacker_name": counterattacker_name,
                "damage": dealt,
                "enemy_hp": attacker["hp"],
                "enemy_max_hp": attacker["max_hp"],
                "overkill": overkill,
                "formula": (
                    f"min(floor(((공격력 {_formula_number(counter_atk)} × "
                    f"(1 + 공격력 증폭 {_formula_number(counter_atk_p)}) + "
                    f"방어력 {_formula_number(counter_def)} × "
                    f"(1 + 방어력 증폭 {_formula_number(counter_def_p)}) × "
                    f"(1 + 방어 효율 {_formula_number(counter_def_eff)})) × "
                    f"기술 위력 {_formula_number(counter_multiplier)} × "
                    f"(1 + 기술 효율 비례 {_formula_number(counter_eff_fixed)}) + "
                    f"기술 효율 고정 {_formula_number(counter_eff_true)}) × "
                    f"(1 + 피해 증폭 {_formula_number(counter_damage_amp)})), "
                    f"남은 체력 {_formula_number(attacker['hp'] + dealt)})"
                ),
            })
        return recipient, dmg, absorbed, redirected, counter_results, damage_formula

    # 하수인는 행동 암시 턴에 이미 소환되므로, 이번 라운드에 소환된 하수인도 곧바로 공격한다.
    attacking_summons = [s for s in summons if s["hp"] > 0 and s.get("action_type", "attack") == "attack"]

    for enemy_action in session.pending_enemy_actions:
        enemy = enemies_by_id.get(enemy_action.get("enemy_id"))
        if not enemy or enemy["hp"] <= 0:
            continue

        skill_index = enemy_action.get("skill_index")
        skill = None
        if skill_index is not None and 0 <= skill_index < len(enemy["skills"]):
            skill = enemy["skills"][skill_index]

        if enemy_action.get("kind") == "attack" and skill and skill["skill_type"] != "소환":
            is_aoe = _enemy_skill_is_aoe(skill)
            if is_aoe:
                targets = [p for p in participants if _combatant_targetable(p, round_no)]
            else:
                target_ids = enemy_action.get("target_character_ids") or []
                targets = [
                    by_char_id[cid] for cid in target_ids
                    if cid in by_char_id and _combatant_targetable(by_char_id[cid], round_no)
                ]
                if not targets:
                    # 암시 이후 대상이 전부 기절/퇴각했다면 지금 상태 기준으로 다시 고른다.
                    targets = _select_enemy_skill_targets(
                        participants,
                        round_no=round_no,
                        target_count=len(target_ids) if skill.get("manual_target_count") else max(1, skill["target_count"]),
                        auto_target_mode=skill.get("auto_target_mode", "attention"),
                    )
            if skill["skill_type"] == "지속 디버프":
                stat = skill.get("debuff_stat", "atk")
                amount = skill.get("debuff_amount", 0)
                ratio_stat = ITEM_EFFECT_STAT_TYPES.get(stat) is float
                for target in targets:
                    applied = _add_combat_stat_stack(target, source=f"enemy:{enemy['enemy_id']}:skill:{skill_index}", name=skill["name"], stat=stat,
                        amount=amount / 100 if ratio_stat else amount, percent=False, stackable=skill.get("debuff_stackable", False))
                    events.append(f"🔻 {enemy['name']}의 {skill['name']} → {target['name']} {BATTLE_ITEM_EFFECT_LABELS.get(stat, stat)} -{amount}{'%' if ratio_stat else ''}{' (이미 적용 또는 방지)' if not applied else ''}")
                continue
            if skill["skill_type"] == "환경":
                environment = environment_by_id.get(int(skill.get("environment_id") or 0))
                if environment is None:
                    events.append(f"⚠️ {enemy['name']}의 {skill['name']} 발동 실패 · 환경 없음")
                    continue
                stack_delta = max(1, int(skill.get("environment_stack_count") or 1))
                events.append(f"🌫️ {enemy['name']}의 {skill['name']} → {environment.name} +{stack_delta} 스택")
                if not targets:
                    events.append("　→ 대상 없음")
                    continue
                for target in targets:
                    previous_stacks, stacks = _apply_environment_stack_delta(
                        target,
                        environment_id=environment.id,
                        stack_delta=stack_delta,
                        stackable=environment.stackable,
                        max_stacks=environment.max_stacks,
                    )
                    gained = max(0, stacks - previous_stacks)
                    if gained > 0:
                        events.append(f"　→ {target['name']} · +{gained} 스택 [{environment.name} {stacks}]")
                    else:
                        events.append(f"　→ {target['name']} · 변화 없음 [{environment.name} {stacks}]")
                continue
            damage_penalty = _consume_one_time_outgoing_damage_penalty(enemy)
            base = max(0.0, enemy["attack"] * skill["damage_percent"] / 100 * (1 - damage_penalty) * (1 + enemy.get("damage_bonus", 0)))
            base_formula = (
                f"공격력 {_formula_number(enemy['attack'])} × "
                f"기술 피해율 {_formula_number(skill['damage_percent'] / 100)} × "
                f"(1 - 공격력 감소율 {_formula_number(damage_penalty)}) × "
                f"(1 + 피해량 증가율 {_formula_number(enemy.get('damage_bonus', 0))})"
            )
            newly_downed_names: list[str] = []
            for t in targets:
                recipient, dmg, absorbed, redirected, counter_results, damage_formula = hit(
                    enemy, t, base, base_formula
                )
                redirect_note = f" (→ {recipient['name']}이(가) 대신 방어)" if redirected else ""
                events.append(
                    f"🔥 {enemy['name']}의 {skill['name']} → {t['name']}{redirect_note} {dmg} 피해"
                    f"{f'(보호막 {absorbed} 흡수)' if absorbed > 0 else ''} · {recipient['name']} [{recipient['hp']}/{recipient['max_hp']}]"
                )
                calculations[events[-1]] = damage_formula
                if recipient["hp"] == 0 and not recipient["downed"]:
                    recipient["downed"] = True
                    newly_downed_names.append(recipient["name"])
                for counter in counter_results:
                    events.append(
                        f"↩️ {counter['counterattacker_name']}의 {counter['skill_name']} → {enemy['name']} "
                        f"{counter['damage']} 피해 · [{counter['enemy_hp']}/{counter['enemy_max_hp']}]"
                        f"{' (오버킬)' if counter['overkill'] else ''}"
                    )
                    calculations[events[-1]] = counter["formula"]
                if enemy["hp"] <= 0:
                    events.append(f"💀 {enemy['name']} 격파")
                    break
            if newly_downed_names:
                events.append(f"💫 {', '.join(sorted(newly_downed_names))} 기절")
            if all(value["hp"] <= 0 for value in enemies):
                break
        elif enemy_action.get("kind") == "summon":
            pass  # 하수인는 행동 암시 턴에 이미 소환되었고, 이번 라운드 공격은 아래 하수인 행동에서 처리된다.
        else:
            events.append(f"💤 {enemy['name']} 무반응")

    # 하수인 행동 (단일 대상 자동 공격)
    if not all(enemy["hp"] <= 0 for enemy in enemies):
        for summon in attacking_summons:
            targets = [p for p in participants if _combatant_targetable(p, round_no)]
            if not targets:
                break
            target = random.choice(targets)
            recipient, dmg, absorbed, redirected, counter_results, damage_formula = hit(
                summon, target, summon["attack"], f"공격력 {_formula_number(summon['attack'])}"
            )
            redirect_note = f" (→ {recipient['name']}이(가) 대신 방어)" if redirected else ""
            events.append(
                f"👹 하수인 {_summon_log_name(summon)} 공격 → {target['name']}{redirect_note} {dmg} 피해"
                f"{f'(보호막 {absorbed} 흡수)' if absorbed > 0 else ''} · "
                f"{recipient['name']} [{recipient['hp']}/{recipient['max_hp']}]"
            )
            calculations[events[-1]] = damage_formula
            if recipient["hp"] == 0 and not recipient["downed"]:
                recipient["downed"] = True
                events.append(f"💫 {recipient['name']} 기절")
            for counter in counter_results:
                events.append(
                    f"↩️ {counter['counterattacker_name']}의 {counter['skill_name']} → 하수인 {_summon_log_name(summon)} "
                    f"{counter['damage']} 피해"
                )
                calculations[events[-1]] = counter["formula"]
            if summon["hp"] <= 0:
                events.append(f"💀 하수인 {_summon_log_name(summon)} 처치")

    victory = all(e["hp"] <= 0 for e in enemies)
    no_active_left = not any(_combatant_active(p) for p in participants)

    if victory:
        session.status = "victory"
        events.append("🏆 전투 승리")
    elif no_active_left:
        session.status = "defeat"
        events.append("💀 전투 패배")
    else:
        session.round = round_no + 1
        session.phase = "telegraph"

    session.pending_enemy_actions = []
    session.participants = participants
    session.enemies = enemies
    session.summons = [s for s in summons if s["hp"] > 0]
    session.log = list(session.log) + [{
        "round": round_no,
        "phase": "enemy",
        "events": events,
        "calculations": calculations,
    }]

    if session.status != "in_progress" and session.mode == "real":
        _finalize_real_battle(db, participants)

    return _commit_battle_session(db, session)


_TURN_PHASE_ORDER = {"telegraph": 0, "ally": 1, "enemy": 2}


def undo_last_turn(db: Session, session_id: int) -> BattleSessionRead:
    """직전에 진행한 턴(적 행동 암시/아군 턴/에너미 턴)을 되돌린다: 그 턴 시작 시점 상태로 복원하고,
    그 턴에 소모한 아이템 사용 횟수도 함께 복구하고, 로그를 지워 다시 진행할 수 있게 한다."""
    session = _get_battle_for_update(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="전투를 찾을 수 없습니다.")
    if session.mode != "real":
        raise HTTPException(status_code=400, detail="실전 전투만 턴을 되돌릴 수 있습니다.")
    if session.status != "in_progress":
        raise HTTPException(status_code=400, detail="이미 종료된 전투는 되돌릴 수 없습니다.")

    snapshots = list(session.round_snapshots)
    if not snapshots:
        raise HTTPException(status_code=400, detail="되돌릴 이전 턴이 없습니다.")
    snapshot = snapshots[-1]

    item_usages = [entry for entry in (snapshot.get("item_usages") or []) if isinstance(entry, dict)]
    if item_usages:
        _revert_item_usages(db, item_usages)
        reverted_ids = {entry.get("item_usage_id") for entry in item_usages}
        rollback_state = _get_battle_rollback_state(session)
        if rollback_state.get("version") == 1:
            rollback_state["item_usages"] = [
                entry for entry in rollback_state["item_usages"]
                if entry.get("item_usage_id") not in reverted_ids
            ]
            session.rollback_state = rollback_state

    # 이 배포 전에 시작된 실전 전투는 스냅샷에 phase/pending_enemy_actions 키가 없을 수 있다(구버전 호환).
    target_phase = snapshot.get("phase", "telegraph")
    target_round = snapshot["round"]
    session.participants = snapshot["participants"]
    session.enemies = snapshot["enemies"]
    session.summons = snapshot["summons"]
    session.pending_enemy_actions = snapshot.get("pending_enemy_actions", [])
    session.round = target_round
    session.phase = target_phase
    cutoff = (target_round, _TURN_PHASE_ORDER[target_phase])
    session.log = [
        entry for entry in session.log
        if (entry["round"], _TURN_PHASE_ORDER[entry["phase"]]) < cutoff
    ]
    session.round_snapshots = snapshots[:-1]

    return _commit_battle_session(db, session)


def _get_battle_reward_or_404(db: Session, session_id: int, *, for_update: bool = False) -> BattleSession:
    """보상 미리보기는 모의전에서도 볼 수 있다(실제 지급은 send_battle_rewards에서 실전만 허용)."""
    query = db.query(BattleSession).filter(BattleSession.id == session_id)
    session = query.with_for_update().first() if for_update else query.first()
    if not session:
        raise HTTPException(status_code=404, detail="전투를 찾을 수 없습니다.")
    if session.status == "in_progress":
        raise HTTPException(status_code=400, detail="전투가 끝난 뒤에만 보상을 확인·지급할 수 있습니다.")
    return session


def _compute_battle_rewards(db: Session, session: BattleSession) -> list[BattleRewardEntry]:
    """실제 행동 참가자의 승리·행동 보상 + 전원보상(member 연결된 모든 캐릭터 경험치)."""
    chapter = db.query(Chapter).filter(Chapter.name == session.chapter).first() if session.chapter else None
    victory_gold_rate = chapter.battle_victory_reward_gold if chapter else 0
    action_gold_rate = chapter.battle_action_reward_gold if chapter else 0
    participation_exp = chapter.battle_participation_reward_exp if chapter else 0

    participant_ids = [p["character_id"] for p in session.participants]
    participant_names = {
        c.id: c.name for c in db.query(Character.id, Character.name).filter(Character.id.in_(participant_ids)).all()
    } if participant_ids else {}

    entries: dict[int, BattleRewardEntry] = {}
    for p in session.participants:
        action_rounds = _meaningful_action_reward_rounds(p, session)
        victory_gold = victory_gold_rate if action_rounds > 0 else 0
        action_gold = action_rounds * action_gold_rate
        entries[p["character_id"]] = BattleRewardEntry(
            character_id=p["character_id"],
            character_name=participant_names.get(p["character_id"], p.get("name", "")),
            victory_gold=victory_gold,
            action_rounds=action_rounds,
            action_gold=action_gold,
            total_gold=victory_gold + action_gold,
        )

    member_characters = db.query(Character).filter(Character.member_id.isnot(None)).all()
    for character in member_characters:
        entry = entries.get(character.id)
        if entry is None:
            entry = BattleRewardEntry(character_id=character.id, character_name=character.name)
            entries[character.id] = entry
        entry.participation_exp = participation_exp

    return sorted(
        entries.values(),
        key=lambda e: (-(e.total_gold + e.participation_exp), e.character_name),
    )


def get_battle_reward_preview(db: Session, session_id: int) -> BattleRewardPreview:
    session = _get_battle_reward_or_404(db, session_id)
    already_sent = db.query(Reward.id).filter(Reward.type == "battle", Reward.source_id == session_id).first() is not None
    entries = _compute_battle_rewards(db, session)
    return BattleRewardPreview(session_id=session.id, chapter=session.chapter, already_sent=already_sent, entries=entries)


def send_battle_rewards(db: Session, session_id: int) -> BattleRewardPreview:
    session = _get_battle_reward_or_404(db, session_id, for_update=True)
    if session.mode != "real":
        raise HTTPException(status_code=400, detail="실전 전투만 보상을 지급할 수 있습니다.")
    if db.query(Reward.id).filter(Reward.type == "battle", Reward.source_id == session_id).first() is not None:
        raise HTTPException(status_code=400, detail="이미 지급된 보상입니다.")
    rollback_state = _get_battle_rollback_state(session)
    if rollback_state.get("version") != 1:
        raise HTTPException(status_code=400, detail="이 실전 전투는 보상 롤백을 지원하지 않는 이전 기록입니다.")

    entries = _compute_battle_rewards(db, session)
    payable_ids = [e.character_id for e in entries if e.total_gold > 0 or e.participation_exp > 0]
    characters = (
        {c.id: c for c in db.query(Character).filter(Character.id.in_(payable_ids)).all()}
        if payable_ids else {}
    )

    for entry in entries:
        if entry.total_gold <= 0 and entry.participation_exp <= 0:
            continue
        character = characters.get(entry.character_id)
        if character is None:
            continue
        rollback_state = _remember_reward_character_state(rollback_state, character)

        reward_items: list[dict] = []
        if entry.total_gold > 0:
            character.gold += entry.total_gold
            reward_items.append({"type": "gold", "amount": entry.total_gold})
        if entry.participation_exp > 0:
            character.exp += entry.participation_exp
            reward_items.append({"type": "experience", "amount": entry.participation_exp})

        db.add(Reward(
            type="battle",
            character_id=entry.character_id,
            source_id=session.id,
            reward_items=reward_items,
            rewarded_at=_today(),
        ))
        if entry.participation_exp > 0:
            _apply_growth_from_exp(db, character, source_id=session.id)

    session.rollback_state = rollback_state
    db.commit()
    return BattleRewardPreview(session_id=session.id, chapter=session.chapter, already_sent=True, entries=entries)


def rollback_battle_session(db: Session, session_id: int) -> None:
    session = _get_battle_for_update(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="전투를 찾을 수 없습니다.")
    if session.mode != "real":
        raise HTTPException(status_code=400, detail="실전 전투만 롤백할 수 있습니다.")

    rollback_state = _get_battle_rollback_state(session)
    if rollback_state.get("version") != 1:
        raise HTTPException(status_code=400, detail="이 실전 전투는 자동 롤백을 지원하지 않는 이전 기록입니다.")

    battle_characters = {
        int(character_id): snapshot
        for character_id, snapshot in (rollback_state.get("battle_characters") or {}).items()
        if isinstance(snapshot, dict)
    }
    reward_characters = {
        int(character_id): snapshot
        for character_id, snapshot in (rollback_state.get("reward_characters") or {}).items()
        if isinstance(snapshot, dict)
    }
    item_usages = [
        entry for entry in (rollback_state.get("item_usages") or [])
        if isinstance(entry, dict)
    ]

    reward_rows = db.query(Reward).filter(
        Reward.type.in_(("battle", "growth")),
        Reward.source_id == session.id,
    ).all()
    reward_row_ids = [reward.id for reward in reward_rows]

    character_ids = sorted({
        *battle_characters.keys(),
        *reward_characters.keys(),
        *(int(entry["character_id"]) for entry in item_usages if entry.get("character_id") is not None),
    })
    characters_by_id = {
        character.id: character
        for character in db.query(Character).filter(Character.id.in_(character_ids)).all()
    } if character_ids else {}

    reward_deltas: dict[int, dict[str, int]] = {}
    for reward in reward_rows:
        delta = reward_deltas.setdefault(
            reward.character_id,
            {"gold": 0, "experience": 0, "growth_lv": 0, "growth_ap": 0},
        )
        for entry in reward.reward_items or []:
            entry_type = entry.get("type")
            amount = int(entry.get("amount", 0) or 0)
            if reward.type == "battle":
                if entry_type == "gold":
                    delta["gold"] += amount
                elif entry_type == "experience":
                    delta["experience"] += amount
            elif reward.type == "growth":
                if entry_type == "lv":
                    delta["growth_lv"] += amount
                elif entry_type == "ap":
                    delta["growth_ap"] += amount

    for character_id, delta in reward_deltas.items():
        character = characters_by_id.get(character_id)
        if character is None:
            continue
        character.gold -= delta["gold"]
        character.lv = max(1, character.lv - delta["growth_lv"])
        character.ap -= delta["growth_ap"]
        character.exp += delta["growth_lv"] * GROWTH_EXP_PER_LEVEL
        character.exp -= delta["experience"]

    for character_id, snapshot in battle_characters.items():
        character = characters_by_id.get(character_id)
        if character is None:
            continue
        character.hp = int(snapshot.get("hp", character.hp))
        character.mp = int(snapshot.get("mp", character.mp))

    _revert_item_usages(db, item_usages)

    if reward_row_ids:
        db.query(Reward).filter(Reward.type == "revoke", Reward.source_id.in_(reward_row_ids)).delete(synchronize_session=False)
        db.query(Reward).filter(Reward.id.in_(reward_row_ids)).delete(synchronize_session=False)

    db.delete(session)
    db.commit()


# ── Skill Tree ───────────────────────────────────────────────────────────────

def _to_skill_node_read(node: SkillNode) -> SkillNodeRead:
    return SkillNodeRead(
        id=node.id,
        book=node.book,
        branch=node.branch,
        col=node.col,
        tier=node.tier,
        tier_label=TIER_LABELS.get(node.tier, str(node.tier)),
        default_name=_resolved_skill_node_name(node),
        image_url=node.image_url,
        effects=node.effects or [],
        trigger_type=_resolved_skill_node_value(node, "trigger_type"),
        category=_resolved_skill_node_value(node, "category"),
        stackable=_resolved_skill_node_value(node, "stackable"),
        cost=_resolved_skill_node_value(node, "cost"),
        power=_resolved_skill_node_value(node, "power"),
        powers=_resolved_skill_node_powers(node),
        power_slots=_skill_node_power_slots(node),
        target=_resolved_skill_node_value(node, "target"),
        target_side=_resolved_skill_node_value(node, "target_side"),
        activation_order=_resolved_skill_node_value(node, "activation_order"),
        cleanse_count=_resolved_skill_node_value(node, "cleanse_count"),
        has_cleanse_count=skill_has_cleanse_count(_resolved_skill_node_value(node, "var_name")),
        formula=_resolved_skill_node_value(node, "formula"),
        description=_resolved_skill_node_value(node, "description"),
        is_placeholder=bool(_resolved_skill_node_value(node, "is_placeholder")),
        is_public=node.is_public,
    )


def _seed_skill_tree_if_empty(db: Session, book: str) -> None:
    if db.query(SkillNode).filter(SkillNode.book == book).first():
        return
    specs = build_skill_node_specs(book)
    if not specs:
        return
    for spec in specs:
        db.add(SkillNode(book=book, **spec))
    db.commit()
    if _normalize_duplicate_skill_node_names(db, book=book):
        db.commit()


def get_skill_nodes(db: Session, book: str) -> list[SkillNodeRead]:
    """이름 중복 정리는 쓰기 경로(_seed_skill_tree_if_empty의 최초 시딩, update_skill_node의 이름 변경)에서만
    수행한다. 읽을 때마다 노드 전체를 다시 스캔하며 정규화를 재실행할 필요가 없다."""
    _seed_skill_tree_if_empty(db, book)
    nodes = (
        db.query(SkillNode)
        .filter(SkillNode.book == book)
        .order_by(SkillNode.tier.asc(), SkillNode.branch.asc(), SkillNode.col.asc())
        .all()
    )
    return [_to_skill_node_read(n) for n in nodes]


def update_skill_node(db: Session, node_id: int, data: SkillNodeUpdate) -> SkillNodeRead:
    node = db.get(SkillNode, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="기술을 찾을 수 없습니다.")
    node.default_name = data.default_name.strip()
    if "description" in data.model_fields_set:
        node.description = data.description.strip() if data.description else None
    for field in (
        "trigger_type",
        "category",
        "stackable",
        "cost",
        "power",
        "target",
        "target_side",
        "activation_order",
        "cleanse_count",
    ):
        if field in data.model_fields_set:
            setattr(node, field, getattr(data, field))
    if "cleanse_count" in data.model_fields_set and not skill_has_cleanse_count(node.var_name):
        raise HTTPException(status_code=400, detail="이 기술에는 약화 해제 수를 설정할 수 없습니다.")
    if "powers" in data.model_fields_set:
        slot_keys = {slot["key"] for slot in skill_power_slots(node.var_name)}
        unknown = sorted(set(data.powers) - slot_keys)
        if unknown:
            raise HTTPException(status_code=400, detail=f"이 기술에 없는 기술 위력 항목입니다: {', '.join(unknown)}")
        node.powers = {key: float(value) for key, value in data.powers.items() if key != "power"}
    _normalize_duplicate_skill_node_names(db, book=node.book)
    db.commit()
    invalidate_active_battle_skills_cache()
    db.refresh(node)
    return _to_skill_node_read(node)


def update_skill_visibility(db: Session, data: SkillVisibilityUpdate) -> list[SkillNodeRead]:
    for book in ("용맹의 서", "불굴의 서", "헌신의 서", "탐구의 서"):
        _seed_skill_tree_if_empty(db, book)
    nodes = (
        db.query(SkillNode)
        .order_by(SkillNode.book.asc(), SkillNode.tier.asc(), SkillNode.branch.asc(), SkillNode.col.asc())
        .all()
    )
    for node in nodes:
        node.is_public = node.tier <= data.max_public_tier
    _normalize_duplicate_skill_node_names(db)
    db.commit()
    invalidate_active_battle_skills_cache()
    return [_to_skill_node_read(node) for node in nodes]


def _find_parent_node(db: Session, node: SkillNode) -> SkillNode | None:
    if node.tier == 0:
        return None
    if node.tier == 1:
        return db.query(SkillNode).filter(SkillNode.book == node.book, SkillNode.tier == 0).first()
    return (
        db.query(SkillNode)
        .filter(
            SkillNode.book == node.book,
            SkillNode.branch == node.branch,
            SkillNode.col == (None if node.tier == 2 else node.col),
            SkillNode.tier == node.tier - 1,
        )
        .first()
    )


def _to_character_skill_node_read(node: SkillNode, unlock: CharacterSkillUnlock | None, character: Character) -> CharacterSkillNodeRead:
    is_public = node.is_public
    unlocked = node.tier == 0 or unlock is not None
    return CharacterSkillNodeRead(
        id=node.id,
        book=node.book,
        branch=node.branch,
        col=node.col,
        tier=node.tier,
        tier_label=TIER_LABELS.get(node.tier, str(node.tier)),
        default_name=_resolved_skill_node_name(node) if is_public else "비공개 기술",
        image_url=(unlock.custom_image_url if unlock and unlock.custom_image_url else node.image_url) if is_public else None,
        effects=(node.effects or []) if is_public else [],
        trigger_type=_resolved_skill_node_value(node, "trigger_type") if is_public else None,
        category=_resolved_skill_node_value(node, "category") if is_public else None,
        stackable=_resolved_skill_node_value(node, "stackable") if is_public else None,
        cost=_resolved_skill_node_value(node, "cost") if is_public else None,
        power=_resolved_skill_node_value(node, "power") if is_public else None,
        powers=_resolved_skill_node_powers(node) if is_public else {},
        power_slots=_skill_node_power_slots(node) if is_public else [],
        target=_resolved_skill_node_value(node, "target") if is_public else None,
        target_side=_resolved_skill_node_value(node, "target_side") if is_public else None,
        activation_order=_resolved_skill_node_value(node, "activation_order") if is_public else None,
        cleanse_count=_resolved_skill_node_value(node, "cleanse_count") if is_public else None,
        has_cleanse_count=skill_has_cleanse_count(_resolved_skill_node_value(node, "var_name")) if is_public else False,
        formula=_resolved_skill_node_value(node, "formula") if is_public else None,
        description=_resolved_skill_node_value(node, "description") if is_public else None,
        is_placeholder=bool(_resolved_skill_node_value(node, "is_placeholder")) if is_public else False,
        is_public=is_public,
        unlocked=unlocked,
        custom_name=unlock.custom_name if unlock and is_public else None,
        custom_image_url=unlock.custom_image_url if unlock and is_public else None,
        display_name=_skill_display_name(
            node,
            skill_lv=character.skill_lv,
            custom_name=unlock.custom_name if unlock and unlock.custom_name else None,
        ) if is_public else "비공개 기술",
        unlocked_at=unlock.unlocked_at if unlock else None,
    )


def get_character_skill_tree(db: Session, character_id: int, book: str) -> CharacterSkillTreeRead:
    """이름 중복 정리는 쓰기 경로에서만 수행한다(get_skill_nodes 주석 참고). 캐릭터 정보 화면은
    서 4개를 병렬로 조회하므로, 여기서 매번 정규화 스캔을 반복하면 그 비용이 4배로 늘어난다."""
    character = _get_character_or_404(db, character_id)

    _seed_skill_tree_if_empty(db, book)

    nodes = (
        db.query(SkillNode)
        .filter(SkillNode.book == book)
        .order_by(SkillNode.tier.asc(), SkillNode.branch.asc(), SkillNode.col.asc())
        .all()
    )
    unlocks = (
        db.query(CharacterSkillUnlock)
        .join(SkillNode, CharacterSkillUnlock.node_id == SkillNode.id)
        .filter(CharacterSkillUnlock.character_id == character.id, SkillNode.book == book)
        .all()
    )
    unlock_by_node = {u.node_id: u for u in unlocks}
    latest_unlock = max(unlocks, key=lambda u: u.unlocked_at, default=None)

    node_reads = [_to_character_skill_node_read(node, unlock_by_node.get(node.id), character) for node in nodes]

    return CharacterSkillTreeRead(
        book=book,
        character_sp=character.sp,
        sp_cost_to_unlock=get_level_grade_stats(character.lv)["sp_cost"],
        latest_unlocked_node_id=latest_unlock.node_id if latest_unlock else None,
        nodes=node_reads,
    )


def unlock_character_skill_node(db: Session, character_id: int, node_id: int) -> CharacterSkillTreeRead:
    character = _get_character_or_404(db, character_id)
    node = db.get(SkillNode, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="기술을 찾을 수 없습니다.")
    if node.tier == 0:
        raise HTTPException(status_code=400, detail="서 아이덴티티 기술은 자동으로 활성화됩니다.")
    if not node.is_public:
        raise HTTPException(status_code=400, detail="아직 공개되지 않은 기술입니다.")

    _seed_skill_tree_if_empty(db, node.book)

    # 같은 캐릭터의 동시 습득 요청도 서/분기 선택과 SP 차감을 순서대로 검사한다.
    character = (
        db.query(Character)
        .filter(Character.id == character_id)
        .populate_existing()
        .with_for_update()
        .one()
    )

    already = (
        db.query(CharacterSkillUnlock)
        .filter(CharacterSkillUnlock.character_id == character.id, CharacterSkillUnlock.node_id == node.id)
        .first()
    )
    if already:
        raise HTTPException(status_code=400, detail="이미 습득한 기술입니다.")

    other_book_chosen = (
        db.query(CharacterSkillUnlock)
        .join(SkillNode, CharacterSkillUnlock.node_id == SkillNode.id)
        .filter(
            CharacterSkillUnlock.character_id == character.id,
            SkillNode.tier > 0,
            SkillNode.book != node.book,
        )
        .first()
    )
    if other_book_chosen:
        raise HTTPException(status_code=400, detail="이미 다른 서의 기술을 습득했습니다. 하나의 서만 선택할 수 있습니다.")

    parent = _find_parent_node(db, node)
    if parent and parent.tier > 0:
        parent_unlocked = (
            db.query(CharacterSkillUnlock)
            .filter(CharacterSkillUnlock.character_id == character.id, CharacterSkillUnlock.node_id == parent.id)
            .first()
        )
        if not parent_unlocked:
            raise HTTPException(status_code=400, detail="이전 단계를 먼저 습득해야 합니다.")

    if node.tier >= 1:
        other_branch_chosen = (
            db.query(CharacterSkillUnlock)
            .join(SkillNode, CharacterSkillUnlock.node_id == SkillNode.id)
            .filter(
                CharacterSkillUnlock.character_id == character.id,
                SkillNode.book == node.book,
                SkillNode.tier > 0,
                SkillNode.branch != node.branch,
            )
            .first()
        )
        if other_branch_chosen:
            raise HTTPException(status_code=400, detail="이 서에서는 이미 다른 계열을 선택했습니다.")

    if node.tier >= 2:
        other_column_chosen = (
            db.query(CharacterSkillUnlock)
            .join(SkillNode, CharacterSkillUnlock.node_id == SkillNode.id)
            .filter(
                CharacterSkillUnlock.character_id == character.id,
                SkillNode.book == node.book,
                SkillNode.branch == node.branch,
                SkillNode.tier >= 2,
                SkillNode.col != node.col,
            )
            .first()
        )
        if other_column_chosen:
            raise HTTPException(status_code=400, detail="이미 다른 세부 경로를 선택했습니다.")

    cost = get_level_grade_stats(character.lv)["sp_cost"]
    if character.sp < cost:
        raise HTTPException(status_code=400, detail=f"SP가 부족합니다. (필요: {cost})")

    applied_effects = [dict(effect) for effect in (node.effects or [])]
    character.sp -= cost
    _apply_item_effects(character, applied_effects, sign=1)
    db.add(CharacterSkillUnlock(
        character_id=character.id,
        node_id=node.id,
        sp_spent=cost,
        applied_effects=applied_effects,
    ))
    db.commit()
    invalidate_active_battle_skills_cache([character.id])

    return get_character_skill_tree(db, character.id, node.book)


def _reset_character_skills(db: Session, character: Character) -> None:
    """기술을 기본(tier 0)으로 되돌리고, 강화 효과를 되돌리며, 소모한 SP를 전부 환급한다.

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
        character.sp += unlock.sp_spent
        db.delete(unlock)
    invalidate_active_battle_skills_cache([character.id])


def _get_character_skill_unlock_or_404(db: Session, character_id: int, node_id: int) -> tuple[SkillNode, CharacterSkillUnlock]:
    """루트(0단계)는 CharacterSkillUnlock 행이 없으므로 이 조회에서 자연히 걸러진다."""
    node = db.get(SkillNode, node_id)
    if not node or not node.is_public:
        raise HTTPException(status_code=400, detail="아직 공개되지 않은 기술입니다.")
    unlock = (
        db.query(CharacterSkillUnlock)
        .filter(CharacterSkillUnlock.character_id == character_id, CharacterSkillUnlock.node_id == node_id)
        .first()
    )
    if not unlock:
        raise HTTPException(status_code=400, detail="습득하지 않은 기술입니다.")
    return node, unlock


def rename_character_skill(db: Session, character_id: int, node_id: int, custom_name: str) -> CharacterSkillTreeRead:
    character = _get_character_or_404(db, character_id)
    node, unlock = _get_character_skill_unlock_or_404(db, character.id, node_id)
    unlock.custom_name = custom_name.strip() or None
    db.commit()
    invalidate_active_battle_skills_cache([character.id])
    return get_character_skill_tree(db, character.id, node.book)


def set_character_skill_image(db: Session, character_id: int, node_id: int, image_url: str) -> CharacterSkillTreeRead:
    character = _get_character_or_404(db, character_id)
    node, unlock = _get_character_skill_unlock_or_404(db, character.id, node_id)
    unlock.custom_image_url = image_url
    db.commit()
    invalidate_active_battle_skills_cache([character.id])
    return get_character_skill_tree(db, character.id, node.book)


def get_character_skill_unlock_image(db: Session, character_id: int, node_id: int) -> str | None:
    _, unlock = _get_character_skill_unlock_or_404(db, character_id, node_id)
    return unlock.custom_image_url
