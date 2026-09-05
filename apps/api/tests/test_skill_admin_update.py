import unittest

from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.crud import update_skill_node
from app.db import Base
from app.game_data import build_skill_node_specs
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
                target_side="ENEMY",
                activation_order=-1,
                cost=4,
                power=1.25,
                environment_stack_remove=3,
            ),
        )

        self.assertEqual(updated.default_name, "수정 기술")
        self.assertEqual(updated.description, "수정된 설명")
        self.assertEqual(updated.trigger_type, "혼합형")
        self.assertEqual(updated.category, "복합")
        self.assertTrue(updated.stackable)
        self.assertEqual(updated.target, "3")
        self.assertEqual(updated.target_side, "ENEMY")
        self.assertEqual(updated.activation_order, -1)
        self.assertEqual(updated.cost, 4)
        self.assertEqual(updated.power, 1.25)
        self.assertEqual(updated.environment_stack_remove, 3)

    def test_rejects_non_integer_target(self):
        with self.assertRaises(ValidationError):
            SkillNodeUpdate(default_name="기술", target="1+N")

    def test_rejects_negative_environment_stack_remove(self):
        with self.assertRaises(ValidationError):
            SkillNodeUpdate(default_name="기술", environment_stack_remove=-1)

    def test_rejects_invalid_target_side(self):
        with self.assertRaises(ValidationError):
            SkillNodeUpdate(default_name="기술", target_side="EVERYONE")

    def test_crushing_default_targets_two_enemies(self):
        crushing_nodes = [
            spec
            for spec in build_skill_node_specs("용맹의 서")
            if spec.get("var_name") == "ab_crushing"
        ]

        self.assertTrue(crushing_nodes)
        self.assertTrue(all(node["target"] == "2" for node in crushing_nodes))
        self.assertTrue(all(node["target_side"] == "ENEMY" for node in crushing_nodes))

    def test_anvil_default_stack_remove_count_follows_skill_tier(self):
        anvil_nodes = [
            spec
            for spec in build_skill_node_specs("불굴의 서")
            if spec.get("branch") == 0 and spec.get("col") in (None, 0)
        ]

        self.assertEqual(
            [node["environment_stack_remove"] for node in anvil_nodes],
            [1, 2, 3, 4, 5, 6],
        )


if __name__ == "__main__":
    unittest.main()
