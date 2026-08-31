"""실제 DB 대신 메모리 DB에서 기술 습득 규칙을 검증한다."""
import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.crud import get_character_skill_tree, unlock_character_skill_node, _reset_character_skills
from app.db import Base
from app.models import Character, CharacterSkillUnlock, SkillNode

BOOKS = ["용맹의 서", "불굴의 서", "헌신의 서", "탐구의 서"]


class SkillProgressionTest(unittest.TestCase):
    def test_single_book_and_path(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        with Session(engine) as db:
            character = Character(name="test", sp=10000)
            db.add(character)
            db.commit()
            for book in BOOKS:
                tree = get_character_skill_tree(db, character.id, book)
                self.assertTrue(all(n.tier == 0 for n in tree.nodes if n.unlocked))

            def node(book, tier, branch=None, col=None):
                return db.query(SkillNode).filter_by(book=book, tier=tier, branch=branch, col=col).one()

            def unlock(skill):
                return unlock_character_skill_node(db, character.id, skill.id)

            def reject(skill, message):
                before = character.sp
                count = db.query(CharacterSkillUnlock).count()
                with self.assertRaises(HTTPException) as caught:
                    unlock(skill)
                self.assertEqual(caught.exception.status_code, 400)
                self.assertIn(message, caught.exception.detail)
                self.assertEqual(character.sp, before)
                self.assertEqual(db.query(CharacterSkillUnlock).count(), count)

            book = BOOKS[0]
            reject(node(book, 2, 0, 0), "이전 단계")
            unlock(node(book, 1, 0))
            for other_book in BOOKS[1:]:
                reject(node(other_book, 1, 0), "다른 서")
            for branch in [1, 2]:
                reject(node(book, 1, branch), "다른 계열")
            unlock(node(book, 2, 0, 0))
            reject(node(book, 2, 0, 1), "세부 경로")
            for tier in range(3, 7):
                tree = unlock(node(book, tier, 0, 0))
                self.assertEqual(max(n.tier for n in tree.nodes if n.unlocked), tier)
            _reset_character_skills(db, character)
            db.commit()
            self.assertEqual(character.sp, 10000)
            unlock(node(BOOKS[1], 1, 2))
        engine.dispose()


if __name__ == "__main__":
    unittest.main()
