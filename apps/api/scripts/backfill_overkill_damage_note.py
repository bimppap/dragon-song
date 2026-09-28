"""이미 저장된 전투 로그의 오버킬 표기에 "가해진 피해"를 채워 넣는다.

지금은 남은 체력보다 큰 피해가 들어가면 `(오버킬 - 가해진 피해 1000)`처럼 잘리기 전 피해를
함께 적지만(app/crud.py의 _overkill_note), 그 전에 쌓인 로그에는 `(오버킬)`만 남아 있다.
다행히 같은 줄의 계산식이 `min(<실제 피해식>, 남은 체력 N)` 형태라, 앞쪽 식을 계산하면
잘리기 전 피해를 되살릴 수 있다.

안전장치: 아래를 모두 통과한 줄만 고친다.
  - 계산식이 `min(...)` 한 겹으로 감싸여 있고, 콤마로 실제 피해식과 남은 체력이 나뉜다.
  - 한글 이름표를 걷어낸 식이 숫자·연산자·floor/min/max로만 이루어져 있다.
  - 식을 계산한 값 raw와 남은 체력 N에 대해 min(raw, N)이 로그에 적힌 피해 숫자와 같다.
하나라도 어긋나면 그 줄은 건드리지 않는다.

1회성 스크립트이며 서버 시작 시 자동 실행되는 migrations.py와는 무관하다.
실행: .venv/bin/python scripts/backfill_overkill_damage_note.py [--apply]
기본은 미리보기이며, --apply를 줘야 실제로 반영한다.
"""

import argparse
import math
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import SessionLocal
from app.models import BattleSession

OLD_NOTE = " (오버킬)"
# 로그에 적힌 "실제로 깎인 피해" 숫자. 줄마다 앞뒤 문구가 달라 첫 번째 피해 숫자를 쓴다.
DEALT_PATTERN = re.compile(r"(\d[\d,]*)\s*(?:지속 )?피해")
# 이름표를 걷어낸 뒤 남아도 되는 글자. 이 밖의 글자가 있으면 계산하지 않는다.
SAFE_EXPRESSION = re.compile(r"^[\d\s.,+\-*/()]*(?:(?:floor|min|max)[\d\s.,+\-*/()]*)*$")
EVAL_NAMES = {"floor": math.floor, "min": min, "max": max, "__builtins__": {}}


def strip_labels(formula: str) -> str:
    """계산식에서 한글 이름표와 퍼센트 기호를 걷어내 숫자와 연산자만 남긴다."""
    stripped = formula.replace("×", "*").replace("%", "")
    stripped = re.sub(r"[^\d\s.,+\-*/()a-z]", " ", stripped)
    return re.sub(r"\s+", " ", stripped).strip()


def split_outer_min(formula: str) -> tuple[str, str] | None:
    """`min(A, B)` 한 겹을 A와 B로 나눈다. 그 형태가 아니면 None."""
    if not formula.startswith("min(") or not formula.endswith(")"):
        return None
    inner = formula[len("min("):-1]
    depth = 0
    for index, char in enumerate(inner):
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
        elif char == "," and depth == 0:
            return inner[:index], inner[index + 1:]
    return None


def evaluate(expression: str) -> float | None:
    if not expression or not SAFE_EXPRESSION.match(expression):
        return None
    try:
        value = eval(expression, EVAL_NAMES, {})  # noqa: S307 - 위에서 허용 문자만 통과시킨다
    except Exception:
        return None
    return value if isinstance(value, (int, float)) else None


def raw_damage_for(event: str, formula: str | None) -> int | None:
    """그 줄의 잘리기 전 피해. 되살릴 수 없으면 None."""
    if not formula:
        return None
    dealt_match = DEALT_PATTERN.search(event)
    if not dealt_match:
        return None
    dealt = int(dealt_match.group(1).replace(",", ""))
    parts = split_outer_min(strip_labels(formula))
    if parts is None:
        return None
    raw, remaining = evaluate(parts[0]), evaluate(parts[1])
    if raw is None or remaining is None:
        return None
    raw, remaining = math.floor(raw), math.floor(remaining)
    # 계산한 값이 이 줄의 피해 숫자와 맞아떨어질 때만 믿는다.
    if min(raw, remaining) != dealt or raw <= dealt:
        return None
    return raw


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="실제로 반영한다(기본은 미리보기).")
    args = parser.parse_args()

    with SessionLocal.begin() as db:
        sessions = db.query(BattleSession).order_by(BattleSession.id).all()
        changed_lines = skipped_lines = changed_sessions = 0
        for session in sessions:
            log = [dict(entry) for entry in (session.log or [])]
            touched = False
            for entry in log:
                calculations = dict(entry.get("calculations") or {})
                events = list(entry.get("events") or [])
                for index, event in enumerate(events):
                    if not event.endswith(OLD_NOTE):
                        continue
                    raw = raw_damage_for(event, calculations.get(event))
                    if raw is None:
                        skipped_lines += 1
                        continue
                    updated = f"{event[:-len(OLD_NOTE)]} (오버킬 - 가해진 피해 {raw})"
                    events[index] = updated
                    if event in calculations:
                        calculations[updated] = calculations.pop(event)
                    changed_lines += 1
                    touched = True
                    if changed_lines <= 8:
                        print(f"  #{session.id} {updated}")
                entry["events"] = events
                entry["calculations"] = calculations
            if touched:
                changed_sessions += 1
                if args.apply:
                    session.log = log
        summary = f"오버킬 {changed_lines}줄 수정 / 되살리지 못해 그대로 둔 줄 {skipped_lines}개 · 전투 {changed_sessions}개"
        if not args.apply:
            print(f"미리보기 완료: {summary}. 실제로 반영하려면 --apply를 지정하세요.")
            db.rollback()
            return
        print(f"완료: {summary}")


if __name__ == "__main__":
    main()
