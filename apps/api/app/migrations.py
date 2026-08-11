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

    # 기존 컬럼을 새 스탯 체계 이름으로 이전 (값은 보존, 컬럼명만 변경)
    rename_pairs = [
        ("attack", "atk"),
        ("defense", "def"),
        ("experience", "exp"),
        ("courage", "stat_courage"),
        ("patience", "stat_endurance"),
        ("mercy", "stat_charity"),
        ("wisdom", "stat_wisdom"),
    ]
    for old_name, new_name in rename_pairs:
        if new_name not in character_columns:
            if old_name in character_columns:
                statements.append(f'ALTER TABLE characters RENAME COLUMN {old_name} TO "{new_name}"')
            else:
                statements.append(f'ALTER TABLE characters ADD COLUMN "{new_name}" INTEGER NOT NULL DEFAULT 0')
            character_columns.discard(old_name)
            character_columns.add(new_name)

    if "ap" not in character_columns:
        statements.append("ALTER TABLE characters ADD COLUMN ap INTEGER NOT NULL DEFAULT 10")
    if "member_id" not in character_columns:
        statements.append(
            "ALTER TABLE characters ADD COLUMN member_id INTEGER UNIQUE REFERENCES members(id)"
        )
    if "faction" not in character_columns:
        statements.append("ALTER TABLE characters ADD COLUMN faction VARCHAR")
    if "cp" not in character_columns:
        statements.append("ALTER TABLE characters ADD COLUMN cp INTEGER NOT NULL DEFAULT 0")
    if "lv" not in character_columns:
        statements.append("ALTER TABLE characters ADD COLUMN lv INTEGER NOT NULL DEFAULT 1")
    if "rank" not in character_columns:
        statements.append('ALTER TABLE characters ADD COLUMN "rank" INTEGER NOT NULL DEFAULT 1')

    # 체력/마나 및 상세 능력치 (정수형)
    int_stat_columns = [
        "hp_max", "hp_regen_true", "mp", "mp_max", "mp_regen",
        "attn", "sh", "skill_lv", "skill_eff_true", "skill_cost", "skill_target",
    ]
    hp_max_just_added = "hp_max" not in character_columns
    for col in int_stat_columns:
        if col not in character_columns:
            statements.append(f"ALTER TABLE characters ADD COLUMN {col} INTEGER NOT NULL DEFAULT 0")
    if hp_max_just_added:
        # 기존 캐릭터는 현재 체력을 최대 체력으로 간주해 상태 바가 정상적으로 표시되게 함
        statements.append("UPDATE characters SET hp_max = hp WHERE hp_max = 0")

    # 상세 능력치 (실수형)
    float_stat_columns = [
        "hp_max_p", "hp_regen_fixed", "atk_p", "def_p", "def_eff", "presence",
        "heal_eff", "heal_eff_p", "dmg_p", "dmg_r", "skill_eff_fixed",
    ]
    for col in float_stat_columns:
        if col not in character_columns:
            statements.append(f"ALTER TABLE characters ADD COLUMN {col} DOUBLE PRECISION NOT NULL DEFAULT 0")

    # 관리자 전용 능력치
    if "start_sh" not in character_columns:
        statements.append("ALTER TABLE characters ADD COLUMN start_sh INTEGER NOT NULL DEFAULT 0")
    if "revive_hp" not in character_columns:
        statements.append("ALTER TABLE characters ADD COLUMN revive_hp DOUBLE PRECISION NOT NULL DEFAULT 0.1")
    if "act_time" not in character_columns:
        statements.append("ALTER TABLE characters ADD COLUMN act_time INTEGER NOT NULL DEFAULT 1")
    if "over_heal" not in character_columns:
        statements.append("ALTER TABLE characters ADD COLUMN over_heal BOOLEAN NOT NULL DEFAULT false")

    if "items" in table_names:
        item_columns = {col["name"] for col in inspector.get_columns("items")}
        if "price_gold" not in item_columns:
            if "price" in item_columns:
                statements.append("ALTER TABLE items RENAME COLUMN price TO price_gold")
                statements.append("ALTER TABLE items ALTER COLUMN price_gold DROP NOT NULL")
            else:
                statements.append("ALTER TABLE items ADD COLUMN price_gold INTEGER")
        if "price_cp" not in item_columns:
            statements.append("ALTER TABLE items ADD COLUMN price_cp INTEGER")
        if "available_from_chapter" not in item_columns:
            statements.append("ALTER TABLE items ADD COLUMN available_from_chapter VARCHAR")
        if "available_until_chapter" not in item_columns:
            statements.append("ALTER TABLE items ADD COLUMN available_until_chapter VARCHAR")
        if "item_type" not in item_columns:
            statements.append("ALTER TABLE items ADD COLUMN item_type VARCHAR NOT NULL DEFAULT 'consumable'")
        if "effects" not in item_columns:
            statements.append("ALTER TABLE items ADD COLUMN effects JSON NOT NULL DEFAULT '[]'")

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

    if "skill_nodes" in table_names:
        skill_node_columns = {col["name"] for col in inspector.get_columns("skill_nodes")}
        if "effects" not in skill_node_columns:
            statements.append("ALTER TABLE skill_nodes ADD COLUMN effects JSON NOT NULL DEFAULT '[]'")

    if "character_skill_unlocks" in table_names:
        unlock_columns = {col["name"] for col in inspector.get_columns("character_skill_unlocks")}
        if "ap_spent" not in unlock_columns:
            statements.append("ALTER TABLE character_skill_unlocks ADD COLUMN ap_spent INTEGER NOT NULL DEFAULT 0")

    if not statements:
        return

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))
