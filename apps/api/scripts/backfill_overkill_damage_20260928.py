"""옛 전투 로그의 "(오버킬)"에 잘리기 전 가해진 피해를 채운다. --apply 없이 실행하면 검증만 한다.

7123485 이전 로그는 오버킬 여부만 "(오버킬)"로 적었다. 지금 형식인 "(오버킬 - 가해진 피해 N)"으로 바꾸고,
계산식(calculations)의 키도 새 문구로 옮긴다. 피해·보상·스냅샷은 건드리지 않는다.

N은 다음 순서로 되살린다.
- 계산식이 "min(식, 남은 체력 H)"이면 식을 다시 계산한다(로그에 적힌 피해는 잘린 값이다).
- 계산식이 없는 옛 "소환수 …에게 N 피해" 줄은 잘리기 전 피해를 그대로 적었으므로 그 N을 쓴다.
하나라도 되살리지 못하면 저장하지 않는다.
"""
import argparse
import copy
import json
import math
import re
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import SessionLocal
from app.models import BattleSession

LEGACY_NOTE = " (오버킬)"
NUMBER = r"-?\d+(?:\.\d+)?"


def _raw_from_formula(formula: str) -> tuple[int, int] | None:
    """min(식, 남은 체력 H)에서 (식 값, H). 식은 "이름 값" 쌍과 연산자만 있으므로 이름을 지우고 계산한다."""
    match = re.fullmatch(rf"min\((.*), 남은 체력 ({NUMBER})\)", formula)
    if not match:
        return None
    expression = re.sub(r"floor|[^\d.+\-*/()×\s]", lambda m: m.group() if m.group() == "floor" else " ", match.group(1))
    expression = expression.replace("×", "*")
    if re.search(r"[^\d.+\-*/()\s]", expression.replace("floor", "")):
        return None
    value = eval(expression, {"__builtins__": {}}, {"floor": math.floor})  # noqa: S307 - 저장된 계산식의 숫자·연산자만 남긴 값
    return math.floor(value), int(float(match.group(2)))


def _raw_damage(event: str, formula: str | None) -> int | None:
    if formula:
        parsed = _raw_from_formula(formula)
        if parsed is None:
            return None
        raw, remaining = parsed
        return raw if raw > remaining else None
    match = re.search(rf"소환수 .+에게 ({NUMBER}) 피해 \[0/({NUMBER})\]", event)
    if match and int(match.group(1)) > 0:
        return int(match.group(1))
    return None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        backups: dict[int, list] = {}
        failures: list[str] = []
        changed_lines = 0
        for battle in db.query(BattleSession).order_by(BattleSession.id).all():
            if not any(LEGACY_NOTE in event for entry in battle.log or [] for event in entry.get("events") or []):
                continue
            backups[battle.id] = copy.deepcopy(battle.log)
            log = copy.deepcopy(battle.log)
            for entry in log:
                calculations = entry.get("calculations") or {}
                events = entry.get("events") or []
                for index, event in enumerate(events):
                    if LEGACY_NOTE not in event:
                        continue
                    raw = _raw_damage(event, calculations.get(event))
                    if raw is None:
                        failures.append(f"#{battle.id} {event} | {calculations.get(event)}")
                        continue
                    updated = event.replace(LEGACY_NOTE, f" (오버킬 - 가해진 피해 {raw})", 1)
                    events[index] = updated
                    if event in calculations:
                        calculations[updated] = calculations.pop(event)
                    changed_lines += 1
                    print(f"#{battle.id} R{entry.get('round')} {updated}")
            battle.log = log

        print(f"바꿀 줄 {changed_lines}개 · 전투 {len(backups)}개")
        if failures:
            print("되살리지 못한 줄이 있어 저장하지 않습니다:")
            print("\n".join(failures))
            db.rollback()
            return
        if not args.apply:
            print("검증 완료. --apply로 저장합니다.")
            db.rollback()
            return
        with tempfile.NamedTemporaryFile(mode="w", prefix="dragon-song-overkill-before-", suffix=".json", delete=False) as backup:
            json.dump(backups, backup, ensure_ascii=False)
            print(f"변경 전 백업: {backup.name}")
        db.commit()
        print("저장했습니다.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
