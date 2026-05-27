from datetime import date, datetime, timezone
from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, JSON, String, UniqueConstraint, text
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


class Character(Base):
    __tablename__ = "characters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    hp: Mapped[int] = mapped_column(Integer, nullable=False)
    attack: Mapped[int] = mapped_column(Integer, nullable=False)
    defense: Mapped[int] = mapped_column(Integer, nullable=False)
    gold: Mapped[int] = mapped_column(Integer, nullable=False, default=1000)
    ap: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=10,
        server_default=text("10"),
    )
    experience: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        server_default=text("1"),
    )


class Item(Base):
    __tablename__ = "items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    price: Mapped[int] = mapped_column(Integer, nullable=False)
    description_user: Mapped[str] = mapped_column(String, nullable=False, default="")
    description_internal: Mapped[str] = mapped_column(String, nullable=False, default="")
    purchase_limit_per_character: Mapped[int | None] = mapped_column(Integer, nullable=True)
    purchase_limit_global: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
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
