import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.game_data import build_skill_node_specs, dynamic_derived_description
from app.models import SkillNode
from app.schemas import SkillNodeUpdate


class InquiryDerivedSkillSpecTest(unittest.TestCase):
    """탐구의 서 파생(개선/쇠약/복제)의 스펙과 depth별 설명."""

    def _spec(self, branch: int, tier: int) -> dict:
        return next(
            spec for spec in build_skill_node_specs("탐구의 서")
            if spec.get("branch") == branch and spec.get("col") == 1 and spec.get("tier") == tier
        )

    def test_derived_skills_have_var_names(self):
        self.assertEqual(self._spec(0, 2)["var_name"], "ab_improve")
        self.assertEqual(self._spec(1, 2)["var_name"], "ab_weaken")
        self.assertEqual(self._spec(2, 2)["var_name"], "ab_clone")

    def test_derived_skill_names(self):
        self.assertEqual(self._spec(0, 2)["default_name"], "개선")
        self.assertEqual(self._spec(1, 2)["default_name"], "쇠약")
        self.assertEqual(self._spec(2, 2)["default_name"], "복제")

    def test_description_scales_with_depth(self):
        # 개선: 기술 위력 10% × 스킬레벨, 기술 효율(고정) 2 × 스킬레벨.
        self.assertIn("+20%", dynamic_derived_description("ab_improve", 2))
        self.assertIn("+4", dynamic_derived_description("ab_improve", 2))
        self.assertIn("+30%", dynamic_derived_description("ab_improve", 3))
        self.assertIn("+6", dynamic_derived_description("ab_improve", 3))

        # 쇠약: 기술 위력 2% × 스킬레벨.
        self.assertIn("4%", dynamic_derived_description("ab_weaken", 2))
        self.assertIn("6%", dynamic_derived_description("ab_weaken", 3))

        # 복제: 슬롯 수 = depth, 효율 보정 -50%+10%×depth / -20+4×depth.
        clone2 = dynamic_derived_description("ab_clone", 2)
        self.assertIn("최대 2개", clone2)
        self.assertIn("-30%", clone2)
        self.assertIn("-12", clone2)
        clone5 = dynamic_derived_description("ab_clone", 5)
        self.assertIn("최대 5개", clone5)
        self.assertIn("+0%", clone5)

    def test_no_dynamic_description_for_other_skills(self):
        self.assertIsNone(dynamic_derived_description("ab_strike", 2))


class InquiryDerivedReconcileTest(unittest.TestCase):
    """placeholder(속박/공명)로 시드된 기존 DB를 최신 스펙으로 맞추는 보정."""

    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        # 예전 시드 상태를 흉내낸다: 이름은 옛 이름, 메타는 비어 있음.
        for tier in range(2, 7):
            self.db.add(SkillNode(
                book="탐구의 서", branch=1, col=1, tier=tier,
                default_name=f"속박 {tier}", description="설명 준비 중입니다.",
                is_placeholder=True, is_public=True,
            ))
            self.db.add(SkillNode(
                book="탐구의 서", branch=2, col=1, tier=tier,
                default_name=f"공명 {tier}", description="설명 준비 중입니다.",
                is_placeholder=True, is_public=True,
            ))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_reconcile_renames_and_fills_meta(self):
        crud.reconcile_inquiry_derived_skills(self.db)

        weaken = (
            self.db.query(SkillNode)
            .filter(SkillNode.branch == 1, SkillNode.col == 1, SkillNode.tier == 2)
            .one()
        )
        self.assertTrue(weaken.default_name.startswith("쇠약"))
        self.assertEqual(weaken.var_name, "ab_weaken")
        self.assertEqual(weaken.power, 0.02)
        self.assertEqual(weaken.target_side, "ENEMY")

        clone = (
            self.db.query(SkillNode)
            .filter(SkillNode.branch == 2, SkillNode.col == 1, SkillNode.tier == 2)
            .one()
        )
        self.assertTrue(clone.default_name.startswith("복제"))
        self.assertEqual(clone.var_name, "ab_clone")
        self.assertEqual(clone.cost, 4)

    def test_description_is_computed_per_tier_even_for_old_rows(self):
        crud.reconcile_inquiry_derived_skills(self.db)
        nodes = {
            node.tier: node
            for node in self.db.query(SkillNode).filter(SkillNode.branch == 2, SkillNode.col == 1).all()
        }
        # 저장된 "설명 준비 중입니다." 대신 tier로 계산한 설명이 나온다.
        depth2 = crud._resolved_skill_node_value(nodes[2], "description")
        depth4 = crud._resolved_skill_node_value(nodes[4], "description")
        self.assertIn("최대 2개", depth2)
        self.assertIn("최대 4개", depth4)


class InquiryDerivedDescriptionEditTest(unittest.TestCase):
    """개선/쇠약/복제도 관리자가 쓴 설명이 depth 자동 설명보다 우선해야 한다."""

    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        crud.get_skill_nodes(self.db, "탐구의 서")

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def node(self, branch: int, tier: int = 3) -> SkillNode:
        return self.db.query(SkillNode).filter_by(
            book="탐구의 서", branch=branch, col=1, tier=tier).one()

    def save(self, node: SkillNode, description: str):
        crud.update_skill_node(self.db, node.id, SkillNodeUpdate(
            default_name=node.default_name, description=description))
        self.db.expire_all()
        return crud._to_skill_node_read(node).description

    def test_written_description_wins_and_clearing_restores_auto_text(self):
        for branch, label in ((0, "개선"), (1, "쇠약"), (2, "복제")):
            with self.subTest(label=label):
                node = self.node(branch)
                written = f"'{label}' 직접 쓴 설명"
                self.assertEqual(self.save(node, written), written)
                # 비우면 depth로 자동 생성된 설명으로 되돌아간다.
                restored = self.save(node, "")
                self.assertNotEqual(restored, written)
                self.assertEqual(restored, crud.derived_auto_description(self.node(branch)))

    def test_clone_hides_fields_it_inherits_from_the_copied_skill(self):
        """복제는 복제한 기술의 대상·진영·발동 순서를 그대로 쓰므로 노드에 입력할 값이 없다."""
        clone = self.node(2)
        self.assertEqual(crud._to_skill_node_read(clone).inapplicable_fields,
                         ["target", "target_side", "activation_order"])
        # 다른 탐구 파생기는 종전대로 입력한다.
        self.assertEqual(crud._to_skill_node_read(self.node(0)).inapplicable_fields, [])

    def test_description_is_saved_per_depth(self):
        self.save(self.node(0, 3), "depth 3 전용")
        self.assertEqual(crud._to_skill_node_read(self.node(0, 3)).description, "depth 3 전용")
        self.assertEqual(crud._to_skill_node_read(self.node(0, 4)).description,
                         crud.derived_auto_description(self.node(0, 4)))

    def test_saving_the_prefilled_auto_text_keeps_following_depth(self):
        node = self.node(0, 4)
        auto = crud._to_skill_node_read(node).description
        self.save(node, auto)
        self.assertIsNone(self.node(0, 4).description_override)


if __name__ == "__main__":
    unittest.main()
