"""전투 게시판 글 가져오기: 최신 글부터 페이지를 넘기다가 범위 시작보다 앞선 글이 나오면 멈춘다."""
import unittest
from datetime import datetime
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.models import KST, NaverSession


def article(article_id: int, minute: int, head: str | None = "공격", writer: str = "A") -> dict:
    written_at = datetime(2026, 9, 13, 23, minute, tzinfo=KST)
    return {"type": "ARTICLE", "item": {
        "articleId": article_id,
        "headName": head,
        "writerInfo": {"nickName": writer},
        "subject": f"글 {article_id}",
        "writeDateTimestamp": int(written_at.timestamp() * 1000),
    }}


class NaverCafePostsTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.db.add(NaverSession(id=crud.NAVER_SESSION_ID, nid_aut="aut", nid_ses="ses"))
        self.db.commit()
        # 한 페이지에 2개씩, 글 10~1이 최신순으로 이어진다(글번호 n은 23시 n분 작성).
        self.pages = [[article(n, n) for n in (top, top - 1)] for top in range(10, 0, -2)]
        page_size = patch.object(crud, "NAVER_CAFE_BOARD_PAGE_SIZE", 2)
        page_size.start()
        self.addCleanup(page_size.stop)
        self.requested_pages: list[int] = []

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def fetch(self, **kwargs):
        def fake_page(client, menu_id, page):
            self.requested_pages.append(page)
            items = self.pages[page - 1] if page <= len(self.pages) else []
            return {"result": {"articleList": items}}

        with patch.object(crud, "_fetch_naver_cafe_board_page", fake_page):
            return crud.fetch_naver_cafe_posts(self.db, 44, **kwargs)

    def test_article_range_pages_until_start_and_sorts_ascending(self):
        posts = self.fetch(start_article_id=4, end_article_id=7)

        self.assertEqual([post.article_id for post in posts], [4, 5, 6, 7])
        self.assertEqual(self.requested_pages, [1, 2, 3, 4])  # 4페이지에서 글 3을 보고 멈춘다

    def test_time_range_includes_both_ends(self):
        posts = self.fetch(
            start_at=datetime(2026, 9, 13, 23, 2, tzinfo=KST),
            end_at=datetime(2026, 9, 13, 23, 3),  # 시간대가 없으면 한국 시각으로 본다
        )

        self.assertEqual([post.article_id for post in posts], [2, 3])

    def test_keeps_header_and_writer(self):
        self.pages = [[article(2, 2, head="방어", writer="루체릴"), article(1, 1, head=None)]]

        posts = self.fetch(start_article_id=1, end_article_id=2)

        self.assertEqual([(post.head_name, post.writer_name) for post in posts], [(None, "A"), ("방어", "루체릴")])

    def test_stops_at_short_last_page(self):
        self.pages[-1] = self.pages[-1][:1]  # 마지막 페이지가 한 페이지를 다 채우지 못한다

        posts = self.fetch(start_article_id=1, end_article_id=100)

        self.assertEqual(len(posts), 9)
        self.assertEqual(self.requested_pages, [1, 2, 3, 4, 5])

    def test_stops_at_empty_page(self):
        posts = self.fetch(start_article_id=1, end_article_id=100)

        self.assertEqual(len(posts), 10)
        self.assertEqual(self.requested_pages, [1, 2, 3, 4, 5, 6])

    def test_rejects_range_that_never_reaches_start(self):
        self.pages = [[article(1000 - 2 * page, 0), article(999 - 2 * page, 0)] for page in range(crud.NAVER_CAFE_BOARD_MAX_PAGES + 1)]

        with self.assertRaises(HTTPException) as ctx:
            self.fetch(start_article_id=1, end_article_id=1000)

        self.assertEqual(ctx.exception.status_code, 400)

    def test_requires_exactly_one_complete_range(self):
        for kwargs in (
            {},
            {"start_article_id": 1},
            {"start_article_id": 1, "end_article_id": 2, "start_at": datetime.now(KST), "end_at": datetime.now(KST)},
        ):
            with self.assertRaises(HTTPException) as ctx:
                self.fetch(**kwargs)
            self.assertEqual(ctx.exception.status_code, 400)

    def test_expired_session_marks_session_invalid(self):
        def expired(client, menu_id, page):
            return {"error": {"reason": "ONLY_ACCESSIBLE_CAFE_MEMBER", "message": "카페멤버만 들어갈 수 있는 카페입니다."}}

        with patch.object(crud, "_fetch_naver_cafe_board_page", expired), self.assertRaises(HTTPException) as ctx:
            crud.fetch_naver_cafe_posts(self.db, 44, start_article_id=1, end_article_id=2)

        self.assertEqual(ctx.exception.status_code, 502)
        self.assertFalse(self.db.get(NaverSession, crud.NAVER_SESSION_ID).is_valid)


if __name__ == "__main__":
    unittest.main()
