from datetime import date, datetime, timezone
from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, JSON, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column
from app.db import Base


class Chapter(Base):
    __tablename__ = "chapters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    battle_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    image_url: Mapped[str | None] = mapped_column(String, nullable=True)
    music_url: Mapped[str | None] = mapped_column(String, nullable=True)
    # 이 챕터의 실전 전투가 끝났을 때 지급되는 보상 설정(전투 페이지 "보상 전송" 카드에서 사용).
    battle_victory_reward_gold: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    battle_action_reward_gold: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    battle_participation_reward_exp: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )


class Reward(Base):
    __tablename__ = "rewards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    type: Mapped[str] = mapped_column(String, nullable=False, index=True)  # "attendance" | "challenge"
    character_id: Mapped[int] = mapped_column(Integer, ForeignKey("characters.id"), nullable=False, index=True)
    source_id: Mapped[int | None] = mapped_column(Integer, nullable=True)  # attendance_record.id or challenge.id
    # 보상 이력에 표시할 커스텀 라벨(예: "OO의 치료"). 없으면 REWARD_TYPE_LABELS[type]을 사용한다.
    label: Mapped[str | None] = mapped_column(String, nullable=True)
    reward_items: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    rewarded_at: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )


class Member(Base):
    __tablename__ = "members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    login_id: Mapped[str] = mapped_column(String, nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(
        String,
        nullable=False,
        default="RUNNER",
        server_default=text("'RUNNER'"),
    )  # "RUNNER" | "ADMIN" | "STAFF" (러너 중 권한 탭 접근을 제외한 관리 권한을 부여받은 스텝)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )


class RefreshToken(Base):
    """7일짜리 refresh token. 로그아웃/재발급 시 revoked_at을 채워 무효화한다."""

    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    token: Mapped[str] = mapped_column(String, nullable=False, unique=True, index=True)
    member_id: Mapped[int] = mapped_column(Integer, ForeignKey("members.id"), nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )


class Character(Base):
    __tablename__ = "characters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    gold: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cp: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    # AP: 레벨업 시 지급되며 능력치(용기/인내/자애/지혜) 강화에 쓰인다.
    ap: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default=text("0"),
    )
    # SP: "기술 서적" 아이템 사용으로 얻으며 기술트리 습득에 쓰인다. AP와 별개의 화폐다.
    sp: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default=text("0"),
    )
    member_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("members.id"),
        nullable=True,
        unique=True,
        index=True,
    )
    faction: Mapped[str | None] = mapped_column(String, nullable=True)  # "공격" | "수비" | "치유"

    # 성장 등급 배지
    lv: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default=text("1"))
    rank: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default=text("1"))
    exp: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))

    # 적게 변하는 능력치 (온보딩 AP 투자)
    stat_courage: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    stat_endurance: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    stat_charity: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    stat_wisdom: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))

    # 체력 / 마나 (상태 바)
    hp: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    hp_max: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    hp_max_p: Mapped[float] = mapped_column(Float, nullable=False, default=0, server_default=text("0"))
    hp_regen_true: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    hp_regen_fixed: Mapped[float] = mapped_column(Float, nullable=False, default=0, server_default=text("0"))
    mp: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    mp_max: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    mp_regen: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))

    # 상세 능력치
    atk: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    atk_p: Mapped[float] = mapped_column(Float, nullable=False, default=0, server_default=text("0"))
    def_: Mapped[int] = mapped_column("def", Integer, nullable=False, default=0, server_default=text("0"))
    def_p: Mapped[float] = mapped_column(Float, nullable=False, default=0, server_default=text("0"))
    def_eff: Mapped[float] = mapped_column(Float, nullable=False, default=0, server_default=text("0"))
    attn: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    presence: Mapped[float] = mapped_column(Float, nullable=False, default=0, server_default=text("0"))
    heal_eff: Mapped[float] = mapped_column(Float, nullable=False, default=0, server_default=text("0"))
    sh: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    dmg_p: Mapped[float] = mapped_column(Float, nullable=False, default=0, server_default=text("0"))
    dmg_r: Mapped[float] = mapped_column(Float, nullable=False, default=0, server_default=text("0"))
    skill_lv: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    skill_eff_true: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    skill_eff_fixed: Mapped[float] = mapped_column(Float, nullable=False, default=0, server_default=text("0"))
    skill_cost: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    skill_target: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))

    # 관리자 전용 관리 플래그 (RUNNER에게는 노출되지 않음)
    caution: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    warning_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))

    # 관리자 전용 능력치 (RUNNER에게는 노출되지 않음)
    start_sh: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    revive_hp: Mapped[float] = mapped_column(Float, nullable=False, default=0.1, server_default=text("0.1"))
    act_time: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default=text("1"))
    over_heal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))

    image_url: Mapped[str | None] = mapped_column(String, nullable=True)  # Supabase Storage 공개 URL


class Item(Base):
    __tablename__ = "items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    price_gold: Mapped[int | None] = mapped_column(Integer, nullable=True)
    price_cp: Mapped[int | None] = mapped_column(Integer, nullable=True)
    description_user: Mapped[str] = mapped_column(String, nullable=False, default="")
    description_internal: Mapped[str] = mapped_column(String, nullable=False, default="")
    special_merchant: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    description_after_purchase: Mapped[str] = mapped_column(String, nullable=False, default="", server_default=text("''"))
    image_after_purchase_url: Mapped[str | None] = mapped_column(String, nullable=True)
    purchase_limit_per_character: Mapped[int | None] = mapped_column(Integer, nullable=True)
    purchase_limit_global: Mapped[int | None] = mapped_column(Integer, nullable=True)
    available_from_chapter: Mapped[str | None] = mapped_column(String, nullable=True)
    available_until_chapter: Mapped[str | None] = mapped_column(String, nullable=True)
    item_type: Mapped[str] = mapped_column(
        String, nullable=False, default="consumable", server_default=text("'consumable'")
    )  # "consumable"(일반 아이템 전용) | "companion" | "accessory"(특수 상인 아이템 전용)
    # 이 임무의 보상을 받은 캐릭터는 구매할 수 없다.
    restricted_mission_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("missions.id"), nullable=True
    )
    image_url: Mapped[str | None] = mapped_column(String, nullable=True)  # Supabase Storage 공개 URL
    effects: Mapped[list] = mapped_column(JSON, nullable=False, default=list)  # [{"stat": "atk", "delta": 5}, ...]
    # 챕터·재고와 무관하게 즉시 판매를 중단한다. 러너에게는 노출 자체를 하지 않는다.
    sale_paused: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    # 전투 중(아이템 사용 행동)에만 사용할 수 있다. 캐릭터 페이지의 보유 아이템 "사용" 버튼은 비활성화된다.
    battle_only: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )


class ShopState(Base):
    __tablename__ = "shop_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    is_open: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class CharacterItemState(Base):
    __tablename__ = "character_item_states"
    __table_args__ = (
        UniqueConstraint("character_id", "item_id", name="uq_character_item_state"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    character_id: Mapped[int] = mapped_column(Integer, ForeignKey("characters.id"), nullable=False, index=True)
    item_id: Mapped[int] = mapped_column(Integer, ForeignKey("items.id"), nullable=False, index=True)
    used_quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    equipped: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class SkillNode(Base):
    """기술트리 노드. `book`(용맹의 서/불굴의 서/헌신의 서/탐구의 서)은 캐릭터의 역할(Character.faction)과
    무관한 별개의 축이다 — 어떤 역할의 캐릭터든 4개 서 중 하나를 선택해 기술을 배울 수 있다."""

    __tablename__ = "skill_nodes"
    __table_args__ = (
        UniqueConstraint("book", "branch", "col", "tier", name="uq_skill_node_slot"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    book: Mapped[str] = mapped_column(String, nullable=False, index=True)  # "용맹의 서"|"불굴의 서"|"헌신의 서"|"탐구의 서"
    branch: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 0,1,2 (tier 0은 None)
    col: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 0,1 (tier 0,1은 None)
    tier: Mapped[int] = mapped_column(Integer, nullable=False)  # 0=서 아이덴티티(항상 활성), 1=1단계, 2~6=2~6단계
    default_name: Mapped[str] = mapped_column(String, nullable=False)
    image_url: Mapped[str | None] = mapped_column(String, nullable=True)  # Supabase Storage 공개 URL (없으면 기본 아이콘)
    effects: Mapped[list] = mapped_column(JSON, nullable=False, default=list)  # [{"stat": "atk", "delta": 5}, ...]

    # skill.xlsx "기술 종류" 시트 기반 상세 메타데이터. var_name은 내부 참조용으로 API에는 노출하지 않는다.
    trigger_type: Mapped[str | None] = mapped_column(String, nullable=True)  # 발동 타입 (즉발형/지속형/혼합형)
    category: Mapped[str | None] = mapped_column(String, nullable=True)  # 분류 (피해/복합/강화/회복/약화 등)
    stackable: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # 중첩 가능 여부
    var_name: Mapped[str | None] = mapped_column(String, nullable=True)  # 내부 변수명 (API 미노출)
    cost: Mapped[float | None] = mapped_column(Float, nullable=True)  # 기술 비용
    power: Mapped[float | None] = mapped_column(Float, nullable=True)  # 기술 위력
    target: Mapped[str | None] = mapped_column(String, nullable=True)  # 기술 대상 (자유 형식: "1", "ALL", "1+N" 등)
    activation_order: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 발동 순서
    formula: Mapped[str | None] = mapped_column(String, nullable=True)  # 계산 공식 (관리자 전용 표시)
    description: Mapped[str | None] = mapped_column(String, nullable=True)  # 개요 (관리자 전용 표시)
    # skill.xlsx에 값이 비어있어 기획 확정 전 임시로 채운 노드인지 여부 (UI에서 색으로 구분 표시).
    is_placeholder: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )


class CharacterSkillUnlock(Base):
    __tablename__ = "character_skill_unlocks"
    __table_args__ = (
        UniqueConstraint("character_id", "node_id", name="uq_character_skill_unlock"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    character_id: Mapped[int] = mapped_column(Integer, ForeignKey("characters.id"), nullable=False, index=True)
    node_id: Mapped[int] = mapped_column(Integer, ForeignKey("skill_nodes.id"), nullable=False, index=True)
    custom_name: Mapped[str | None] = mapped_column(String, nullable=True)
    custom_image_url: Mapped[str | None] = mapped_column(String, nullable=True)
    # 강화(unlock)에 실제로 소모한 SP. 기술 리셋 아이템으로 리셋할 때 정확히 환급하기 위해 저장한다.
    sp_spent: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    # 해금 당시 실제로 적용한 효과 스냅샷. 이후 관리자가 노드 효과를 바꿔도 리셋 시 정확히 되돌린다.
    applied_effects: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    unlocked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )


class Purchase(Base):
    __tablename__ = "purchases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    character_id: Mapped[int] = mapped_column(Integer, ForeignKey("characters.id"), nullable=False, index=True)
    item_id: Mapped[int] = mapped_column(Integer, ForeignKey("items.id"), nullable=False, index=True)
    # 기존 DB에 컬럼이 없다면: ALTER TABLE purchases ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1;
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    # "shop": 상점에서 골드/CP로 직접 구매. "reward": 관리자 선물·도전과제·임무 등 보상으로 지급.
    # 소유 수량 계산(_sum_quantity)·구매 제한 체크는 origin과 무관하게 전부 합산하지만,
    # "구매 이력" 표시(get_item_history, get_purchases)는 실제 구매(shop)만 보여준다 —
    # 보상으로 받은 아이템은 이미 보상 이력에 별도로 남기 때문에 구매 이력에 또 뜨면 안 된다.
    source: Mapped[str] = mapped_column(String, nullable=False, default="shop", server_default=text("'shop'"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )


class ItemUsage(Base):
    """캐릭터의 소모형 아이템 사용 이력(구매/사용 이력 병합 표시용)."""
    __tablename__ = "item_usages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    character_id: Mapped[int] = mapped_column(Integer, ForeignKey("characters.id"), nullable=False, index=True)
    item_id: Mapped[int] = mapped_column(Integer, ForeignKey("items.id"), nullable=False, index=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )


class Challenge(Base):
    __tablename__ = "challenges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    chapter: Mapped[str] = mapped_column(String, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(String, nullable=False)
    image_url: Mapped[str | None] = mapped_column(String, nullable=True)
    reward: Mapped[str] = mapped_column(String, nullable=False)
    reward_gold: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    reward_experience: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    reward_ap: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    reward_hp: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    reward_attack: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    reward_defense: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    reward_items: Mapped[list | None] = mapped_column(JSON, nullable=True, default=list)
    is_public: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )


class ChallengeProgress(Base):
    __tablename__ = "challenge_progress"
    __table_args__ = (
        UniqueConstraint("challenge_id", "character_id", name="uq_challenge_progress"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    challenge_id: Mapped[int] = mapped_column(Integer, ForeignKey("challenges.id"), nullable=False, index=True)
    character_id: Mapped[int] = mapped_column(Integer, ForeignKey("characters.id"), nullable=False, index=True)
    achieved: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    memo: Mapped[str] = mapped_column(String, nullable=False, default="", server_default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class Mission(Base):
    __tablename__ = "missions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    chapter: Mapped[str] = mapped_column(String, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(String, nullable=False)
    image_url: Mapped[str | None] = mapped_column(String, nullable=True)
    reward: Mapped[str] = mapped_column(String, nullable=False)
    reward_gold: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    reward_experience: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    reward_ap: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    reward_hp: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    reward_attack: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    reward_defense: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    reward_items: Mapped[list | None] = mapped_column(JSON, nullable=True, default=list)
    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )


class MissionProgress(Base):
    __tablename__ = "mission_progress"
    __table_args__ = (
        UniqueConstraint("mission_id", "character_id", name="uq_mission_progress"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    mission_id: Mapped[int] = mapped_column(Integer, ForeignKey("missions.id"), nullable=False, index=True)
    character_id: Mapped[int] = mapped_column(Integer, ForeignKey("characters.id"), nullable=False, index=True)
    achieved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    memo: Mapped[str] = mapped_column(String, nullable=False, default="", server_default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class Enemy(Base):
    __tablename__ = "enemies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    chapter: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    image_url: Mapped[str | None] = mapped_column(String, nullable=True)
    base_hp: Mapped[int] = mapped_column(Integer, nullable=False)
    hp_per_attacker: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    hp_per_defender: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    hp_per_healer: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    attack: Mapped[int] = mapped_column(Integer, nullable=False)
    skills: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )


class Environment(Base):
    """챕터에 딸린 전투 환경 효과. 라운드마다(적 행동 암시 턴) 참가자에게 스택이 쌓이고, (스택-1)×스택당 피해를 입힌다."""

    __tablename__ = "environments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    chapter: Mapped[str] = mapped_column(String, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    stacks_per_round: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default=text("1"))
    damage_per_stack: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )


class SettlementRequest(Base):
    """러너가 어드민에게 보내는 정산 요청.

    type="board": 게시글&댓글 정산 (누적 총 게시물/댓글 수 기입)
    type="log":   교류 로그 정산 (게시물 링크 목록 + 교류 대상 캐릭터 기입)
    """

    __tablename__ = "settlement_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    character_id: Mapped[int] = mapped_column(Integer, ForeignKey("characters.id"), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String, nullable=False, index=True)  # "board" | "log"
    total_posts: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_comments: Mapped[int | None] = mapped_column(Integer, nullable=True)
    links: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # type="log"일 때 로그에서 교류한 상대 캐릭터 id 목록. 같은 챕터에서 처음 기입되는 캐릭터마다 1CP가 추가된다.
    target_character_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # 요청 생성 시점의 진행 중 챕터 이름(target_character_ids의 "챕터 내 최초 기입" 판정 기준). 진행 중 챕터가 없으면 None.
    chapter: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(
        String, nullable=False, default="pending", server_default=text("'pending'"), index=True
    )  # "pending" | "paid"
    paid_gold: Mapped[int | None] = mapped_column(Integer, nullable=True)
    paid_cp: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reward_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("rewards.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class AttendanceEntry(Base):
    """관리자가 캐릭터를 선택해 남기는 출석 기록. 하루에 캐릭터당 1건."""

    __tablename__ = "attendance_entries"
    __table_args__ = (
        UniqueConstraint("attendance_date", "character_id", name="uq_attendance_entry"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    attendance_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    character_id: Mapped[int] = mapped_column(Integer, ForeignKey("characters.id"), nullable=False, index=True)
    reward_paid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )


class AttendanceRecord(Base):
    """(레거시) 관리자가 일괄 체크하던 출석 기록. 과거 연속출석 계산용으로만 조회한다."""

    __tablename__ = "attendance_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    attendance_date: Mapped[date] = mapped_column(Date, nullable=False, unique=True, index=True)
    character_ids: Mapped[list[int]] = mapped_column(JSON, nullable=False, default=list)
    reward_paid: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class BattleSession(Base):
    """전투 진행 상태. 모의전/실전 모두 서버가 이 스냅샷으로 라운드를 계산한다."""

    __tablename__ = "battle_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    mode: Mapped[str] = mapped_column(String, nullable=False)  # "practice" | "real"
    chapter: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(
        String, nullable=False, default="in_progress", server_default=text("'in_progress'")
    )  # "in_progress" | "victory" | "defeat" | "early_terminated"
    round: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default=text("1"))
    # 한 라운드는 3턴으로 나뉜다: "telegraph"(적의 행동 암시) → "ally"(아군 턴) → "enemy"(에너미 턴).
    phase: Mapped[str] = mapped_column(String, nullable=False, default="telegraph", server_default=text("'telegraph'"))
    # telegraph 턴에서 확정한 에너미 행동을 enemy 턴까지 들고 있는다.
    # [{"enemy_id", "kind", "skill_index", "target_character_ids"}, ...]
    pending_enemy_actions: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    enemies: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    summons: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    participants: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    log: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # 라운드 시작 시점(그 라운드의 행동이 반영되기 전) 스냅샷. [{"round", "participants", "enemies", "summons"}, ...]
    # "이전 라운드 다시 진행하기"에서 되돌릴 상태로 쓰인다. 실전(real)에서만 채워진다.
    round_snapshots: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # 실전 테스트 롤백용 메타데이터. 참가자 원상복구, 아이템 사용 복구, 보상 회수에 쓴다.
    rollback_state: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_by: Mapped[int | None] = mapped_column(Integer, ForeignKey("members.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
