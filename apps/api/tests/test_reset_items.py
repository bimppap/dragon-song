"""기술 변경 / 능력치 변경 / 역할·기술·능력치 변경 아이템의 환급과 초기화를 검증한다."""
import unittest

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.game_data import calculate_stat_grade_totals
from app.models import Character, ItemUsage, Purchase, SkillNode
from app.schemas import ItemCreate

BOOK = "용맹의 서"


class ResetItemTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        # 가입 시 용기 1 / 인내 1(=무료 2포인트)에서 시작해, AP로 용기를 4등급까지 올린 상태를 만든다.
        stats = calculate_stat_grade_totals(1, 1, 0, 0, faction="공격")
        self.character = Character(
            name="tester", faction="공격", ap=10, sp=100,
            stat_courage=1, stat_endurance=1,
            hp=stats["hp_max"], hp_max=stats["hp_max"], atk=stats["atk"], def_=stats["def"],
            dmg_p=stats["dmg_p"], dmg_r=stats["dmg_r"], presence=stats["presence"],
            heal_eff=stats["heal_eff"], skill_eff_true=stats["skill_eff_true"],
            skill_eff_fixed=stats["skill_eff_fixed"],
            mp=stats["mp_max"], mp_max=stats["mp_max"], mp_regen=stats["mp_regen"],
        )
        self.db.add(self.character)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def make_item(self, stat):
        item = crud.create_item(self.db, ItemCreate(
            name=stat, price_gold=10, item_type="consumable",
            effects=[{"stat": stat, "delta": 0}],
        ))
        self.db.add(Purchase(character_id=self.character.id, item_id=item.id, quantity=1))
        self.db.commit()
        return item

    def spend_ap_and_sp(self):
        """용기를 1→4등급(AP 1+1+2=4)으로 올리고, 기술 1단계를 습득해 SP를 소모한다."""
        crud.upgrade_character_stat_with_ap(self.db, self.character.id, "stat_courage", 3)
        crud.get_character_skill_tree(self.db, self.character.id, BOOK)  # 기술 노드 시드 생성
        node = self.db.query(SkillNode).filter_by(book=BOOK, tier=1, branch=0).one()
        crud.unlock_character_skill_node(self.db, self.character.id, node.id)
        self.db.refresh(self.character)

    def usage(self):
        return self.db.query(ItemUsage).filter_by(character_id=self.character.id).one()

    def test_skill_reset_refunds_sp_only(self):
        self.spend_ap_and_sp()
        spent_sp = 100 - self.character.sp
        self.assertGreater(spent_sp, 0)
        ap_before, courage_before = self.character.ap, self.character.stat_courage

        crud.use_item(self.db, self.character.id, self.make_item("ap_reset").id)
        self.db.refresh(self.character)

        self.assertEqual(self.character.sp, 100)
        self.assertEqual((self.character.ap, self.character.stat_courage), (ap_before, courage_before))
        self.assertEqual((self.usage().refunded_sp, self.usage().refunded_ap), (spent_sp, 0))

    def test_stat_reset_refunds_ap_including_signup_points(self):
        self.spend_ap_and_sp()
        sp_after_unlock = self.character.sp

        crud.use_item(self.db, self.character.id, self.make_item("stat_reset").id)
        self.db.refresh(self.character)

        # 환급은 0등급 기준: 용기 4등급(1+1+1+2=5AP) + 인내 1등급(1AP) = 6AP.
        # 가입 시 무료로 받은 용기·인내 각 1포인트분도 여기에 포함된다.
        self.assertEqual(self.character.ap, 10 - 4 + 6)
        self.assertEqual(
            (self.character.stat_courage, self.character.stat_endurance,
             self.character.stat_charity, self.character.stat_wisdom),
            (0, 0, 0, 0),
        )
        base = calculate_stat_grade_totals(0, 0, 0, 0)
        self.assertEqual((self.character.atk, self.character.hp_max), (base["atk"], base["hp_max"]))
        self.assertLessEqual(self.character.hp, self.character.hp_max)
        self.assertEqual(self.character.sp, sp_after_unlock)
        self.assertEqual((self.usage().refunded_sp, self.usage().refunded_ap), (0, 6))

    def test_full_reset_refunds_both_and_changes_faction(self):
        self.spend_ap_and_sp()
        spent_sp = 100 - self.character.sp

        crud.use_item(self.db, self.character.id, self.make_item("full_reset").id, chosen_faction="수비")
        self.db.refresh(self.character)

        self.assertEqual(self.character.sp, 100)
        self.assertEqual(self.character.ap, 10 - 4 + 6)
        self.assertEqual(self.character.stat_courage, 0)
        self.assertEqual((self.usage().refunded_sp, self.usage().refunded_ap), (spent_sp, 6))
        # 공격(30%) -> 수비(50%). 등급 보너스가 사라진 뒤에도 역할 기본값은 남는다.
        self.assertEqual(self.character.faction, "수비")
        self.assertEqual(self.character.dmg_r, 0.5)

    def test_full_reset_requires_a_faction_and_keeps_the_item(self):
        self.spend_ap_and_sp()
        item = self.make_item("full_reset")
        sp_before, ap_before = self.character.sp, self.character.ap

        for invalid in (None, "성직자"):
            with self.assertRaises(HTTPException) as caught:
                crud.use_item(self.db, self.character.id, item.id, chosen_faction=invalid)
            self.assertEqual(caught.exception.status_code, 400)
        self.db.refresh(self.character)

        self.assertEqual((self.character.sp, self.character.ap), (sp_before, ap_before))
        self.assertEqual(self.character.faction, "공격")
        self.assertEqual(self.db.query(ItemUsage).count(), 0)

    def test_keeping_the_same_faction_keeps_its_damage_reduction_base(self):
        crud.use_item(self.db, self.character.id, self.make_item("full_reset").id, chosen_faction="공격")
        self.db.refresh(self.character)

        # 등급 보너스는 사라지지만 공격 역할의 기본 피해 감소 30%는 중복 가감 없이 그대로 남는다.
        self.assertEqual(self.character.faction, "공격")
        self.assertEqual(self.character.dmg_r, 0.3)

    def test_reset_effects_rejected_on_battle_only_and_equipment(self):
        for stat in ("ap_reset", "stat_reset", "full_reset"):
            with self.assertRaises(ValidationError):
                ItemCreate(name="x", price_gold=1, item_type="consumable", battle_only=True,
                           effects=[{"stat": stat, "delta": 0}])
            with self.assertRaises(ValidationError):
                ItemCreate(name="x", price_gold=1, item_type="accessory", special_merchant=True,
                           effects=[{"stat": stat, "delta": 0}])


if __name__ == "__main__":
    unittest.main()
