"""기존 캐릭터의 "피해 감소"(dmg_r) 기본값을 포지션 기준(공격/치유 30%, 수비 50%)으로 소급 적용한다.

- 러너 소유 캐릭터(member_id IS NOT NULL): 능력치 등급 기반 총합(calculate_stat_grade_totals)을
  포지션 기본값을 반영해 재계산한다(인내 등급으로 얻은 추가 피해 감소는 그대로 유지됨).
- 관리자가 수동으로 만든 캐릭터(member_id IS NULL): 포지션 기본값을 그대로 덮어쓴다.

1회성 데이터 백필 스크립트이며, 서버 시작 시 자동 실행되는 migrations.py와는 무관하다.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import SessionLocal
from app.game_data import calculate_stat_grade_totals
from app.models import Character


def main() -> None:
    db = SessionLocal()
    try:
        characters = db.query(Character).all()
        updated = 0
        for character in characters:
            before = character.dmg_r
            if character.member_id is not None:
                stats = calculate_stat_grade_totals(
                    character.stat_courage,
                    character.stat_endurance,
                    character.stat_charity,
                    character.stat_wisdom,
                    faction=character.faction,
                )
                character.dmg_r = stats["dmg_r"]
            else:
                character.dmg_r = 0.5 if character.faction == "수비" else 0.3
            if character.dmg_r != before:
                updated += 1
                print(f"  #{character.id} {character.name} ({character.faction}): {before} -> {character.dmg_r}")
        db.commit()
        print(f"완료: {updated}명의 캐릭터 피해 감소 값을 갱신했습니다.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
