"""전투 조회가 커지는 JSON 상태를 불필요하게 읽거나 전송하지 않는지 검증한다."""

import unittest

from sqlalchemy import create_engine, event, inspect
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.models import (
    KST,
    BattleSession,
    Character,
    CharacterItemState,
    CharacterSkillUnlock,
    Item,
    Purchase,
    SkillNode,
)


class BattlePerformanceTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        crud.invalidate_active_battle_skills_cache()

    def tearDown(self):
        crud.invalidate_active_battle_skills_cache()
        self.db.close()
        self.engine.dispose()

    def battle(self) -> BattleSession:
        session = BattleSession(
            mode="real",
            chapter="chapter",
            status="in_progress",
            participants=[],
            enemies=[{"name": "enemy", "hp": 10}],
            summons=[],
            log=[{"round": 1, "events": ["large log"]}],
            round_snapshots=[{"round": 1, "participants": [], "enemies": [], "summons": []}],
            rollback_state={"version": 1},
        )
        self.db.add(session)
        self.db.commit()
        self.db.refresh(session)
        return session

    def test_live_poll_returns_unchanged_without_loading_full_snapshot(self):
        session = self.battle()
        first, unchanged = crud.get_live_real_battle(self.db)
        self.assertFalse(unchanged)
        self.assertIsNotNone(first)

        known_updated_at = session.updated_at
        if known_updated_at.tzinfo is None:
            known_updated_at = known_updated_at.replace(tzinfo=KST)
        second, unchanged = crud.get_live_real_battle(self.db, session.id, known_updated_at)

        self.assertTrue(unchanged)
        self.assertIsNone(second)

    def test_battle_list_query_excludes_large_history_columns(self):
        self.battle()
        statements: list[str] = []

        def record_statement(_conn, _cursor, statement, _parameters, _context, _executemany):
            statements.append(statement.lower())

        event.listen(self.engine, "before_cursor_execute", record_statement)
        try:
            summaries = crud.get_battle_sessions(self.db, mode="real")
        finally:
            event.remove(self.engine, "before_cursor_execute", record_statement)

        battle_select = next(statement for statement in statements if "from battle_sessions" in statement)
        self.assertEqual(len(summaries), 1)
        self.assertNotIn("round_snapshots", battle_select)
        self.assertNotIn("rollback_state", battle_select)
        self.assertNotIn("battle_sessions.log", battle_select)

    def test_battle_hot_path_indexes_exist(self):
        inspector = inspect(self.engine)
        battle_indexes = {index["name"] for index in inspector.get_indexes("battle_sessions")}
        reward_indexes = {index["name"] for index in inspector.get_indexes("rewards")}
        self.assertIn("ix_battle_sessions_mode_status_id", battle_indexes)
        self.assertIn("ix_rewards_type_source_id", reward_indexes)

    def test_active_battle_skills_are_batched_and_cached(self):
        character = Character(name="cache fairy")
        self.db.add(character)
        self.db.commit()
        crud.get_skill_nodes(self.db, "용맹의 서")
        node = (
            self.db.query(SkillNode)
            .filter(SkillNode.book == "용맹의 서", SkillNode.tier == 1)
            .first()
        )
        self.assertIsNotNone(node)
        self.db.add(CharacterSkillUnlock(
            character_id=character.id,
            node_id=node.id,
            custom_name="캐시 기술",
            custom_image_url="https://example.com/cached.webp",
        ))
        self.db.commit()
        crud.invalidate_active_battle_skills_cache()

        statements: list[str] = []

        def record_statement(_conn, _cursor, statement, _parameters, _context, _executemany):
            statements.append(statement.lower())

        event.listen(self.engine, "before_cursor_execute", record_statement)
        try:
            first = crud._get_cached_active_battle_skills_by_character(self.db, [character.id])
            first[character.id][node.id]["display_name"] = "mutated"
            statements.clear()
            second = crud._get_cached_active_battle_skills_by_character(self.db, [character.id])
        finally:
            event.remove(self.engine, "before_cursor_execute", record_statement)

        self.assertEqual(statements, [])
        self.assertEqual(second[character.id][node.id]["display_name"], "캐시 기술")
        self.assertEqual(second[character.id][node.id]["image_url"], "https://example.com/cached.webp")

    def test_battle_available_items_are_loaded_in_bounded_queries(self):
        first = Character(name="아이템 사용자 A")
        second = Character(name="아이템 사용자 B")
        usable = Item(name="회복약", description_user="회복", item_type="consumable", effects=[{"stat": "hp", "delta": 10}])
        exhausted = Item(name="빈 물약", description_user="소진", item_type="consumable", effects=[])
        challenge = Item(
            name="도전과제 증표",
            description_user="전투 사용 불가",
            item_type="consumable",
            effects=[{"stat": "challenge_acquisition", "delta": 1, "chapter": "chapter"}],
        )
        accessory = Item(name="반지", description_user="장신구", item_type="accessory", effects=[])
        self.db.add_all([first, second, usable, exhausted, challenge, accessory])
        self.db.flush()
        self.db.add_all([
            Purchase(character_id=first.id, item_id=usable.id, quantity=2),
            Purchase(character_id=second.id, item_id=usable.id, quantity=1),
            Purchase(character_id=first.id, item_id=exhausted.id, quantity=1),
            Purchase(character_id=first.id, item_id=challenge.id, quantity=1),
            Purchase(character_id=first.id, item_id=accessory.id, quantity=1),
            CharacterItemState(character_id=first.id, item_id=usable.id, used_quantity=1),
            CharacterItemState(character_id=first.id, item_id=exhausted.id, used_quantity=1),
        ])
        battle = BattleSession(
            mode="real",
            chapter="chapter",
            status="in_progress",
            participants=[{"character_id": first.id}, {"character_id": second.id}],
            enemies=[],
            summons=[],
            log=[],
        )
        self.db.add(battle)
        self.db.commit()
        battle_id = battle.id
        first_id = first.id
        second_id = second.id

        statements: list[str] = []

        def record_statement(_conn, _cursor, statement, _parameters, _context, _executemany):
            if statement.lstrip().lower().startswith("select"):
                statements.append(statement.lower())

        event.listen(self.engine, "before_cursor_execute", record_statement)
        try:
            result = crud.get_battle_available_items(self.db, battle_id)
        finally:
            event.remove(self.engine, "before_cursor_execute", record_statement)

        self.assertEqual(len(statements), 4)
        self.assertEqual(set(result.items_by_character), {first_id, second_id})
        self.assertEqual(
            [(item.item_name, item.quantity, item.used_quantity) for item in result.items_by_character[first_id]],
            [("회복약", 2, 1)],
        )
        self.assertEqual(
            [(item.item_name, item.quantity, item.used_quantity) for item in result.items_by_character[second_id]],
            [("회복약", 1, 0)],
        )


if __name__ == "__main__":
    unittest.main()
