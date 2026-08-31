"""능력치 등급업 AP 비용 버그(4~6등급도 1AP만 차감되던 버그) 소급 처리.

영향받은 캐릭터(용기 4등급, AP 1만 내고 도달한 것으로 확인됨: id 17, 19, 26, 48)를
용기 3등급으로 되돌리고, 그 등급업에 냈던 AP 1을 환불한다. 1회성 스크립트.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import SessionLocal
from app.game_data import calculate_stat_grade_totals
from app.models import Character

AFFECTED_CHARACTER_IDS = [17, 19, 26, 48]
STAT = "stat_courage"
REVERT_TO_GRADE = 3
AP_REFUND = 1  # 잘못 소모된 AP(3->4등급 전환 시 원래 2AP여야 하나 1AP만 냄)


def main() -> None:
    db = SessionLocal()
    try:
        characters = db.query(Character).filter(Character.id.in_(AFFECTED_CHARACTER_IDS)).all()
        for character in characters:
            if getattr(character, STAT) != REVERT_TO_GRADE + 1:
                print(f"  #{character.id} {character.name}: 예상과 다른 등급이라 건너뜀 (현재 {STAT}={getattr(character, STAT)})")
                continue

            before = calculate_stat_grade_totals(
                character.stat_courage, character.stat_endurance, character.stat_charity, character.stat_wisdom,
            )
            setattr(character, STAT, REVERT_TO_GRADE)
            after = calculate_stat_grade_totals(
                character.stat_courage, character.stat_endurance, character.stat_charity, character.stat_wisdom,
            )

            character.atk += after["atk"] - before["atk"]
            character.def_ += after["def"] - before["def"]
            character.dmg_p += after["dmg_p"] - before["dmg_p"]
            character.dmg_r += after["dmg_r"] - before["dmg_r"]
            character.presence += after["presence"] - before["presence"]
            character.heal_eff += after["heal_eff"] - before["heal_eff"]
            character.skill_eff_true += after["skill_eff_true"] - before["skill_eff_true"]
            character.skill_eff_fixed += after["skill_eff_fixed"] - before["skill_eff_fixed"]
            character.mp_regen += after["mp_regen"] - before["mp_regen"]

            hp_delta = after["hp_max"] - before["hp_max"]
            character.hp_max += hp_delta
            character.hp = max(0, min(character.hp + hp_delta, character.hp_max))

            mp_delta = after["mp_max"] - before["mp_max"]
            character.mp_max += mp_delta
            character.mp = max(0, min(character.mp + mp_delta, character.mp_max))

            character.ap += AP_REFUND

            print(f"  #{character.id} {character.name}: {STAT} {REVERT_TO_GRADE + 1}->{REVERT_TO_GRADE}, AP +{AP_REFUND} (now {character.ap})")

        db.commit()
        print(f"완료: {len(characters)}명 처리.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
