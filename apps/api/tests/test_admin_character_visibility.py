"""관리자가 만든 캐릭터의 러너 공개 여부를 검증한다.

비공개(기본)면 러너 목록·카드에서 빠지고, 공개하면 러너도 볼 수 있되 정보 카드만 남긴다.
"""
import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.models import Character, CharacterItemState, Item, Member, Mission, MissionProgress, Purchase
from app.schemas import CharacterCreate


class AdminCharacterVisibilityTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        runner_member = Member(login_id="runner", password_hash="unused")
        admin_member = Member(login_id="admin", password_hash="unused", role="ADMIN")
        self.db.add_all([runner_member, admin_member])
        self.db.flush()
        self.runner = Character(name="러너", member_id=runner_member.id)
        self.admin_owned = Character(name="관리자 계정 캐릭터", member_id=admin_member.id)
        self.db.add_all([self.runner, self.admin_owned])
        self.db.commit()
        self.npc = crud.create_character(self.db, CharacterCreate(name="관리자 생성 캐릭터", faction="공격"))

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def runner_list_ids(self):
        return [character.id for character in crud.get_characters_visible_to_runner(self.db)]

    def runner_card_ids(self):
        return [card.character_id for card in crud.get_character_card_details(self.db)]

    def give_history(self, character_id):
        """보유 아이템(장착·미장착 동반자)과 달성한 임무를 하나씩 만든다."""
        for name, equipped in (("장착한 동반자", True), ("보관 중인 동반자", False)):
            item = Item(name=name, item_type="companion", special_merchant=True)
            self.db.add(item)
            self.db.flush()
            self.db.add(Purchase(character_id=character_id, item_id=item.id, quantity=1))
            self.db.add(CharacterItemState(character_id=character_id, item_id=item.id, equipped=equipped))
        mission = Mission(chapter="1장", name="임무", description="설명", reward="보상")
        self.db.add(mission)
        self.db.flush()
        self.db.add(MissionProgress(mission_id=mission.id, character_id=character_id, achieved=True))
        self.db.commit()

    def test_admin_created_character_is_private_by_default(self):
        self.assertFalse(self.npc.is_public)
        self.assertEqual(self.runner_list_ids(), [self.runner.id])
        self.assertEqual(self.runner_card_ids(), [self.runner.id, self.admin_owned.id])
        # 관리자에게는 공개 여부와 상관없이 모두 보인다.
        self.assertIn(self.npc.id, [card.character_id for card in crud.get_character_card_details(self.db, admin=True)])

    def test_publishing_shows_character_to_runners(self):
        detail = crud.patch_admin_character(self.db, self.npc.id, None, {}, is_public=True)
        self.assertTrue(detail.is_public)
        self.assertIn(self.npc.id, self.runner_list_ids())
        self.assertIn(self.npc.id, self.runner_card_ids())
        # 관리자 계정에 연결된 캐릭터는 여전히 러너 목록에서 빠진다.
        self.assertNotIn(self.admin_owned.id, self.runner_list_ids())

        crud.patch_admin_character(self.db, self.npc.id, None, {}, is_public=False)
        self.assertNotIn(self.npc.id, self.runner_list_ids())
        self.assertNotIn(self.npc.id, self.runner_card_ids())

    def test_only_admin_created_characters_can_be_published(self):
        with self.assertRaises(HTTPException) as raised:
            crud.patch_admin_character(self.db, self.runner.id, None, {}, is_public=True)
        self.assertEqual(raised.exception.status_code, 400)

    def test_other_runner_view_of_published_character_keeps_only_info_card(self):
        self.give_history(self.npc.id)
        detail = crud.scrub_other_character_detail(crud.get_character_detail(self.db, self.npc.id))
        self.assertEqual([item.item_name for item in detail.owned_items], ["장착한 동반자"])
        self.assertEqual(detail.achieved_missions, [])
        self.assertEqual(detail.achieved_challenges, [])
        self.assertEqual((detail.reward_history, detail.item_history), ([], []))

    def test_other_runner_view_of_runner_character_hides_only_history(self):
        self.give_history(self.runner.id)
        detail = crud.scrub_other_character_detail(crud.get_character_detail(self.db, self.runner.id))
        self.assertEqual(len(detail.owned_items), 2)
        self.assertEqual(len(detail.achieved_missions), 1)
        self.assertEqual((detail.reward_history, detail.item_history), ([], []))


if __name__ == "__main__":
    unittest.main()
