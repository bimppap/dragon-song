import unittest
from unittest.mock import patch

import pydantic
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.models import Character, CharacterSkillUnlock, Member, SkillNode
from app.schemas import SkillCustomizationUpdate


class SkillCustomDescriptionTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        member = Member(login_id="runner", password_hash="unused")
        self.db.add(member)
        self.db.flush()
        self.runner = Character(name="러너", member_id=member.id)
        self.db.add(self.runner)
        self.db.flush()
        self.node = SkillNode(book="용맹의 서", tier=1, branch=0, col=0, default_name="화염 베기",
                              is_public=True, description="대상에게 30% 피해", effects=[])
        self.db.add(self.node)
        self.db.flush()
        self.db.add(CharacterSkillUnlock(character_id=self.runner.id, node_id=self.node.id))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def customize(self, **fields):
        with patch.object(crud, "_seed_skill_tree_if_empty"):
            tree = crud.update_character_skill_customization(self.db, self.runner.id, self.node.id, fields)
        return next(node for node in tree.nodes if node.id == self.node.id)

    def set_description(self, description, color=""):
        return self.customize(custom_description=description, custom_description_color=color)

    def test_custom_description_and_color_are_saved_alongside_original_description(self):
        node = self.set_description("붉은 '검기'가 흐른다", "#ff8800")
        self.assertEqual(node.custom_description, "붉은 '검기'가 흐른다")
        self.assertEqual(node.custom_description_color, "#ff8800")
        # 원본 기술 설명은 대체되지 않고 그대로 남는다.
        self.assertEqual(node.description, "대상에게 30% 피해")

    def test_blank_description_and_color_clear_the_customization(self):
        self.set_description("붉은 '검기'가 흐른다", "#ff8800")
        node = self.set_description("   ", "")
        self.assertIsNone(node.custom_description)
        self.assertIsNone(node.custom_description_color)

    def test_color_must_be_a_single_six_digit_hex(self):
        self.assertEqual(SkillCustomizationUpdate(custom_description_color="#FF8800").custom_description_color, "#FF8800")
        for invalid in ("red", "#f80", "#ff88000", "ff8800"):
            with self.subTest(invalid=invalid), self.assertRaises(pydantic.ValidationError):
                SkillCustomizationUpdate(custom_description_color=invalid)

    def test_description_length_is_capped(self):
        with self.assertRaises(pydantic.ValidationError):
            SkillCustomizationUpdate(custom_description="가" * 301)

    def test_omitted_fields_are_left_untouched(self):
        self.set_description("붉은 '검기'가 흐른다", "#ff8800")
        # 이름만 보내면 설명·색은 그대로 남는다.
        node = self.customize(custom_name="나의 화염 베기")
        self.assertEqual(node.custom_name, "나의 화염 베기")
        self.assertEqual(node.custom_description, "붉은 '검기'가 흐른다")
        self.assertEqual(node.custom_description_color, "#ff8800")

    def test_unlearned_skill_cannot_be_customized(self):
        other = SkillNode(book="용맹의 서", tier=2, branch=0, col=0, default_name="미습득", is_public=True, effects=[])
        self.db.add(other)
        self.db.commit()
        with self.assertRaises(HTTPException) as caught:
            crud.update_character_skill_customization(self.db, self.runner.id, other.id, {"custom_description": "설명"})
        self.assertEqual(caught.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
