from datetime import datetime
from pydantic import BaseModel


class CharacterCreate(BaseModel):
    name: str
    hp: int
    attack: int
    defense: int


class CharacterRead(BaseModel):
    id: int
    name: str
    hp: int
    attack: int
    defense: int
    gold: int

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
    item_id: int
    item_name: str
    quantity: int
    created_at: datetime

    model_config = {"from_attributes": True}
