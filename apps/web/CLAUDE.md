@AGENTS.md

# Dragon Song — Web (Next.js)

## 스택
- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS v4 (`@import "tailwindcss"` 방식, `postcss.config.mjs` 사용)
- ag-grid-react (테이블), lucide-react (아이콘)

---

## 공용 컴포넌트 우선 사용 원칙

> **페이지나 컴포넌트를 작성할 때는 반드시 아래 공용 컴포넌트를 먼저 사용해야 한다.**
> 직접 `<button>`, `<input>` 등 HTML 기본 요소를 쓰지 말 것.

### 위치: `components/ui/`

| 컴포넌트 | 파일 | 주요 export |
|---|---|---|
| Button | `components/ui/button.tsx` | `Button`, `buttonVariants` |
| Badge | `components/ui/badge.tsx` | `Badge` |
| Input | `components/ui/input.tsx` | `Input` |
| Textarea | `components/ui/textarea.tsx` | `Textarea` |
| Select | `components/ui/select.tsx` | `Select`, `SelectTrigger`, `SelectContent`, `SelectItem`, `SelectValue`, `SelectGroup`, `SelectLabel` |
| Combobox | `components/ui/combobox.tsx` | `Combobox` (검색 가능한 드롭다운) |
| Checkbox | `components/ui/checkbox.tsx` | `Checkbox` |
| RadioGroup | `components/ui/radio-group.tsx` | `RadioGroup`, `RadioGroupItem` |
| Card | `components/ui/card.tsx` | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` |
| Pagination | `components/ui/pagination.tsx` | `Pagination`, `PaginationContent`, `PaginationItem`, `PaginationLink`, `PaginationPrevious`, `PaginationNext`, `PaginationEllipsis` |
| Calendar | `components/ui/calendar.tsx` | `Calendar` |

### cn 유틸
```ts
import { cn } from "@/lib/utils";
```
클래스 조합이 필요한 경우 항상 `cn()`을 사용한다.

---

## 페이지 작성 규칙

**페이지를 새로 작성하거나 크게 수정할 때는 반드시 `simplify` 스킬을 사용한다.**

```
/simplify
```

### 컴포넌트 구조 원칙
- `app/` 하위 page.tsx는 레이아웃/데이터 연결만 담당
- 실제 UI 로직은 `app/[route]/components/` 또는 `components/` 로 분리
- API 호출은 반드시 `lib/api.ts` 서비스 레이어를 통해서만 한다
- 상태 관리 라이브러리 금지 (useState/useEffect/useCallback으로 처리)

### 스타일 원칙
- 인라인 style 속성 사용 금지 → Tailwind 클래스로 대체
- 색상 팔레트: primary=`indigo-600`, text=`slate-*`, border=`slate-200`
- 다크모드 사용 안 함 (`globals.css`에 `color-scheme: light` 고정)

---

## API 연동
- 백엔드 URL: `NEXT_PUBLIC_API_URL` (`.env.local` → `http://localhost:8000`)
- 모든 fetch는 `lib/api.ts`에 정의된 함수를 호출한다
- 새 엔드포인트 추가 시 `lib/api.ts`에 함수와 타입을 함께 추가한다
