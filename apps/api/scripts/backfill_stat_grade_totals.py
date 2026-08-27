"""기존 캐릭터(러너 소유, member_id IS NOT NULL)에 능력치 등급 기반 스탯 계산을 소급 적용한다.

관리자가 수동으로 값을 채워 넣는 캐릭터(member_id IS NULL)는 건드리지 않는다.
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
        characters = db.query(Character).filter(Character.member_id.isnot(None)).all()
        updated = 0
        for character in characters:
            stats = calculate_stat_grade_totals(
                character.stat_courage,
                character.stat_endurance,
                character.stat_charity,
                character.stat_wisdom,
            )
            character.hp = stats["hp_max"]
            character.hp_max = stats["hp_max"]
            character.atk = stats["atk"]
            character.def_ = stats["def"]
            character.dmg_p = stats["dmg_p"]
            character.dmg_r = stats["dmg_r"]
            character.presence = stats["presence"]
            character.heal_eff = stats["heal_eff"]
            character.skill_eff_true = stats["skill_eff_true"]
            character.skill_eff_fixed = stats["skill_eff_fixed"]
            character.mp = stats["mp_max"]
            character.mp_max = stats["mp_max"]
            character.mp_regen = stats["mp_regen"]
            updated += 1
            print(f"  #{character.id} {character.name}: {stats}")
        db.commit()
        print(f"완료: {updated}명의 캐릭터를 갱신했습니다.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
