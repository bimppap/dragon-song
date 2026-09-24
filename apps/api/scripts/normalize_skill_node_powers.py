"""기술 노드의 위력·대상 값을 "등급이 이미 반영된 최종값" 규칙에 맞춰 정리한다.

전투 계산이 저장된 위력을 그대로 쓰도록 바뀌었으므로(등급을 다시 곱하지 않는다),
등급당 기본값만 들어 있던 기술과 코드가 무시하던 기술의 값을 채워 넣는다.

- 개선·쇠약: 등급당 기본값 → 등급이 반영된 최종값
- 제압·살포: 값은 그대로(이미 최종값), 코드만 저장값을 쓰도록 바뀜
- 분출: 위력을 반응 피해로, 존재감은 powers.presence로 분리
- 장막: 위력을 체력 소모 비율로, 보호막은 powers.shield로 분리
- 보호: 주목도 이전을 명세(스킬레벨 × 위력 × 2)대로 재계산
- 후광 III 위력 오타(4 → 6), 구호 III~V 대상 수(2 → 3)
- 주입·살포의 등급마다 달랐던 대상/대상 진영 통일
- 표시용 계산식(formula)을 game_data의 현재 명세로 재동기화

6단계(tier 6) 노드는 6단계 효과가 아직 구현 전이라 건드리지 않는다.
1회성 데이터 정리 스크립트이며, 서버 시작 시 자동 실행되는 migrations.py와는 무관하다.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import SessionLocal
from app.game_data import SKILL_BOOKS
from app.models import SkillNode

# var_name → {tier: {컬럼/위력키: 값}}. tier 6은 제외한다.
POWER_FIXES: dict[str, dict[int, dict[str, float]]] = {
    # 등급당 20%p씩 오르는 기술 효율(비례) 증가 + 등급당 2씩 오르는 고정 증가.
    "ab_improve": {
        2: {"power": 0.2, "eff_true": 4},
        3: {"power": 0.3, "eff_true": 6},
        4: {"power": 0.4, "eff_true": 8},
        5: {"power": 0.5, "eff_true": 10},
    },
    # 등급당 2%p씩 오르는 "받는 피해 증가".
    "ab_weaken": {2: {"power": 0.04}, 3: {"power": 0.06}, 4: {"power": 0.08}, 5: {"power": 0.10}},
    # 반응 피해는 등급 × 5, 존재감은 전 등급 20%.
    "ab_eruption": {
        2: {"power": 10, "presence": 0.2},
        3: {"power": 15, "presence": 0.2},
        4: {"power": 20, "presence": 0.2},
        5: {"power": 25, "presence": 0.2},
    },
    # 체력 소모 비율 = 0.5 - 등급 × 0.05, 보호막 = 등급.
    "ab_veil": {
        2: {"power": 0.40, "shield": 2},
        3: {"power": 0.35, "shield": 3},
        4: {"power": 0.30, "shield": 4},
        5: {"power": 0.25, "shield": 5},
    },
    # 주목도 이전 = 등급 × 회복 비율 × 2.
    "ab_protect": {
        1: {"attn_transfer": 0.2},
        2: {"attn_transfer": 0.6},
        3: {"attn_transfer": 1.2},
        4: {"attn_transfer": 2.0},
        5: {"attn_transfer": 3.0},
    },
    # 전체 회복 기본값은 등급 × 2. III만 4로 잘못 들어가 있었다.
    "ab_halo": {2: {"power": 4}, 3: {"power": 6}, 4: {"power": 8}, 5: {"power": 10}},
}

# var_name → {tier: (target, target_side)}. 등급마다 달라질 이유가 없는 값을 통일한다.
TARGET_FIXES: dict[str, dict[int, tuple[str, str]]] = {
    # 구호 대상 수 = floor(2 + 등급 × 0.34).
    "ab_aid": {1: ("2", "ALLY"), 2: ("2", "ALLY"), 3: ("3", "ALLY"), 4: ("3", "ALLY"), 5: ("3", "ALLY")},
    # 주입은 적 1명에게 피해를 주고 자신을 강화한다.
    "ab_enchant": {2: ("1", "ENEMY"), 3: ("1", "ENEMY"), 4: ("1", "ENEMY"), 5: ("1", "ENEMY")},
    # 살포는 자신에게 거는 강화다.
    "ab_sparge": {2: ("SELF", "ALLY"), 3: ("SELF", "ALLY"), 4: ("SELF", "ALLY"), 5: ("SELF", "ALLY")},
}


def _formula_by_var_name() -> dict[str, str]:
    formulas: dict[str, str] = {}
    for book in SKILL_BOOKS.values():
        for branch in book["branches"]:
            for skill in (branch["root"], branch["derived"]):
                if skill.get("var_name") and skill.get("formula"):
                    formulas[skill["var_name"]] = skill["formula"]
    return formulas


def main() -> None:
    db = SessionLocal()
    try:
        formulas = _formula_by_var_name()
        changes: list[str] = []
        for node in db.query(SkillNode).filter(SkillNode.var_name.is_not(None)).all():
            if node.tier == 6:
                continue
            name = f"{node.default_name}(t{node.tier})"

            fixes = POWER_FIXES.get(node.var_name, {}).get(node.tier or 0, {})
            if "power" in fixes and node.power != fixes["power"]:
                changes.append(f"{name} 위력 {node.power} → {fixes['power']}")
                node.power = fixes["power"]
            named = {key: value for key, value in fixes.items() if key != "power"}
            if named:
                powers = dict(node.powers or {})
                for key, value in named.items():
                    if powers.get(key) != value:
                        changes.append(f"{name} {key} {powers.get(key)} → {value}")
                        powers[key] = value
                node.powers = powers

            target = TARGET_FIXES.get(node.var_name, {}).get(node.tier or 0)
            if target and (node.target, node.target_side) != target:
                changes.append(f"{name} 대상 {node.target}/{node.target_side} → {target[0]}/{target[1]}")
                node.target, node.target_side = target

            formula = formulas.get(node.var_name)
            if formula and node.formula != formula:
                changes.append(f"{name} 계산식 갱신")
                node.formula = formula

        if not changes:
            print("바꿀 값이 없습니다.")
            return
        db.commit()
        print(f"{len(changes)}건 수정")
        for change in changes:
            print(f"  - {change}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
