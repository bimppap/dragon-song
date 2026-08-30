import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

# DATABASE_URL은 Supavisor 풀러의 "트랜잭션 모드"(포트 6543)를 사용한다.
# "세션 모드"(포트 5432)는 클라이언트 커넥션 하나가 Postgres 백엔드 커넥션 하나를
# 그대로 물고 있는 방식이라 풀러 자체 상한(무료 플랜 15개)에 쉽게 걸리지만,
# 트랜잭션 모드는 트랜잭션이 끝나는 즉시 백엔드 커넥션을 반납해 여러 클라이언트가
# 훨씬 적은 백엔드 커넥션을 돌려쓸 수 있다. 이 프로젝트는 요청마다 세션을 열고
# 닫는 짧은 트랜잭션만 쓰고(LISTEN/NOTIFY, advisory lock, 세션 단위 SET, 이름 있는
# prepared statement 등 세션 상태에 의존하는 기능 없음) 트랜잭션 모드와 호환된다.
# Postgres 직접 연결 한도(60)와도 별개이므로, 워커·로컬 개발 서버가 여럿 붙어도
# pool_size + max_overflow를 넉넉하게 낮게 유지해 두 한도 모두에 여유를 둔다.
engine = create_engine(
    DATABASE_URL,
    pool_size=int(os.getenv("DB_POOL_SIZE", "40")),
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
