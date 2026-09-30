"""기술 노드의 위력·설명 데이터를 지금의 입력 칸 정의에 맞게 정리한다. 1회성 스크립트.

1) 분출(ab_eruption)
분출의 위력 칸은 예전에 "기술 위력"(퍼센트형) 하나였고, 관리자가 거기에 존재감 증가(20%~50%)를
넣어 두었다. 이후 칸이 "피격 시 반응 피해"(power, 정수형) + "존재감 증가"(presence, 퍼센트형)로
나뉘었는데 저장값은 그대로 남아서
- 전투에서 반응 피해가 0.2~0.5(버림하면 0)로 계산되고,
- 설명의 {피격 시 반응 피해} 자리표시자가 "20%"처럼 퍼센트로 채워진다.

예전 power 값(존재감)을 presence로 옮기고, power는 행에 남아 있던 반응 피해(10~25)로,
power 형식은 정수형으로 되돌린다.

2) 살포 VI·제압 VI만 형식이 퍼센트형으로 저장돼 있다(살포 VI는 36이 0.36으로 들어가 있다).
   정수형으로 바꾸고 값도 입력한 숫자(36)로 되돌린다.

3) 복제(ab_clone)는 저장 칸 수·효율 감소를 depth별 입력 칸으로 옮겼다. 직접 쓴 설명의 숫자를
   자리표시자로 바꿔, 공통 설명 하나로 depth마다 값이 채워지게 한다(보이는 문장은 그대로다).

이미 정리한 노드는 건너뛰므로 여러 번 돌려도 된다.

기본은 바꿀 내용만 출력한다. 실제로 저장하려면 --apply를 붙인다.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import SessionLocal
from app import crud
from app.models import SkillNode


CLONE_TEMPLATE = (
    "비전투 상황에서 아군의 기술을 '선택하여 저장'합니다. 전투 중 저장된 기술을 '지정하여 사용'할 수 있습니다. "
    "최대 {저장 가능 기술 수}개의 기술을 저장할 수 있습니다.\n"
    "[상시적용] '기술 효율 (비례)'가 {기술 효율(비례) 감소} 만큼 감소합니다. "
    "'기술 효율 (고정)'이 {기술 효율(고정) 감소} 만큼 감소합니다."
)


def fix_flat_valor_skills(db) -> int:
    changed = 0
    nodes = db.query(SkillNode).filter(SkillNode.var_name.in_(["ab_sparge", "ab_suppressing"])).with_for_update().all()
    for node in nodes:
        overrides = dict(node.settings_overrides or {})
        units = dict(overrides.get("power_units", {}))
        if units.get("power") != "percent":
            continue
        # 퍼센트형으로 적힌 36%(0.36)를 정수 36으로 되돌린다.
        power = round(float(overrides.get("power", node.power or 0.0)) * 100, 6)
        print(f"#{node.id} {node.default_name}: 위력 {overrides.get('power', node.power)} → {power:g}, 형식 percent → flat")
        units["power"] = "flat"
        overrides.update(power=power, power_units=units)
        node.settings_overrides = overrides
        node.power = power
        changed += 1
    return changed


def fix_clone_descriptions(db) -> int:
    changed = 0
    for node in db.query(SkillNode).filter(SkillNode.var_name == "ab_clone").with_for_update().all():
        before = crud._skill_node_description(node)
        if not node.description_override or node.description_override == CLONE_TEMPLATE:
            continue
        node.description_override = CLONE_TEMPLATE
        after = crud._skill_node_description(node)
        if after != before:
            # 숫자가 기본값과 다른 설명은 손대지 않는다(보이는 문장이 바뀌면 안 된다).
            print(f"건너뜀 (설명 수치가 기본값과 다름): #{node.id} {node.default_name}\n  {before!r}\n  {after!r}")
            db.expire(node, ["description_override"])
            continue
        print(f"#{node.id} {node.default_name}: 설명을 자리표시자 템플릿으로")
        changed += 1
    return changed


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
            powers = dict(node.powers or {})
            if abs(old_power - float(node.power or 0.0)) > 1e-9:
                # 예전 칸에 존재감을 넣어 둔 노드: 행의 power에는 반응 피해가 남아 있다.
                reaction_damage = float(node.power or 0.0)
                powers["presence"] = old_power
            else:
                # 지금 칸("피격 시 반응 피해")에 퍼센트형으로 입력한 노드: 60 → 0.6으로 저장돼 있다.
                reaction_damage = round(old_power * 100, 6)
            node.power = reaction_damage
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
        changed += fix_flat_valor_skills(db)
        changed += fix_clone_descriptions(db)
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
