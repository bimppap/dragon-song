import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

# Supabase 세션 모드 풀러(포트 5432)는 클라이언트 수를 15개로 제한한다. 이 상한은
# 배포된 서버·로컬 개발 서버 등 이 프로젝트에 붙는 모든 클라이언트가 공유한다.
# 설정을 지정하지 않으면 SQLAlchemy 기본값(pool_size=5 + max_overflow=10 = 15)에
# 스레드풀 동시 요청이 겹쳐 풀러 상한을 넘겨 "max clients reached" 오류(500)가 난다.
# 그래서 커넥션 총량을 작게 묶어(overflow 없이) 상한을 절대 잠식하지 않게 하고,
# 초과 요청은 즉시 실패시키지 않고 잠시 대기했다가 반납된 커넥션을 재사용한다.
# 전용 DB 예산이 확보된 환경에서는 DB_POOL_SIZE/DB_MAX_OVERFLOW로 상향할 수 있다.
engine = create_engine(
    DATABASE_URL,
    pool_size=int(os.getenv("DB_POOL_SIZE", "5")),
    max_overflow=int(os.getenv("DB_MAX_OVERFLOW", "0")),
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
