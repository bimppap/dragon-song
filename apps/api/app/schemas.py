from datetime import date, datetime
from typing import Literal
from pydantic import BaseModel, Field, field_validator

EnemySkillType = Literal["지정 공격A", "지정 공격B", "광역 공격A", "광역 공격B", "소환"]


class ChapterCreate(BaseModel):
    name: str
    start_date: date
    end_date: date


class ChapterRead(BaseModel):
    id: int
    name: str
    start_date: date
    end_date: date
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class RewardItemEntry(BaseModel):
    type: str  # "gold" | "item"
    amount: int | None = None
    item_id: int | None = None
    quantity: int | None = None


class RewardRead(BaseModel):
    id: int
    type: str
    character_id: int
    source_id: int | None
    reward_items: list[RewardItemEntry]
    rewarded_at: date
    created_at: datetime

    model_config = {"from_attributes": True}


class RewardPayResult(BaseModel):
    paid_count: int
    rewards: list[RewardRead]


class CharacterCreate(BaseModel):
    name: str
    hp: int = Field(ge=0)
    attack: int = Field(ge=0)
    defense: int = Field(ge=0)
    gold: int = Field(default=1000, ge=0)
    ap: int = Field(default=10, gt=0)
    experience: int = Field(default=1, gt=0)


class CharacterRead(BaseModel):
    id: int
    name: str
    hp: int
    attack: int
    defense: int
    gold: int
    ap: int
    experience: int

    model_config = {"from_attributes": True}


class ItemCreate(BaseModel):
    name: str
    price: int
    description_user: str = ""
    description_internal: str = ""
    purchase_limit_per_character: int | None = None
    purchase_limit_global: int | None = None


class ItemRead(BaseModel):
    id: int
    name: str
    price: int
    description_user: str
    description_internal: str
    purchase_limit_per_character: int | None
    purchase_limit_global: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ItemWithStock(ItemRead):
    purchased_by_character: int
    purchased_total: int
    remaining_per_character: int | None
    remaining_global: int | None


class CartItem(BaseModel):
    item_id: int
    quantity: int


class BulkPurchaseRequest(BaseModel):
    character_id: int
    items: list[CartItem]


class PurchaseRead(BaseModel):
    id: int
    character_id: int
    character_name: str
    item_id: int
    item_name: str
    quantity: int
    created_at: datetime

    model_config = {"from_attributes": True}


class CharacterOwnedItemRead(BaseModel):
    item_id: int
    item_name: str
    quantity: int


class CharacterAchievedChallengeRead(BaseModel):
    challenge_id: int
    chapter: str
    name: str
    description: str
    reward: str


class CharacterDetailRead(CharacterRead):
    owned_items: list[CharacterOwnedItemRead]
    achieved_challenges: list[CharacterAchievedChallengeRead]
    purchase_history: list[PurchaseRead]
    reward_history: list[RewardRead]


class ChallengeCreate(BaseModel):
    chapter: str
    name: str
    description: str
    reward: str
    reward_gold: int = Field(default=0, ge=0)
    reward_experience: int = Field(default=0, ge=0)
    reward_ap: int = Field(default=0, ge=0)
    reward_hp: int = Field(default=0, ge=0)
    reward_attack: int = Field(default=0, ge=0)
    reward_defense: int = Field(default=0, ge=0)
    reward_items: list[dict] = Field(default_factory=list)
    is_public: bool = True


class ChallengeRead(BaseModel):
    id: int
    chapter: str
    name: str
    description: str
    reward: str
    reward_gold: int
    reward_experience: int
    reward_ap: int
    reward_hp: int
    reward_attack: int
    reward_defense: int
    reward_items: list = Field(default_factory=list)
    is_public: bool
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("reward_items", mode="before")
    @classmethod
    def coerce_reward_items(cls, v: object) -> list:
        return v if v is not None else []


class ChallengeProgressUpdate(BaseModel):
    character_id: int
    achieved: bool
    memo: str = ""


class ChallengeProgressBulkUpdate(BaseModel):
    entries: list[ChallengeProgressUpdate]


class ChallengeProgressRead(BaseModel):
    character_id: int
    character_name: str
    achieved: bool
    memo: str

    model_config = {"from_attributes": True}


class MissionCreate(BaseModel):
    chapter: str
    mission_type: str  # "일일" | "중요"
    name: str
    description: str
    reward: str
    reward_gold: int = Field(default=0, ge=0)
    reward_experience: int = Field(default=0, ge=0)
    reward_ap: int = Field(default=0, ge=0)
    reward_hp: int = Field(default=0, ge=0)
    reward_attack: int = Field(default=0, ge=0)
    reward_defense: int = Field(default=0, ge=0)
    reward_items: list[dict] = Field(default_factory=list)
    is_public: bool = True


class MissionRead(BaseModel):
    id: int
    chapter: str
    mission_type: str
    name: str
    description: str
    reward: str
    reward_gold: int
    reward_experience: int
    reward_ap: int
    reward_hp: int
    reward_attack: int
    reward_defense: int
    reward_items: list = Field(default_factory=list)
    is_public: bool
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("reward_items", mode="before")
    @classmethod
    def coerce_reward_items(cls, v: object) -> list:
        return v if v is not None else []


class MissionProgressUpdate(BaseModel):
    character_id: int
    achieved: bool
    memo: str = ""


class MissionProgressBulkUpdate(BaseModel):
    entries: list[MissionProgressUpdate]


class MissionProgressRead(BaseModel):
    character_id: int
    character_name: str
    achieved: bool
    memo: str

    model_config = {"from_attributes": True}


class EnemySkill(BaseModel):
    skill_type: EnemySkillType
    name: str
    target_count: int = 0
    damage_percent: int = 0
    summon_name: str | None = None
    summon_hp: int | None = None
    summon_attack: int | None = None
    summon_count: int | None = None


class EnemyCreate(BaseModel):
    name: str
    chapter: str | None = None
    base_hp: int = Field(ge=0)
    hp_per_attacker: int = Field(default=0, ge=0)
    hp_per_defender: int = Field(default=0, ge=0)
    hp_per_healer: int = Field(default=0, ge=0)
    attack: int = Field(ge=0)
    skills: list[EnemySkill] = Field(default_factory=list)


class EnemyRead(BaseModel):
    id: int
    name: str
    chapter: str | None
    base_hp: int
    hp_per_attacker: int
    hp_per_defender: int
    hp_per_healer: int
    attack: int
    skills: list[EnemySkill]
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("skills", mode="before")
    @classmethod
    def coerce_skills(cls, v: object) -> list:
        return v if v is not None else []


class AttendanceRecordUpdate(BaseModel):
    character_ids: list[int] = Field(default_factory=list)
    reward_paid: bool = False


class AttendanceRecordRead(BaseModel):
    attendance_date: date
    character_ids: list[int]
    reward_paid: bool

    model_config = {"from_attributes": True}
