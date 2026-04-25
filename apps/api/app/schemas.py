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

    model_config = {"from_attributes": True}
