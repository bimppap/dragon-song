from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from app.db import Base


def ensure_schema(engine: Engine) -> None:
    Base.metadata.create_all(bind=engine)

    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())

    if "characters" not in table_names:
        return

    statements: list[str] = []

    character_columns = {col["name"] for col in inspector.get_columns("characters")}
    if "ap" not in character_columns:
        statements.append("ALTER TABLE characters ADD COLUMN ap INTEGER NOT NULL DEFAULT 10")
    if "experience" not in character_columns:
        statements.append("ALTER TABLE characters ADD COLUMN experience INTEGER NOT NULL DEFAULT 1")

    if "challenges" in table_names:
        challenge_columns = {col["name"] for col in inspector.get_columns("challenges")}
        if "reward_gold" not in challenge_columns:
            statements.append("ALTER TABLE challenges ADD COLUMN reward_gold INTEGER NOT NULL DEFAULT 0")
        if "reward_experience" not in challenge_columns:
            statements.append("ALTER TABLE challenges ADD COLUMN reward_experience INTEGER NOT NULL DEFAULT 0")
        if "reward_ap" not in challenge_columns:
            statements.append("ALTER TABLE challenges ADD COLUMN reward_ap INTEGER NOT NULL DEFAULT 0")
        if "reward_hp" not in challenge_columns:
            statements.append("ALTER TABLE challenges ADD COLUMN reward_hp INTEGER NOT NULL DEFAULT 0")
        if "reward_attack" not in challenge_columns:
            statements.append("ALTER TABLE challenges ADD COLUMN reward_attack INTEGER NOT NULL DEFAULT 0")
        if "reward_defense" not in challenge_columns:
            statements.append("ALTER TABLE challenges ADD COLUMN reward_defense INTEGER NOT NULL DEFAULT 0")
        if "reward_items" not in challenge_columns:
            statements.append("ALTER TABLE challenges ADD COLUMN reward_items JSON")

    if not statements:
        return

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))
