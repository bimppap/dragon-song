# Dragon Song

판타지 캐릭터를 관리하는 풀스택 웹 애플리케이션입니다.

## 주요 기능

- **회원가입/로그인** — 아이디·비밀번호 기반 계정 생성(비밀번호 암호화 저장) 및 JWT 로그인. 가입 시 기본 권한은 RUNNER이며, ADMIN 권한을 가진 회원은 모든 기능에 접근할 수 있음
- **캐릭터 생성(RUNNER 온보딩)** — 로그인 후 캐릭터가 없으면 이름·진영(공격/수비/치유)·AP 2포인트를 용기/인내/자애/지혜에 투자하는 생성 화면으로 이동하며, 완료 시 본인 캐릭터 페이지로 연결됨
- **캐릭터 관리** — 캐릭터 목록 조회, 상세 정보 확인, 신규 캐릭터 생성 (HP/공격력/방어력/골드/AP/경험치 관리, ADMIN 전용)
- **출석부** — 날짜별 출석 체크 및 출석 보상 지급
- **임무(미션)** — 챕터별 일일/중요 임무 등록, 캐릭터별 진행 현황 관리, 완료 시 보상(골드/경험치/AP/스탯/아이템) 지급
- **도전과제(챌린지)** — 챕터별 도전과제 등록·공개 여부 설정, 달성 현황 관리, 완료 시 보상 지급
- **상점** — 아이템 등록(캐릭터별/전체 구매 제한 설정, ADMIN 전용), 캐릭터별 장바구니 구성 후 일괄 구매(RUNNER는 본인 캐릭터로만 구매 가능)
- **전투** — 챕터별 에너미(적) 등록 및 관리(기본 체력·공격력·인원수별 체력 보정·스킬, ADMIN 전용); 전투 목록, 등급, 역할, 스킬, 스탯 탭은 UI 프로토타입(목업 데이터)으로 구현되어 있음
- **관리자 페이지** — 챕터(시즌) 생성 및 활성 챕터 조회 (ADMIN 전용)

RUNNER는 상점에서 구매만 할 수 있고, 도전과제·임무는 공개된 목록만 조회할 수 있으며, 출석부·전투·관리 페이지에는 접근할 수 없습니다. 이 권한 구분은 프론트엔드뿐 아니라 API 단에서도 강제됩니다.

## 기술 스택

### Frontend (`apps/web`)

| 기술       | 버전   |
| ---------- | ------ |
| Next.js    | 16.2.4 |
| React      | 19.2.4 |
| TypeScript | ^5     |

### Backend (`apps/api`)

| 기술       | 버전              |
| ---------- | ----------------- |
| Python     | 3.x               |
| FastAPI    | latest            |
| SQLAlchemy | latest            |
| PostgreSQL | (psycopg2-binary) |
| Uvicorn    | latest            |

### Infra

| 분야   | 인프라   |
| ------ | -------- |
| 백엔드 | Render   |
| 프론트 | Vercel   |
| DB     | Supabase |

---

## 로컬 실행 방법

### 사전 요구사항

- Node.js
- Python 3.10+
- [uv](https://docs.astral.sh/uv/getting-started/installation/)
- PostgreSQL

### 1. 환경변수 설정

`apps/api/.env` 파일을 생성하고 아래 내용을 작성합니다.

```env
DATABASE_URL=postgresql://<user>:<password>@localhost:5432/<dbname>
JWT_SECRET=<임의의 긴 랜덤 문자열>
```

`JWT_SECRET`은 로그인 토큰 서명에 사용됩니다. 설정하지 않으면 개발용 기본값이 사용되므로, 배포 환경에서는 반드시 별도로 설정해야 합니다.

첫 ADMIN 계정은 회원가입 후 DB에서 직접 권한을 변경해 만듭니다.

```sql
UPDATE members SET role = 'ADMIN' WHERE login_id = '<아이디>';
```

### 2. Backend 실행

```bash
cd apps/api
uv run dev
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
