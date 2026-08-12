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
    )  # "RUNNER" | "ADMIN"
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )


class Character(Base):
    __tablename__ = "characters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    gold: Mapped[int] = mapped_column(Integer, nullable=False, default=1000)
    cp: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    ap: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=10,
        server_default=text("10"),
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
    heal_eff_p: Mapped[float] = mapped_column(Float, nullable=False, default=0, server_default=text("0"))
    sh: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    dmg_p: Mapped[float] = mapped_column(Float, nullable=False, default=0, server_default=text("0"))
    dmg_r: Mapped[float] = mapped_column(Float, nullable=False, default=0, server_default=text("0"))
    skill_lv: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    skill_eff_true: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    skill_eff_fixed: Mapped[float] = mapped_column(Float, nullable=False, default=0, server_default=text("0"))
    skill_cost: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    skill_target: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))

    # 관리자 전용 능력치 (RUNNER에게는 노출되지 않음)
    start_sh: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    revive_hp: Mapped[float] = mapped_column(Float, nullable=False, default=0.1, server_default=text("0.1"))
    act_time: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default=text("1"))
    over_heal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))


class Item(Base):
    __tablename__ = "items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    price_gold: Mapped[int | None] = mapped_column(Integer, nullable=True)
    price_cp: Mapped[int | None] = mapped_column(Integer, nullable=True)
    description_user: Mapped[str] = mapped_column(String, nullable=False, default="")
    description_internal: Mapped[str] = mapped_column(String, nullable=False, default="")
    purchase_limit_per_character: Mapped[int | None] = mapped_column(Integer, nullable=True)
    purchase_limit_global: Mapped[int | None] = mapped_column(Integer, nullable=True)
    available_from_chapter: Mapped[str | None] = mapped_column(String, nullable=True)
    available_until_chapter: Mapped[str | None] = mapped_column(String, nullable=True)
    item_type: Mapped[str] = mapped_column(
        String, nullable=False, default="consumable", server_default=text("'consumable'")
    )  # "consumable" | "equipment"
    image_url: Mapped[str | None] = mapped_column(String, nullable=True)  # Supabase Storage 공개 URL
    effects: Mapped[list] = mapped_column(JSON, nullable=False, default=list)  # [{"stat": "atk", "delta": 5}, ...]
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
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
    __tablename__ = "skill_nodes"
    __table_args__ = (
        UniqueConstraint("faction", "branch", "col", "tier", name="uq_skill_node_slot"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    faction: Mapped[str] = mapped_column(String, nullable=False, index=True)  # "공격" | "수비" | "치유"
    branch: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 0,1,2 (tier 0은 None)
    col: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 0,1 (tier 0,1은 None)
    tier: Mapped[int] = mapped_column(Integer, nullable=False)  # 0=기본, 1=계열선택, 2~5=I~IV
    default_name: Mapped[str] = mapped_column(String, nullable=False)
    effects: Mapped[list] = mapped_column(JSON, nullable=False, default=list)  # [{"stat": "atk", "delta": 5}, ...]
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
    # 강화(unlock)에 실제로 소모한 AP. AP 초기화 아이템으로 리셋할 때 정확히 환급하기 위해 저장한다.
    ap_spent: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
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
    mission_type: Mapped[str] = mapped_column(String, nullable=False, index=True)  # "일일" | "중요"
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(String, nullable=False)
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


class AttendanceRecord(Base):
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
