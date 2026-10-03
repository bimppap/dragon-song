import unittest
from datetime import timedelta
from unittest import mock

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.auth import REFRESH_TOKEN_EXPIRE_DAYS
from app.db import Base
from app.models import Member, RefreshToken, now_kst


class RefreshTokenTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.member = Member(login_id="runner", password_hash="unused")
        self.db.add(self.member)
        self.db.commit()
        self.token = crud.issue_refresh_token(self.db, self.member.id)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def row(self) -> RefreshToken:
        self.db.expire_all()
        return self.db.query(RefreshToken).filter(RefreshToken.token == self.token).one()

    def at(self, moment):
        return mock.patch.object(crud, "now_kst", return_value=moment)

    def test_refresh_extends_expiry_from_last_use(self):
        # 로그인 6일 뒤에 재발급하면, 그때부터 다시 7일 동안 쓸 수 있다.
        later = now_kst() + timedelta(days=6)
        with self.at(later):
            crud.refresh_access_token(self.db, self.token)
        expires_at = self.row().expires_at
        self.assertEqual(crud._as_kst(expires_at), later + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS))
        # 처음 로그인 기준 7일이 지나도 계속 쓰던 토큰은 유효하다.
        with self.at(later + timedelta(days=2)):
            crud.refresh_access_token(self.db, self.token)

    def test_unused_token_still_expires_after_seven_days(self):
        with self.at(now_kst() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS, minutes=1)):
            with self.assertRaises(HTTPException) as caught:
                crud.refresh_access_token(self.db, self.token)
        self.assertEqual(caught.exception.status_code, 401)


if __name__ == "__main__":
    unittest.main()
