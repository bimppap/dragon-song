import os
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.db import SessionLocal, get_db
from app.models import Member

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-me")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60
REFRESH_TOKEN_EXPIRE_DAYS = 7


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def create_access_token(member_id: int) -> str:
    payload = {
        "sub": str(member_id),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def get_current_member(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> Member:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="인증이 필요합니다.")

    token = authorization.removeprefix("Bearer ").strip()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다.")

    member = db.query(Member).filter(Member.id == int(payload["sub"])).first()
    if not member:
        raise HTTPException(status_code=401, detail="회원을 찾을 수 없습니다.")
    return member


def authenticate_ws_token(token: str | None) -> Member | None:
    """WebSocket 연결용 인증. 브라우저 WebSocket은 커스텀 헤더를 못 붙이므로
    쿼리파라미터로 받은 토큰을 get_current_member와 동일한 방식으로 검증한다."""
    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None

    db = SessionLocal()
    try:
        return db.query(Member).filter(Member.id == int(payload["sub"])).first()
    finally:
        db.close()


# STAFF는 권한 탭(스텝 임명/해제) 접근을 제외하면 ADMIN과 동일한 관리 작업을 수행할 수 있다.
ADMIN_ROLES = {"ADMIN", "STAFF"}


def is_admin_role(role: str) -> bool:
    return role in ADMIN_ROLES


def require_admin(member: Member = Depends(get_current_member)) -> Member:
    if not is_admin_role(member.role):
        raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다.")
    return member


def require_owner_admin(member: Member = Depends(get_current_member)) -> Member:
    """스텝 임명/해제 등 최고 관리자(ADMIN)만 할 수 있는 작업에 사용한다."""
    if member.role != "ADMIN":
        raise HTTPException(status_code=403, detail="최고 관리자 권한이 필요합니다.")
    return member
