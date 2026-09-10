"""챕터와 무관하게 달성할 수 있는 상시 도전과제를 검증한다.

Challenge.chapter는 FK가 아닌 자유 문자열이라, 별도 컬럼 대신 예약 챕터 이름으로 구분한다.
그래서 같은 이름의 실제 챕터가 생기지 않도록 막는 것이 규칙의 핵심이다.
"""
import unittest
from datetime import date

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.game_data import ALWAYS_CHALLENGE_CHAPTER
from app.models import Character
from app.schemas import ChallengeCreate, ChapterCreate


class AlwaysChallengeTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.character = Character(name="runner", faction="공격")
        self.db.add(self.character)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def make_challenge(self, chapter, name="과제"):
        return crud.create_challenge(self.db, ChallengeCreate(
            chapter=chapter, name=name, description="설명", reward="보상",
        ))

    def chapter_payload(self, name):
        return ChapterCreate(name=name, start_date=date(2026, 1, 1), end_date=date(2026, 2, 1))

    def test_always_challenge_is_created_and_listed(self):
        challenge = self.make_challenge(ALWAYS_CHALLENGE_CHAPTER, "상시 과제")
        self.assertEqual(challenge.chapter, ALWAYS_CHALLENGE_CHAPTER)
        names = [c.name for c in crud.get_challenges(self.db)]
        self.assertIn("상시 과제", names)

    def test_always_challenge_creates_progress_rows_like_any_other(self):
        """상시 과제도 일반 과제와 똑같이 캐릭터별 진행 행이 생겨야 달성 처리가 된다."""
        challenge = self.make_challenge(ALWAYS_CHALLENGE_CHAPTER, "상시 과제")
        progress = crud.get_challenge_progress(self.db, challenge.id)
        self.assertEqual([p.character_id for p in progress], [self.character.id])

    def test_chapter_filter_separates_always_from_regular(self):
        self.make_challenge(ALWAYS_CHALLENGE_CHAPTER, "상시 과제")
        self.make_challenge("1챕터", "1챕터 과제")
        always = [c.name for c in crud.get_challenges(self.db, ALWAYS_CHALLENGE_CHAPTER)]
        regular = [c.name for c in crud.get_challenges(self.db, "1챕터")]
        self.assertEqual(always, ["상시 과제"])
        self.assertEqual(regular, ["1챕터 과제"])

    def test_chapter_cannot_be_named_with_the_reserved_word(self):
        with self.assertRaises(HTTPException) as ctx:
            crud.create_chapter(self.db, self.chapter_payload(ALWAYS_CHALLENGE_CHAPTER))
        self.assertEqual(ctx.exception.status_code, 400)

    def test_chapter_cannot_be_renamed_to_the_reserved_word(self):
        chapter = crud.create_chapter(self.db, self.chapter_payload("1챕터"))
        with self.assertRaises(HTTPException) as ctx:
            crud.update_chapter(self.db, chapter.id, self.chapter_payload(ALWAYS_CHALLENGE_CHAPTER))
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(crud.get_chapters(self.db)[0].name, "1챕터")

    def test_normal_chapter_names_are_unaffected(self):
        chapter = crud.create_chapter(self.db, self.chapter_payload("2챕터"))
        self.assertEqual(chapter.name, "2챕터")


if __name__ == "__main__":
    unittest.main()
