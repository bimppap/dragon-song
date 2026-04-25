from sqlalchemy.orm import Session
from app.models import Character
from app.schemas import CharacterCreate


def create_character(db: Session, data: CharacterCreate) -> Character:
    character = Character(
        name=data.name,
        hp=data.hp,
        attack=data.attack,
        defense=data.defense,
    )
    db.add(character)
    db.commit()
    db.refresh(character)
    return character


def get_characters(db: Session) -> list[Character]:
    return db.query(Character).all()
