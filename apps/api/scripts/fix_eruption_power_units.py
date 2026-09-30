"""분출(ab_eruption) 노드의 위력을 지금의 입력 칸 정의에 맞게 옮긴다. 1회성 스크립트.

분출의 위력 칸은 예전에 "기술 위력"(퍼센트형) 하나였고, 관리자가 거기에 존재감 증가(20%~50%)를
넣어 두었다. 이후 칸이 "피격 시 반응 피해"(power, 정수형) + "존재감 증가"(presence, 퍼센트형)로
나뉘었는데 저장값은 그대로 남아서
- 전투에서 반응 피해가 0.2~0.5(버림하면 0)로 계산되고,
- 설명의 {피격 시 반응 피해} 자리표시자가 "20%"처럼 퍼센트로 채워진다.

예전 power 값(존재감)을 presence로 옮기고, power는 행에 남아 있던 반응 피해(10~25)로,
power 형식은 정수형으로 되돌린다. 이미 옮긴 노드는 건너뛰므로 여러 번 돌려도 된다.

기본은 바꿀 내용만 출력한다. 실제로 저장하려면 --apply를 붙인다.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import SessionLocal
from app.models import SkillNode


def main(apply: bool) -> None:
    db = SessionLocal()
    try:
        nodes = (
            db.query(SkillNode)
            .filter(SkillNode.var_name == "ab_eruption")
            .order_by(SkillNode.tier)
            .with_for_update()
            .all()
        )
        changed = 0
        for node in nodes:
            overrides = dict(node.settings_overrides or {})
            units = dict(overrides.get("power_units", {}))
            if units.get("power") != "percent":
                print(f"건너뜀 (이미 정수형): #{node.id} {node.default_name}")
                continue
            old_power = float(overrides.get("power", node.power or 0.0))
            reaction_damage = float(node.power or 0.0)
            powers = dict(node.powers or {})
            # 예전 칸에 존재감을 넣어 둔 노드만 옮긴다. 0이면 옮길 존재감이 없다.
            if old_power > 0:
                powers["presence"] = old_power
            overrides["power"] = reaction_damage
            units["power"] = "flat"
            overrides["power_units"] = units
            print(
                f"#{node.id} {node.default_name}: 반응 피해 {old_power:g} → {reaction_damage:g}, "
                f"존재감 {(node.powers or {}).get('presence')} → {powers.get('presence')}, 형식 percent → flat"
            )
            node.settings_overrides = overrides
            node.powers = powers
            changed += 1
        if not changed:
            print("바꿀 노드가 없습니다.")
            db.rollback()
            return
        if apply:
            db.commit()
            print(f"{changed}개 노드를 저장했습니다.")
        else:
            db.rollback()
            print(f"{changed}개 노드를 바꿀 예정입니다. 저장하려면 --apply를 붙여 다시 실행하세요.")
    finally:
        db.close()


if __name__ == "__main__":
    main(apply="--apply" in sys.argv)
