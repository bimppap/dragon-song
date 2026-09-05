import unittest

from fastapi import HTTPException
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

    def test_rejects_non_integer_target(self):
        with self.assertRaises(ValidationError):
            SkillNodeUpdate(default_name="기술", target="1+N")

    def test_rejects_negative_cleanse_count(self):
        with self.assertRaises(ValidationError):
            SkillNodeUpdate(default_name="기술", cleanse_count=-1)

    def test_rejects_cleanse_count_on_skill_without_it(self):
        with self.assertRaises(HTTPException):
            update_skill_node(self.db, self.node_id, SkillNodeUpdate(default_name="기존 기술", cleanse_count=2))

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

    def test_counter_has_two_power_slots_and_saves_them(self):
        node = SkillNode(
            book="불굴의 서", branch=1, col=0, tier=1, default_name="반격",
            var_name="ab_counter", power=0.05, powers={"counter_damage": 2.0},
        )
        self.db.add(node)
        self.db.commit()

        updated = update_skill_node(
            self.db,
            node.id,
            SkillNodeUpdate(default_name="반격", power=0.07, powers={"counter_damage": 2.5}),
        )

        self.assertEqual(
            [(slot.key, slot.label) for slot in updated.power_slots],
            [("power", "피해 감소"), ("counter_damage", "반격 피해")],
        )
        self.assertEqual(updated.power, 0.07)
        self.assertEqual(updated.powers, {"counter_damage": 2.5})

    def test_rejects_power_key_the_skill_does_not_have(self):
        with self.assertRaises(HTTPException):
            update_skill_node(
                self.db,
                self.node_id,
                SkillNodeUpdate(default_name="기존 기술", powers={"counter_damage": 2.0}),
            )

    def test_single_power_skill_keeps_one_slot(self):
        updated = update_skill_node(self.db, self.node_id, SkillNodeUpdate(default_name="기존 기술"))

        self.assertEqual([(slot.key, slot.label) for slot in updated.power_slots], [("power", "기술 위력")])

    def test_anvil_default_cleanse_count_follows_skill_tier(self):
        anvil_nodes = [
            spec
            for spec in build_skill_node_specs("불굴의 서")
            if spec.get("branch") == 0 and spec.get("col") in (None, 0)
        ]

        self.assertEqual(
            [node["cleanse_count"] for node in anvil_nodes],
            [1, 2, 3, 4, 5, 6],
        )

    def test_purification_and_protect_carry_their_numbers_as_data(self):
        purification = [
            spec for spec in build_skill_node_specs("헌신의 서")
            if spec.get("var_name") == "ab_purification"
        ]
        protect = [
            spec for spec in build_skill_node_specs("불굴의 서")
            if spec.get("var_name") == "ab_protect"
        ]

        # 기술 등급으로 계산하던 값들을 기술 데이터로 옮겼다(정화는 단계별, 보호는 단계 공통).
        self.assertEqual([node["cleanse_count"] for node in purification], [1, 2, 3, 4, 5, 6])
        self.assertTrue(all(node["powers"]["attn_transfer"] == 0.1 for node in protect))


if __name__ == "__main__":
    unittest.main()
