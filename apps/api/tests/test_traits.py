"""관리 페이지 특성 목록의 생성·수정·삭제를 검증한다."""
import unittest

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.schemas import TraitCreate


class TraitTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_create_update_image_and_delete(self):
        trait = crud.create_trait(self.db, TraitCreate(name="  불꽃의 심장 ", effect="공격력 +5\n치명 피해 증가", description="뜨겁다"))
        self.assertEqual((trait.name, trait.effect), ("불꽃의 심장", "공격력 +5\n치명 피해 증가"))
        crud.create_trait(self.db, TraitCreate(name="얼음 갑옷"))
        self.assertEqual([t.name for t in crud.list_traits(self.db)], ["불꽃의 심장", "얼음 갑옷"])

        updated = crud.update_trait(self.db, trait.id, TraitCreate(name="불꽃의 심장", effect="공격력 +7", description=""))
        self.assertEqual((updated.effect, updated.description), ("공격력 +7", ""))
        self.assertEqual(crud.set_trait_image(self.db, trait.id, "https://img/trait.webp").image_url, "https://img/trait.webp")

        self.assertEqual(crud.delete_trait(self.db, trait.id), "https://img/trait.webp")
        self.assertEqual([t.name for t in crud.list_traits(self.db)], ["얼음 갑옷"])
        with self.assertRaises(HTTPException):
            crud.update_trait(self.db, trait.id, TraitCreate(name="없음"))

    def test_name_is_required(self):
        for name in ("", "   "):
            with self.subTest(name=name), self.assertRaises(ValidationError):
                TraitCreate(name=name)


if __name__ == "__main__":
    unittest.main()
