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
        "heal_eff", "dmg_p", "dmg_r", "skill_eff_fixed",
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
    if "image_url" not in character_columns:
        statements.append("ALTER TABLE characters ADD COLUMN image_url VARCHAR")

    # 관리자 전용 관리 플래그
    if "caution" not in character_columns:
        statements.append("ALTER TABLE characters ADD COLUMN caution BOOLEAN NOT NULL DEFAULT false")
    if "warning_count" not in character_columns:
        statements.append("ALTER TABLE characters ADD COLUMN warning_count INTEGER NOT NULL DEFAULT 0")

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
        if "image_url" not in item_columns:
            statements.append("ALTER TABLE items ADD COLUMN image_url VARCHAR")
        if "restricted_mission_id" not in item_columns:
            statements.append("ALTER TABLE items ADD COLUMN restricted_mission_id INTEGER REFERENCES missions(id)")
        if "sale_paused" not in item_columns:
            statements.append("ALTER TABLE items ADD COLUMN sale_paused BOOLEAN NOT NULL DEFAULT false")

    if "chapters" in table_names:
        chapter_columns = {col["name"] for col in inspector.get_columns("chapters")}
        if "battle_date" not in chapter_columns:
            statements.append("ALTER TABLE chapters ADD COLUMN battle_date DATE")
        if "image_url" not in chapter_columns:
            statements.append("ALTER TABLE chapters ADD COLUMN image_url VARCHAR")
        if "music_url" not in chapter_columns:
            statements.append("ALTER TABLE chapters ADD COLUMN music_url VARCHAR")
        if "battle_victory_reward_gold" not in chapter_columns:
            statements.append("ALTER TABLE chapters ADD COLUMN battle_victory_reward_gold INTEGER NOT NULL DEFAULT 0")
        if "battle_action_reward_gold" not in chapter_columns:
            statements.append("ALTER TABLE chapters ADD COLUMN battle_action_reward_gold INTEGER NOT NULL DEFAULT 0")
        if "battle_participation_reward_exp" not in chapter_columns:
            statements.append("ALTER TABLE chapters ADD COLUMN battle_participation_reward_exp INTEGER NOT NULL DEFAULT 0")

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
        if "image_url" not in challenge_columns:
            statements.append("ALTER TABLE challenges ADD COLUMN image_url VARCHAR")

    if "missions" in table_names:
        mission_columns = {col["name"] for col in inspector.get_columns("missions")}
        if "image_url" not in mission_columns:
            statements.append("ALTER TABLE missions ADD COLUMN image_url VARCHAR")

    if "skill_nodes" in table_names:
        skill_node_columns = {col["name"] for col in inspector.get_columns("skill_nodes")}
        if "effects" not in skill_node_columns:
            statements.append("ALTER TABLE skill_nodes ADD COLUMN effects JSON NOT NULL DEFAULT '[]'")
        if "image_url" not in skill_node_columns:
            statements.append("ALTER TABLE skill_nodes ADD COLUMN image_url VARCHAR")
        if "is_public" not in skill_node_columns:
            statements.append("ALTER TABLE skill_nodes ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT true")

        # 기술트리 개편: 진영(faction, 공격/수비/치유) 3계열 -> 캐릭터 역할과 무관한 4개 "서"
        # (용맹/불굴/헌신/탐구)로 전환. 기존 트리 구조와 호환되지 않으므로 전면 재시딩하고,
        # 캐릭터가 강화에 소모한 AP는 전부 환급한다(최초 1회).
        if "book" not in skill_node_columns:
            if "character_skill_unlocks" in table_names:
                statements.append(
                    "UPDATE characters SET ap = ap + COALESCE(("
                    "SELECT SUM(csu.ap_spent) FROM character_skill_unlocks csu "
                    "JOIN skill_nodes sn ON sn.id = csu.node_id "
                    "WHERE csu.character_id = characters.id AND sn.tier <> 0"
                    "), 0)"
                )
                statements.append("DELETE FROM character_skill_unlocks")
            statements.append("DELETE FROM skill_nodes")
            if "faction" in skill_node_columns:
                statements.append("ALTER TABLE skill_nodes RENAME COLUMN faction TO book")
            else:
                statements.append("ALTER TABLE skill_nodes ADD COLUMN book VARCHAR NOT NULL DEFAULT ''")
            statements.append("ALTER TABLE skill_nodes ADD COLUMN trigger_type VARCHAR")
            statements.append("ALTER TABLE skill_nodes ADD COLUMN category VARCHAR")
            statements.append("ALTER TABLE skill_nodes ADD COLUMN stackable BOOLEAN")
            statements.append("ALTER TABLE skill_nodes ADD COLUMN var_name VARCHAR")
            statements.append("ALTER TABLE skill_nodes ADD COLUMN cost DOUBLE PRECISION")
            statements.append("ALTER TABLE skill_nodes ADD COLUMN power DOUBLE PRECISION")
            statements.append("ALTER TABLE skill_nodes ADD COLUMN target VARCHAR")
            statements.append("ALTER TABLE skill_nodes ADD COLUMN activation_order INTEGER")
            statements.append("ALTER TABLE skill_nodes ADD COLUMN formula VARCHAR")
            statements.append("ALTER TABLE skill_nodes ADD COLUMN description VARCHAR")
            statements.append("ALTER TABLE skill_nodes ADD COLUMN is_placeholder BOOLEAN NOT NULL DEFAULT false")
            statements.append("ALTER TABLE skill_nodes DROP CONSTRAINT IF EXISTS uq_skill_node_slot")
            statements.append(
                "ALTER TABLE skill_nodes ADD CONSTRAINT uq_skill_node_slot UNIQUE (book, branch, col, tier)"
            )

    if "character_skill_unlocks" in table_names:
        unlock_columns = {col["name"] for col in inspector.get_columns("character_skill_unlocks")}
        if "ap_spent" not in unlock_columns:
            statements.append("ALTER TABLE character_skill_unlocks ADD COLUMN ap_spent INTEGER NOT NULL DEFAULT 0")
            # 이 컬럼 도입 전에 강화된 기술은 강화당 AP 1을 소모했다(성장 등급 1~5의 ap_cost=1,
            # 기본 tier 0은 무료). 백필하지 않으면 AP 초기화 시 환급액이 0이 되어 AP가 증발한다.
            statements.append(
                "UPDATE character_skill_unlocks SET ap_spent = 1 "
                "WHERE node_id IN (SELECT id FROM skill_nodes WHERE tier <> 0)"
            )
        if "applied_effects" not in unlock_columns:
            statements.append("ALTER TABLE character_skill_unlocks ADD COLUMN applied_effects JSON NOT NULL DEFAULT '[]'")
        if "custom_image_url" not in unlock_columns:
            statements.append("ALTER TABLE character_skill_unlocks ADD COLUMN custom_image_url VARCHAR")

    # heal_eff_p(치유 효율 증폭) 제거: 컬럼을 삭제하고, 효과 JSON에 남은 항목도 걷어낸다. (최초 1회)
    if "heal_eff_p" in character_columns:
        statements.append("ALTER TABLE characters DROP COLUMN heal_eff_p")
        for table, column in (
            ("items", "effects"),
            ("skill_nodes", "effects"),
            ("character_skill_unlocks", "applied_effects"),
        ):
            if table in table_names:
                statements.append(
                    f"UPDATE {table} SET {column} = COALESCE("
                    f"(SELECT json_agg(e) FROM json_array_elements({column}::json) e WHERE e->>'stat' <> 'heal_eff_p'),"
                    f" '[]'::json) "
                    f"WHERE {column}::text LIKE '%heal_eff_p%'"
                )

    if "attendance_entries" in table_names:
        attendance_columns = {col["name"] for col in inspector.get_columns("attendance_entries")}
        if "reward_paid" not in attendance_columns:
            statements.append(
                "ALTER TABLE attendance_entries ADD COLUMN reward_paid BOOLEAN NOT NULL DEFAULT false"
            )
        if "message" in attendance_columns:
            statements.append("ALTER TABLE attendance_entries DROP COLUMN message")
        if "updated_at" in attendance_columns:
            statements.append("ALTER TABLE attendance_entries DROP COLUMN updated_at")

    if "enemies" in table_names:
        enemy_columns = {col["name"] for col in inspector.get_columns("enemies")}
        if "image_url" not in enemy_columns:
            statements.append("ALTER TABLE enemies ADD COLUMN image_url VARCHAR")

    if "battle_sessions" in table_names:
        battle_columns = {col["name"] for col in inspector.get_columns("battle_sessions")}
        if "round_snapshots" not in battle_columns:
            statements.append("ALTER TABLE battle_sessions ADD COLUMN round_snapshots JSON NOT NULL DEFAULT '[]'")
        if "phase" not in battle_columns:
            statements.append("ALTER TABLE battle_sessions ADD COLUMN phase VARCHAR NOT NULL DEFAULT 'telegraph'")
        if "pending_enemy_actions" not in battle_columns:
            statements.append("ALTER TABLE battle_sessions ADD COLUMN pending_enemy_actions JSON NOT NULL DEFAULT '[]'")

    if "attendance_missions" in table_names:
        statements.append("DROP TABLE attendance_missions")

    if not statements:
        return

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))
