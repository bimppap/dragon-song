import unittest

from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.crud import update_skill_node
from app.db import Base
from app.models import SkillNode
from app.schemas import SkillNodeUpdate


class SkillAdminUpdateTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        node = SkillNode(
            book="용맹의 서",
            branch=0,
            col=None,
            tier=1,
            default_name="기존 기술",
        )
        self.db.add(node)
        self.db.commit()
        self.node_id = node.id

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_updates_all_editable_skill_metadata(self):
        updated = update_skill_node(
            self.db,
            self.node_id,
            SkillNodeUpdate(
                default_name="  수정 기술  ",
                description="  수정된 설명  ",
                trigger_type="혼합형",
                category="복합",
                stackable=True,
                target="03",
                activation_order=-1,
                cost=4,
                power=1.25,
            ),
        )

        self.assertEqual(updated.default_name, "수정 기술")
        self.assertEqual(updated.description, "수정된 설명")
        self.assertEqual(updated.trigger_type, "혼합형")
        self.assertEqual(updated.category, "복합")
        self.assertTrue(updated.stackable)
        self.assertEqual(updated.target, "3")
        self.assertEqual(updated.activation_order, -1)
        self.assertEqual(updated.cost, 4)
        self.assertEqual(updated.power, 1.25)

    def test_rejects_non_integer_target(self):
        with self.assertRaises(ValidationError):
            SkillNodeUpdate(default_name="기술", target="1+N")


if __name__ == "__main__":
    unittest.main()
