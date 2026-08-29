import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

# Supabase 무료 플랜은 최대 직접 연결(direct connection) 수를 60개로 제한한다
# (풀러(Supavisor)의 클라이언트 한도는 이보다 훨씬 큰 200개). 이 60개 상한은
# 배포된 서버·로컬 개발 서버 등 이 프로젝트에 붙는 모든 클라이언트가 공유한다.
# API 서버는 워커 프로세스 1개로만 운영되므로(워커마다 풀이 따로 생김에 주의),
# pool_size + max_overflow 합이 이 60개 한도 안에서 여유를 두는 값이어야 한다.
# 초과 요청은 즉시 실패시키지 않고 잠시 대기했다가 반납된 커넥션을 재사용한다.
# 워커를 여러 개로 늘리거나 로컬 개발을 이 DB에 동시에 붙일 계획이면 그만큼
# 여유분을 남기고 값을 낮춰야 한다(DB_POOL_SIZE/DB_MAX_OVERFLOW로 조절).
engine = create_engine(
    DATABASE_URL,
    pool_size=int(os.getenv("DB_POOL_SIZE", "25")),
    max_overflow=int(os.getenv("DB_MAX_OVERFLOW", "10")),
    pool_timeout=30,
    pool_pre_ping=True,
    pool_recycle=1800,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
