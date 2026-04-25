# Dragon Song

판타지 캐릭터를 관리하는 풀스택 웹 애플리케이션입니다.

## 기술 스택

### Frontend (`apps/web`)
| 기술 | 버전 |
|------|------|
| Next.js | 16.2.4 |
| React | 19.2.4 |
| TypeScript | ^5 |

### Backend (`apps/api`)
| 기술 | 버전 |
|------|------|
| Python | 3.x |
| FastAPI | latest |
| SQLAlchemy | latest |
| PostgreSQL | (psycopg2-binary) |
| Uvicorn | latest |

---

## 로컬 실행 방법

### 사전 요구사항
- Node.js
- Python 3.x
- PostgreSQL

### 1. 환경변수 설정

`apps/api/.env` 파일을 생성하고 아래 내용을 작성합니다.

```env
DATABASE_URL=postgresql://<user>:<password>@localhost:5432/<dbname>
```

### 2. Backend 실행

```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

API 서버가 http://localhost:8000 에서 실행됩니다.

### 3. Frontend 실행

```bash
cd apps/web
npm install
npm run dev
```

웹 앱이 http://localhost:3000 에서 실행됩니다.

### 루트에서 한번에 실행 (스크립트 활용)

```bash
# 백엔드
npm run dev:api

# 프론트엔드
npm run dev:web
```
