import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.models import Character, CharacterItemState, CharacterSkillUnlock, Item, Member, SkillNode


class CharacterCardDetailsTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        member = Member(login_id="runner", password_hash="unused")
        self.db.add(member)
        self.db.flush()
        self.runner = Character(name="러너", member_id=member.id)
        self.hidden = Character(name="관리용 캐릭터")
        self.db.add_all([self.runner, self.hidden])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def unlock(self, tier, *, public=True, branch=0, days=0):
        node = SkillNode(book="용맹의 서", tier=tier, branch=branch, col=0, default_name=f"기술 {tier}",
                         is_public=public, description="기술 설명", effects=[{"stat": "atk", "delta": 2}])
        self.db.add(node)
        self.db.flush()
        unlock = CharacterSkillUnlock(character_id=self.runner.id, node_id=node.id,
                                      custom_name="나의 기술", custom_image_url="https://example.com/custom.webp",
                                      unlocked_at=datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(days=days))
        self.db.add(unlock)
        self.db.flush()
        return node

    def test_only_deepest_public_skill_uses_same_details_as_character_page(self):
        self.unlock(0)
        self.unlock(1, days=5)
        self.unlock(2)
        latest = self.unlock(2, branch=1, days=1)
        self.unlock(3, public=False)
        self.db.commit()
        card = crud.get_character_card_details(self.db)[0]
        self.assertEqual(card.skill.id, latest.id)
        self.assertEqual(card.skill.custom_name, "나의 기술")
        self.assertEqual(card.skill.image_url, "https://example.com/custom.webp")
        self.assertEqual(card.skill.description, "기술 설명")
        self.assertEqual(card.skill.effects[0].delta, 2)
        with patch.object(crud, "_seed_skill_tree_if_empty"):
            tree = crud.get_character_skill_tree(self.db, self.runner.id, "용맹의 서")
        self.assertEqual(card.skill, next(node for node in tree.nodes if node.id == latest.id))

    def test_only_equipped_items_with_purchase_details_are_returned(self):
        for kind, equipped in (("companion", True), ("accessory", True), ("accessory", False), ("consumable", True)):
            item = Item(name=f"{kind}-{equipped}", item_type=kind, special_merchant=True,
                        description_user="구매 전", description_after_purchase="구매 후 설명",
                        image_url="https://example.com/before.webp", image_after_purchase_url="https://example.com/after.webp",
                        effects=[{"stat": "def", "delta": 3}])
            self.db.add(item)
            self.db.flush()
            self.db.add(CharacterItemState(character_id=self.runner.id, item_id=item.id, equipped=equipped))
        self.db.commit()
        card = crud.get_character_card_details(self.db)[0]
        self.assertIsNone(card.skill)
        self.assertEqual([item.item_type for item in card.equipment], ["companion", "accessory"])
        self.assertTrue(all(item.description == "구매 후 설명" for item in card.equipment))
        self.assertTrue(all(item.image_url == "https://example.com/after.webp" for item in card.equipment))
        self.assertEqual(card.equipment[0].effects[0].delta, 3)

    def test_hidden_characters_empty_slots_and_batched_queries(self):
        runner_id, hidden_id = self.runner.id, self.hidden.id
        for index in range(10):
            member = Member(login_id=f"runner-{index}", password_hash="unused")
            self.db.add(member)
            self.db.flush()
            self.db.add(Character(name=f"러너 {index}", member_id=member.id))
        self.db.commit()
        queries = []
        def record_query(conn, cursor, statement, parameters, context, executemany):
            queries.append(statement)
        event.listen(self.engine, "before_cursor_execute", record_query)
        try:
            cards = crud.get_character_card_details(self.db)
        finally:
            event.remove(self.engine, "before_cursor_execute", record_query)
        self.assertEqual(len(queries), 3)
        self.assertEqual(len(cards), 11)
        self.assertIn(runner_id, [card.character_id for card in cards])
        self.assertNotIn(hidden_id, [card.character_id for card in cards])
        self.assertTrue(all(card.skill is None and card.equipment == [] for card in cards))
        self.assertIn(hidden_id, [card.character_id for card in crud.get_character_card_details(self.db, admin=True)])


if __name__ == "__main__":
    unittest.main()
