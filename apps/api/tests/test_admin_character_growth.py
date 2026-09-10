import unittest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app import crud
from app.db import Base
from app.models import Character, CharacterSkillUnlock, Member, SkillNode
from app.schemas import CharacterCreate


class AdminCharacterGrowthTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite:///:memory:')
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        created = crud.create_character(self.db, CharacterCreate(name='관리자 캐릭터', faction='치유', lv=8, initialize_growth=True))
        self.character = self.db.get(Character, created.id)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_creation_level_delta_and_repeat_no_extra_ap(self):
        c = self.character
        self.assertEqual((c.lv, c.ap, c.stat_courage, c.hp, c.mp), (8, 24, 0, 20, 5))
        crud.patch_admin_character(self.db, c.id, 10, {})
        self.assertEqual(c.ap, 28)
        crud.patch_admin_character(self.db, c.id, 10, {})
        self.assertEqual(c.ap, 28)
        crud.patch_admin_character(self.db, c.id, 8, {})
        self.assertEqual(c.ap, 24)

    def test_ap_investment_through_grade_nine_and_preview(self):
        c = self.character
        for grade in range(1, 10):
            preview = crud.get_character_detail(self.db, c.id).stat_upgrades['stat_courage']
            old_ap, old_atk = c.ap, c.atk
            crud.upgrade_character_stat_with_ap(self.db, c.id, 'stat_courage', 1)
            self.assertEqual(c.stat_courage, grade)
            self.assertEqual(old_ap - c.ap, preview['cost'])
            self.assertEqual(c.atk - old_atk, preview['changes'].get('atk', 0))
        with self.assertRaises(HTTPException):
            crud.upgrade_character_stat_with_ap(self.db, c.id, 'stat_courage', 1)

    def test_inline_stat_change_preserves_others_and_ap(self):
        c = self.character
        crud.patch_admin_character(self.db, c.id, None, {'atk': 123, 'dmg_r': 0.45, 'over_heal': True})
        ap = c.ap
        crud.patch_admin_character(self.db, c.id, None, {'stat_courage': 3})
        self.assertGreater(c.atk, 123)
        self.assertEqual((c.ap, c.dmg_r, c.over_heal), (ap, 0.45, True))
        with self.assertRaises(HTTPException):
            crud.patch_admin_character(self.db, c.id, None, {'member_id': 1})
        with self.assertRaises(HTTPException):
            crud.patch_admin_character(self.db, c.id, None, {'stat_courage': 10})

    def test_free_skill_replacement_removes_old_effects(self):
        c = self.character
        nodes = [SkillNode(book='헌신의 서', branch=0, col=0, tier=tier, default_name=f'기술{tier}', effects=[{'stat': 'atk', 'delta': delta}], is_public=False) for tier, delta in ((2, 10), (5, 25))]
        self.db.add_all(nodes)
        self.db.commit()
        original = c.atk
        crud.select_admin_character_skill(self.db, c.id, nodes[0].id)
        self.assertEqual(c.atk, original + 10)
        crud.select_admin_character_skill(self.db, c.id, nodes[1].id)
        self.assertEqual(c.atk, original + 25)
        self.assertEqual(self.db.query(CharacterSkillUnlock).filter_by(character_id=c.id).count(), 1)
        self.assertEqual(c.sp, 0)

    def test_runner_cannot_use_unrestricted_changes(self):
        c = self.character
        member = Member(login_id='runner', password_hash='x', role='RUNNER')
        self.db.add(member)
        self.db.flush()
        c.member_id = member.id
        c.stat_courage = 6
        self.db.commit()
        with self.assertRaises(HTTPException):
            crud.patch_admin_character(self.db, c.id, 20, {})
        with self.assertRaises(HTTPException):
            crud.select_admin_character_skill(self.db, c.id, 1)
        with self.assertRaises(HTTPException):
            crud.upgrade_character_stat_with_ap(self.db, c.id, 'stat_courage', 1)
