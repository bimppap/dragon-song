"""관리자가 만든 캐릭터의 레벨·AP 투자·직접 수정·기술 선택을 검증한다.

러너 캐릭터와 규칙이 갈리는 지점(등급 상한, 직접 수정 허용 여부)이 핵심이다.
"""
import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.crud import GROWTH_AP_PER_LEVEL
from app.game_data import MAX_AP_STAT_GRADE, MAX_CHARACTER_LEVEL, SKILL_BOOKS, get_level_grade_stats
from app.models import Character, CharacterSkillUnlock, Member, SkillNode
from app.schemas import AdminCharacterUpdate, CharacterCreate


class AdminCharacterEditingTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def make_admin_character(self, lv=1):
        return crud.create_character(self.db, CharacterCreate(
            name=f"admin-{lv}", faction="공격", lv=lv, initialize_growth=True,
        ))

    def detail(self, character_id):
        return crud.get_character_detail(self.db, character_id)

    def unlocked_node_ids(self, character_id):
        return [u.node_id for u in self.db.query(CharacterSkillUnlock).filter_by(character_id=character_id).all()]

    # ── 생성 ────────────────────────────────────────────────
    def test_creation_grants_ap_for_level(self):
        created = self.make_admin_character(lv=5)
        detail = self.detail(created.id)
        self.assertEqual(detail.lv, 5)
        self.assertEqual(detail.ap, 10 + 4 * GROWTH_AP_PER_LEVEL)
        # 성장 초기화 캐릭터는 모든 등급이 0에서 시작한다.
        self.assertEqual((detail.stat_courage, detail.stat_endurance, detail.stat_charity, detail.stat_wisdom), (0, 0, 0, 0))
        self.assertEqual(detail.hp, detail.hp_max)

    # ── 레벨 변경 ────────────────────────────────────────────
    def test_raising_level_grants_ap(self):
        character = self.make_admin_character(lv=1)
        before = self.detail(character.id).ap
        after = crud.patch_admin_character(self.db, character.id, 4, {})
        self.assertEqual(after.lv, 4)
        self.assertEqual(after.ap, before + 3 * GROWTH_AP_PER_LEVEL)

    def test_lowering_level_reclaims_ap(self):
        character = self.make_admin_character(lv=5)
        after = crud.patch_admin_character(self.db, character.id, 2, {})
        self.assertEqual(after.ap, 10 + 1 * GROWTH_AP_PER_LEVEL)

    def test_lowering_level_below_spent_ap_is_rejected(self):
        character = self.make_admin_character(lv=10)  # AP 28
        # 받은 AP를 거의 다 투자해 두면(9등급까지 18 AP), 레벨을 내려 회수할 AP가 모자란다.
        for _ in range(9):
            crud.upgrade_character_stat_with_ap(self.db, character.id, "stat_courage", 1)
        self.assertEqual(self.detail(character.id).ap, 10)
        with self.assertRaises(HTTPException) as ctx:
            crud.patch_admin_character(self.db, character.id, 1, {})
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(self.detail(character.id).lv, 10)

    def test_level_is_capped_at_the_maximum(self):
        """레벨 상한은 11. 생성 시 더 높은 값을 넣어도 상한으로 잘린다."""
        created = crud.create_character(self.db, CharacterCreate(
            name="over", faction="공격", lv=50, initialize_growth=True,
        ))
        detail = self.detail(created.id)
        self.assertEqual(detail.lv, MAX_CHARACTER_LEVEL)
        self.assertEqual(detail.ap, 10 + (MAX_CHARACTER_LEVEL - 1) * GROWTH_AP_PER_LEVEL)

    def test_admin_update_rejects_level_above_the_maximum(self):
        from pydantic import ValidationError
        with self.assertRaises(ValidationError):
            AdminCharacterUpdate(lv=MAX_CHARACTER_LEVEL + 1)
        # 상한값 자체는 통과한다.
        self.assertEqual(AdminCharacterUpdate(lv=MAX_CHARACTER_LEVEL).lv, MAX_CHARACTER_LEVEL)

    def test_sp_cost_is_flat_beyond_the_level_grade_table(self):
        """레벨로 인덱싱하는 유일한 표(LEVEL_GRADE_STATS)는 5에서 끝나므로,
        그 위 레벨은 모두 같은 조건이어야 한다(10·11도 마찬가지)."""
        costs = {level: get_level_grade_stats(level)["sp_cost"] for level in range(5, MAX_CHARACTER_LEVEL + 1)}
        self.assertEqual(len(set(costs.values())), 1, costs)

    # ── AP 투자 ─────────────────────────────────────────────
    def test_admin_character_can_pass_the_runner_grade_cap(self):
        character = self.make_admin_character(lv=30)
        for _ in range(9):
            crud.upgrade_character_stat_with_ap(self.db, character.id, "stat_courage", 1)
        detail = self.detail(character.id)
        self.assertEqual(detail.stat_courage, 9)
        self.assertGreater(detail.stat_courage, MAX_AP_STAT_GRADE)
        # 9등급을 넘겨서는 올릴 수 없다.
        with self.assertRaises(HTTPException):
            crud.upgrade_character_stat_with_ap(self.db, character.id, "stat_courage", 1)

    def test_runner_character_still_capped_at_six(self):
        member = Member(login_id="runner", password_hash="x", role="RUNNER")
        self.db.add(member)
        self.db.flush()
        runner = Character(name="runner", faction="공격", ap=99, member_id=member.id)
        self.db.add(runner)
        self.db.commit()
        for _ in range(MAX_AP_STAT_GRADE):
            crud.upgrade_character_stat_with_ap(self.db, runner.id, "stat_courage", 1)
        with self.assertRaises(HTTPException) as ctx:
            crud.upgrade_character_stat_with_ap(self.db, runner.id, "stat_courage", 1)
        self.assertEqual(ctx.exception.status_code, 400)

    def test_stat_upgrades_expose_cost_and_resulting_changes(self):
        character = self.make_admin_character(lv=3)
        upgrades = self.detail(character.id).stat_upgrades
        self.assertIn("stat_courage", upgrades)
        self.assertGreater(upgrades["stat_courage"]["cost"], 0)
        # 1등급 용기는 공격력·최대체력·주목도를 올린다.
        self.assertEqual(upgrades["stat_courage"]["changes"]["atk"], 3)

    # ── 직접 수정 ────────────────────────────────────────────
    def test_direct_stat_edit(self):
        character = self.make_admin_character(lv=1)
        after = crud.patch_admin_character(self.db, character.id, None, {"atk": 123, "gold": 50})
        self.assertEqual(after.atk, 123)
        self.assertEqual(after.gold, 50)

    def test_direct_grade_edit_recomputes_derived_stats(self):
        character = self.make_admin_character(lv=1)
        before = self.detail(character.id).atk
        after = crud.patch_admin_character(self.db, character.id, None, {"stat_courage": 2})
        self.assertEqual(after.stat_courage, 2)
        self.assertEqual(after.atk, before + 5)  # 2등급 용기 = 공격력 +5

    def test_runner_owned_character_cannot_be_patched(self):
        member = Member(login_id="owner", password_hash="x", role="RUNNER")
        self.db.add(member)
        self.db.flush()
        runner = Character(name="owned", faction="공격", member_id=member.id)
        self.db.add(runner)
        self.db.commit()
        with self.assertRaises(HTTPException) as ctx:
            crud.patch_admin_character(self.db, runner.id, None, {"atk": 5})
        self.assertEqual(ctx.exception.status_code, 400)

    def test_unknown_stat_is_rejected(self):
        character = self.make_admin_character(lv=1)
        with self.assertRaises(HTTPException) as ctx:
            crud.patch_admin_character(self.db, character.id, None, {"name": "해킹"})
        self.assertEqual(ctx.exception.status_code, 400)

    # ── 포지션 변경 ──────────────────────────────────────────
    def test_changing_faction_shifts_damage_reduction_base(self):
        """수비는 피해 감소 50%, 나머지는 30%에서 출발한다. 포지션을 바꾸면 그 차이만 움직여야 한다."""
        character = self.make_admin_character(lv=1)  # 공격
        before = self.detail(character.id)
        self.assertEqual(before.faction, "공격")
        self.assertAlmostEqual(before.dmg_r, 0.3, places=6)

        after = crud.patch_admin_character(self.db, character.id, None, {}, "수비")
        self.assertEqual(after.faction, "수비")
        self.assertAlmostEqual(after.dmg_r, 0.5, places=6)

        back = crud.patch_admin_character(self.db, character.id, None, {}, "치유")
        self.assertEqual(back.faction, "치유")
        self.assertAlmostEqual(back.dmg_r, 0.3, places=6)

    def test_faction_change_keeps_other_damage_reduction_bonuses(self):
        """기술·장신구로 붙은 피해 감소는 포지션을 바꿔도 남아 있어야 한다."""
        character = self.make_admin_character(lv=1)
        crud.patch_admin_character(self.db, character.id, None, {"dmg_r": 0.42})  # 0.3 기본 + 0.12 보너스
        after = crud.patch_admin_character(self.db, character.id, None, {}, "수비")
        self.assertAlmostEqual(after.dmg_r, 0.62, places=6)  # 0.5 기본 + 0.12 보너스 유지

    def test_changing_faction_to_the_same_value_is_a_no_op(self):
        character = self.make_admin_character(lv=1)
        before = self.detail(character.id).dmg_r
        after = crud.patch_admin_character(self.db, character.id, None, {}, "공격")
        self.assertAlmostEqual(after.dmg_r, before, places=6)

    def test_invalid_faction_is_rejected(self):
        character = self.make_admin_character(lv=1)
        with self.assertRaises(HTTPException) as ctx:
            crud.patch_admin_character(self.db, character.id, None, {}, "마법")
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(self.detail(character.id).faction, "공격")

    # ── 기술 선택 ────────────────────────────────────────────
    def test_reveal_shows_non_public_nodes_only_when_asked(self):
        """관리자가 기술을 자유롭게 고르려면 비공개 노드까지 보여야 한다(러너에게는 계속 가려진다)."""
        for book in SKILL_BOOKS:
            crud.get_skill_nodes(self.db, book)
        character = self.make_admin_character(lv=1)
        book = next(iter(SKILL_BOOKS))
        # is_public은 관리자가 노드별로 내리는 설정이라, 비공개로 바꿔 둬야 차이가 드러난다.
        target = self.db.query(SkillNode).filter(SkillNode.book == book, SkillNode.tier > 0).first()
        target.is_public = False
        self.db.commit()

        runner_view = crud.get_character_skill_tree(self.db, character.id, book)
        self.assertFalse(next(n for n in runner_view.nodes if n.id == target.id).is_public)

        admin_view = crud.get_character_skill_tree(self.db, character.id, book, reveal=True)
        self.assertTrue(next(n for n in admin_view.nodes if n.id == target.id).is_public)

    def test_admin_can_pick_any_skill_and_replace_it(self):
        for book in SKILL_BOOKS:
            crud.get_skill_nodes(self.db, book)
        character = self.make_admin_character(lv=1)
        nodes = self.db.query(SkillNode).filter(SkillNode.tier > 0).order_by(SkillNode.id).all()
        deep = next(n for n in nodes if n.tier >= 3)
        crud.select_admin_character_skill(self.db, character.id, deep.id)
        self.assertEqual(self.unlocked_node_ids(character.id), [deep.id])
        # 다른 서의 기술을 골라도 선행 조건 없이 교체된다.
        other = next(n for n in nodes if n.tier >= 3 and n.book != deep.book)
        crud.select_admin_character_skill(self.db, character.id, other.id)
        self.assertEqual(self.unlocked_node_ids(character.id), [other.id])


if __name__ == "__main__":
    unittest.main()
