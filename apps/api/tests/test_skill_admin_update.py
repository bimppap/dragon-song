import unittest

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, text
from app.migrations import ensure_schema
from sqlalchemy.orm import Session

from app import crud
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

    def test_derived_metadata_and_powers_persist_only_at_edited_depth(self):
        nodes = crud.get_skill_nodes(self.db, "불굴의 서")
        node = next(n for n in nodes if n.branch == 0 and n.col == 1 and n.tier == 3)
        updated = update_skill_node(self.db, node.id, SkillNodeUpdate(
            default_name=node.default_name, trigger_type="혼합형", category="복합",
            stackable=False, power=0.25,
        ))
        self.assertTrue(updated.power_editable)
        self.db.expire_all()
        reloaded = crud._to_skill_node_read(self.db.get(SkillNode, node.id))
        self.assertEqual((reloaded.trigger_type, reloaded.category, reloaded.stackable, reloaded.power),
                         ("혼합형", "복합", False, 0.25))
        sibling = next(n for n in crud.get_skill_nodes(self.db, "불굴의 서")
                       if n.branch == 0 and n.col == 1 and n.tier == 2)
        self.assertEqual((sibling.trigger_type, sibling.category, sibling.stackable, sibling.power),
                         ("지속형", "강화", True, 0.05))
        renamed = update_skill_node(self.db, node.id, SkillNodeUpdate(default_name="새 경호"))
        self.assertEqual((renamed.power, renamed.stackable), (0.25, False))

    def test_enchant_multipliers_are_independent_per_depth(self):
        # 이 테스트의 기본 노드는 같은 서의 시딩을 막으므로 먼저 제거한다.
        self.db.delete(self.db.get(SkillNode, self.node_id))
        self.db.commit()
        nodes = crud.get_skill_nodes(self.db, "용맹의 서")
        node = next(n for n in nodes if n.branch == 0 and n.col == 1 and n.tier >= 2 and n.tier == 4)
        updated = update_skill_node(self.db, node.id, SkillNodeUpdate(
            default_name=node.default_name, power=3.5, powers={"attack_buff": 1.5},
        ))
        self.assertEqual([(s.key, s.unit) for s in updated.power_slots],
                         [("power", "flat"), ("attack_buff", "flat")])
        self.db.expire_all()
        nodes = crud.get_skill_nodes(self.db, "용맹의 서")
        for current in (n for n in nodes if n.branch == 0 and n.col == 1 and n.tier >= 2):
            expected = (3.5, 1.5) if current.tier == 4 else (2, 2)
            self.assertEqual((current.power, current.powers["attack_buff"]), expected)

    def test_rejects_negative_and_nonfinite_powers(self):
        for value in (-1, float("inf"), float("nan")):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                SkillNodeUpdate(default_name="기술", powers={"attack_buff": value})
            with self.subTest(power=value), self.assertRaises(ValidationError):
                SkillNodeUpdate(default_name="기술", power=value)

    def test_existing_database_gets_empty_overrides_without_changing_old_values(self):
        with self.engine.begin() as connection:
            connection.execute(text("ALTER TABLE skill_nodes DROP COLUMN settings_overrides"))
        ensure_schema(self.engine)
        ensure_schema(self.engine)
        self.db.expire_all()
        node = self.db.get(SkillNode, self.node_id)
        self.assertEqual(node.settings_overrides, {})
        self.assertEqual(node.default_name, "기존 기술")

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
