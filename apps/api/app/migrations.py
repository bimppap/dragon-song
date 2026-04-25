from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from app.db import Base


def ensure_schema(engine: Engine) -> None:
    Base.metadata.create_all(bind=engine)

    inspector = inspect(engine)
    if "characters" not in inspector.get_table_names():
        return

    character_columns = {
        column["name"] for column in inspector.get_columns("characters")
    }
    statements: list[str] = []

    if "ap" not in character_columns:
        statements.append(
            "ALTER TABLE characters ADD COLUMN ap INTEGER NOT NULL DEFAULT 10"
        )
    if "experience" not in character_columns:
        statements.append(
            "ALTER TABLE characters ADD COLUMN experience INTEGER NOT NULL DEFAULT 1"
        )

    if not statements:
        return

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))
