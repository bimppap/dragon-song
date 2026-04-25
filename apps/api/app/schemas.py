from datetime import date, datetime
from pydantic import BaseModel, Field


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


class ChallengeCreate(BaseModel):
    chapter: str
    name: str
    description: str
    reward: str
    is_public: bool = True


class ChallengeRead(BaseModel):
    id: int
    chapter: str
    name: str
    description: str
    reward: str
    is_public: bool
    created_at: datetime

    model_config = {"from_attributes": True}


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


class AttendanceRecordUpdate(BaseModel):
    character_ids: list[int] = Field(default_factory=list)
    reward_paid: bool = False


class AttendanceRecordRead(BaseModel):
    attendance_date: date
    character_ids: list[int]
    reward_paid: bool

    model_config = {"from_attributes": True}
