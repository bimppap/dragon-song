"""기존 캐릭터 능력치에 박혀 있던 포지션별 "피해 감소" 기본값(수비 50%, 그 외 30%)을 걷어낸다.

포지션별 피해 감소는 상시 능력치가 아니라 **방어 행동을 한 라운드에만** 붙는 값으로 바뀌었다
(app/game_data.py의 get_faction_defend_dmg_r). 예전에는 캐릭터의 dmg_r에 이 값을 더해 저장했으므로,
그대로 두면 상시 감소 + 방어 시 감소가 이중으로 적용된다. 이 스크립트가 그 몫만 빼고,
기술·장신구로 얻은 나머지 피해 감소는 그대로 남긴다.

backfill_dmg_r_faction_default.py(기본값을 넣던 스크립트)의 역작업이며, 한 번만 실행한다.
서버 시작 시 자동 실행되는 migrations.py와는 무관하다.

실행: .venv/bin/python scripts/drop_dmg_r_faction_default.py [--apply]
기본은 미리보기이며, --apply를 줘야 실제로 반영한다.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import SessionLocal
from app.game_data import get_faction_defend_dmg_r
from app.models import Character


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="실제로 반영한다(기본은 미리보기).")
    args = parser.parse_args()

    with SessionLocal.begin() as db:
        characters = db.query(Character).order_by(Character.id).all()
        changed = 0
        for character in characters:
            if not character.faction:
                continue
            before = character.dmg_r
            after = round(before - get_faction_defend_dmg_r(character.faction), 6)
            if after == before:
                continue
            changed += 1
            print(f"  #{character.id} {character.name} ({character.faction}): {before} -> {after}")
            if args.apply:
                character.dmg_r = after
        if not args.apply:
            print(f"미리보기 완료: {changed}명이 바뀝니다. 실제로 반영하려면 --apply를 지정하세요.")
            db.rollback()
            return
        print(f"완료: {changed}명의 피해 감소에서 포지션 기본값을 걷어냈습니다.")


if __name__ == "__main__":
    main()
