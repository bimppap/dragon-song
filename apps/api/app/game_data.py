"""정적 게임 밸런스 참고 데이터 (성장 등급표, 기술트리 기본 구성)."""

# 성장 등급(lv)에 따른 기본 능력치와, 해당 등급에서 기술을 강화할 때 필요한 AP.
LEVEL_GRADE_STATS = [
    {"grade": 0, "ap_cost": 0, "atk": 1, "def": 0, "hp": 20},
    {"grade": 1, "ap_cost": 1, "atk": 3, "def": 2, "hp": 25},
    {"grade": 2, "ap_cost": 1, "atk": 5, "def": 4, "hp": 30},
    {"grade": 3, "ap_cost": 1, "atk": 7, "def": 6, "hp": 35},
    {"grade": 4, "ap_cost": 1, "atk": 9, "def": 8, "hp": 40},
    {"grade": 5, "ap_cost": 1, "atk": 11, "def": 10, "hp": 45},
]


def get_level_grade_stats(grade: int) -> dict:
    clamped = max(0, min(grade, len(LEVEL_GRADE_STATS) - 1))
    return LEVEL_GRADE_STATS[clamped]


# ── 능력치 등급(용기/인내/자애/지혜) → 파생 스탯 ────────────────────────────
# 아무 등급도 올리지 않았을 때의 기본 능력치.
STAT_GRADE_BASE = {
    "atk": 1,
    "def": 0,
    "hp_max": 20,
    "dmg_p": 0.0,
    "dmg_r": 0.0,
    "presence": 0.0,
    "heal_eff": 0.0,
    "skill_eff_fixed": 0.0,  # 기술 효율 (비례, %)
    "skill_eff_true": 0,    # 기술 효율 (고정)
    "mp_max": 5,
    "mp_regen": 0,
}

_ZERO_GRADE = {
    "atk": 0, "def": 0, "hp_max": 0, "dmg_p": 0.0, "dmg_r": 0.0,
    "presence": 0.0, "heal_eff": 0.0, "skill_eff_fixed": 0.0,
    "skill_eff_true": 0, "mp_max": 0, "mp_regen": 0,
}

# 각 리스트의 인덱스가 곧 등급이다(0등급 = 보너스 없음). 등급별 보너스는
# 누적이 아니라 해당 등급의 값만 그대로 적용된다(하위 등급 값은 더하지 않음).
COURAGE_GRADE_BONUS = [
    _ZERO_GRADE,
    {**_ZERO_GRADE, "atk": 3, "hp_max": 2, "presence": 0.05},
    {**_ZERO_GRADE, "atk": 5, "hp_max": 4, "presence": 0.10},
    {**_ZERO_GRADE, "atk": 8, "hp_max": 8, "dmg_p": 0.05, "presence": 0.15},
    {**_ZERO_GRADE, "atk": 11, "hp_max": 10, "dmg_p": 0.10, "presence": 0.20},
    {**_ZERO_GRADE, "atk": 15, "hp_max": 12, "dmg_p": 0.15, "presence": 0.25},
    {**_ZERO_GRADE, "atk": 20, "hp_max": 14, "dmg_p": 0.30, "presence": 0.30},
    {**_ZERO_GRADE, "atk": 25, "hp_max": 16, "dmg_p": 0.40, "presence": 0.35},
    {**_ZERO_GRADE, "atk": 30, "hp_max": 18, "dmg_p": 0.50, "presence": 0.40},
    {**_ZERO_GRADE, "atk": 35, "hp_max": 20, "dmg_p": 0.60, "presence": 0.45},
]

ENDURANCE_GRADE_BONUS = [
    _ZERO_GRADE,
    {**_ZERO_GRADE, "def": 2, "hp_max": 5, "presence": 0.10},
    {**_ZERO_GRADE, "def": 4, "hp_max": 10, "presence": 0.20},
    {**_ZERO_GRADE, "def": 6, "hp_max": 15, "presence": 0.30},
    {**_ZERO_GRADE, "def": 7, "hp_max": 20, "dmg_r": 0.02, "presence": 0.40},
    {**_ZERO_GRADE, "def": 10, "hp_max": 30, "dmg_r": 0.04, "presence": 0.60},
    {**_ZERO_GRADE, "def": 15, "hp_max": 40, "dmg_r": 0.06, "presence": 0.80},
    {**_ZERO_GRADE, "def": 20, "hp_max": 60, "dmg_r": 0.08, "presence": 1.00},
    {**_ZERO_GRADE, "def": 25, "hp_max": 80, "dmg_r": 0.10, "presence": 1.50},
    {**_ZERO_GRADE, "def": 30, "hp_max": 100, "dmg_r": 0.15, "presence": 2.00},
]

CHARITY_GRADE_BONUS = [
    _ZERO_GRADE,
    {**_ZERO_GRADE, "hp_max": 2, "presence": 0.02, "heal_eff": 0.05, "skill_eff_true": 1},
    {**_ZERO_GRADE, "hp_max": 4, "presence": 0.04, "heal_eff": 0.10, "skill_eff_true": 2},
    {**_ZERO_GRADE, "hp_max": 8, "presence": 0.06, "heal_eff": 0.15, "skill_eff_true": 3},
    {**_ZERO_GRADE, "hp_max": 10, "presence": 0.08, "heal_eff": 0.20, "skill_eff_true": 4, "mp_max": 1},
    {**_ZERO_GRADE, "hp_max": 12, "presence": 0.10, "heal_eff": 0.25, "skill_eff_true": 5, "mp_max": 1},
    {**_ZERO_GRADE, "hp_max": 14, "presence": 0.12, "heal_eff": 0.30, "skill_eff_true": 6, "mp_max": 1},
    {**_ZERO_GRADE, "hp_max": 16, "presence": 0.14, "heal_eff": 0.40, "skill_eff_true": 8, "mp_max": 2},
    {**_ZERO_GRADE, "hp_max": 18, "presence": 0.16, "heal_eff": 0.50, "skill_eff_true": 10, "mp_max": 2},
    {**_ZERO_GRADE, "hp_max": 20, "presence": 0.18, "heal_eff": 0.60, "skill_eff_true": 15, "mp_max": 2},
]

WISDOM_GRADE_BONUS = [
    _ZERO_GRADE,
    {**_ZERO_GRADE, "skill_eff_fixed": 0.02, "skill_eff_true": 2, "mp_max": 1},
    {**_ZERO_GRADE, "skill_eff_fixed": 0.04, "skill_eff_true": 4, "mp_max": 1},
    {**_ZERO_GRADE, "skill_eff_fixed": 0.06, "skill_eff_true": 6, "mp_max": 1, "mp_regen": 1},
    {**_ZERO_GRADE, "skill_eff_fixed": 0.15, "skill_eff_true": 8, "mp_max": 2, "mp_regen": 1},
    {**_ZERO_GRADE, "skill_eff_fixed": 0.20, "skill_eff_true": 10, "mp_max": 2, "mp_regen": 1},
    {**_ZERO_GRADE, "skill_eff_fixed": 0.25, "skill_eff_true": 12, "mp_max": 2, "mp_regen": 2},
    {**_ZERO_GRADE, "skill_eff_fixed": 0.30, "skill_eff_true": 15, "mp_max": 3, "mp_regen": 2},
    {**_ZERO_GRADE, "skill_eff_fixed": 0.40, "skill_eff_true": 20, "mp_max": 3, "mp_regen": 2},
    {**_ZERO_GRADE, "skill_eff_fixed": 0.50, "skill_eff_true": 25, "mp_max": 3, "mp_regen": 3},
]


def calculate_stat_grade_totals(
    stat_courage: int,
    stat_endurance: int,
    stat_charity: int,
    stat_wisdom: int,
) -> dict:
    """용기/인내/자애/지혜 등급으로부터 기본 능력치를 계산한다.

    각 등급의 보너스는 누적이 아니라 해당 등급의 값만 그대로 더해진다.
    """
    totals = dict(STAT_GRADE_BASE)
    tracks = (
        (stat_courage, COURAGE_GRADE_BONUS),
        (stat_endurance, ENDURANCE_GRADE_BONUS),
        (stat_charity, CHARITY_GRADE_BONUS),
        (stat_wisdom, WISDOM_GRADE_BONUS),
    )
    for grade, table in tracks:
        clamped = max(0, min(grade, len(table) - 1))
        bonus = table[clamped]
        for key, value in bonus.items():
            totals[key] += value
    return {
        key: round(value, 6) if isinstance(value, float) else value
        for key, value in totals.items()
    }


# ── 기술트리 (skill.xlsx "기술 종류" 시트 기반) ─────────────────────────────
#
# 4개의 "서"(용맹/불굴/헌신/탐구)는 캐릭터의 역할(공격/수비/치유)과 무관한 별개 축이며,
# 모든 캐릭터가 4개 서 전부에서 자유롭게 기술을 배울 수 있다.
#
# 구조: 서(book) 1개 = 항상 활성화된 아이덴티티 노드(0단계) + 3계열(branch).
# 각 계열은 1단계(뿌리 기술)에서 시작해, 2단계부터 두 갈래(col 0/1)로 나뉜다.
#   - col 0: 뿌리 기술을 그대로 강화(2~6단계)
#   - col 1: 뿌리 기술에서 파생된 새로운 기술로 전환해 강화(2~6단계)
# 6단계에 도달하면 특별한 이름/효과(tier6_name/tier6_effect)로 진화한다.
#
# skill.xlsx에 값이 비어 있던 항목은 합리적인 기본값으로 채우고 placeholder=True로 표시했다.
# (UI에서 이 값들은 별도 색으로 "기획 확정 전 임시값"임을 표시한다.)


def _skill(
    name: str,
    *,
    trigger_type: str | None = None,
    category: str | None = None,
    stackable: bool | None = None,
    var_name: str | None = None,
    cost: float | None = None,
    power: float | None = None,
    target: str | None = None,
    order: int | None = None,
    formula: str | None = None,
    description: str | None = None,
    tier6_name: str | None = None,
    tier6_effect: str | None = None,
    placeholder: bool = False,
) -> dict:
    return {
        "name": name,
        "trigger_type": trigger_type,
        "category": category,
        "stackable": stackable,
        "var_name": var_name,
        "cost": cost,
        "power": power,
        "target": target,
        "order": order,
        "formula": formula,
        "description": description,
        "tier6_name": tier6_name,
        "tier6_effect": tier6_effect,
        "placeholder": placeholder,
    }


SKILL_BOOKS: dict[str, dict] = {
    "용맹의 서": {
        "branches": [
            {
                "root": _skill(
                    "강타", trigger_type="즉발형", category="피해", stackable=False, var_name="ab_strike",
                    cost=3, power=1.5, target="1", order=6,
                    formula="((1+skill_lv)*skill_power)*(1+skill_eff_fixed)",
                    description="즉발성 피해를 주는 단순한 기술입니다.",
                    tier6_name="격류",
                    tier6_effect="[상시적용] 일반 공격 위력 상승, 일반 공격 시 마나 회복",
                ),
                "derived": _skill(
                    "주입", trigger_type="지속형", category="복합", var_name="ab_enchant",
                    cost=2, target="1", order=1,
                    formula="일반 공격: (skill_lv*(stat_charity+stat_wisdom))+skill_eff_true",
                    description="지속성 강화. 일반 공격 시 자애·지혜에 비례한 [고정] 타입 피해를 주고, 마나 1을 소모합니다(수비 시 마나 1 회복).",
                    tier6_name="증폭",
                    tier6_effect="재사용 시 피해 광역화",
                    placeholder=True,
                ),
            },
            {
                "root": _skill(
                    "분쇄", trigger_type="즉발형", category="피해", stackable=True, var_name="ab_crushing",
                    cost=3, power=0.75, target="1+N", order=4,
                    formula="((1+skill_lv)*skill_power)*(1+skill_eff_fixed)",
                    description="복수의 적에게 즉발성 피해를 주는 기술입니다.",
                    tier6_name="파괴",
                    tier6_effect="피격 대상에게 일회성 약화(피해 감소 -5%) 부여",
                ),
                "derived": _skill(
                    "제압", trigger_type="즉발형", category="피해", stackable=True, var_name="ab_suppressing",
                    cost=4, target="ALL",
                    description="적 전체에게 [고정] 타입 피해를 주는 기술입니다.",
                    tier6_name="초토화",
                    tier6_effect="피격 대상에게 일회성 약화(피해 증폭 -10%) 부여",
                    placeholder=True,
                ),
            },
            {
                "root": _skill(
                    "위해", trigger_type="지속형", category="복합", stackable=True, var_name="ab_harm",
                    cost=3, power=1.0, target="1", order=3,
                    formula="(skill_lv*skill_power)*(1+skill_eff_fixed)",
                    description="적에게 즉발형 피해를 입히고, 차례 시작 시 지속 피해를 입히는 약화 스택을 하나 부여합니다.",
                    placeholder=True,
                ),
                "derived": _skill(
                    "살포", trigger_type="지속형", category="강화", var_name="ab_sparge",
                    cost=4, power=20.0, target="1", order=2,
                    description="위해 스택을 대상 주변으로 확산시키는 기술입니다.",
                    tier6_name="재난",
                    placeholder=True,
                ),
            },
        ],
    },
    "불굴의 서": {
        "branches": [
            {
                "root": _skill(
                    "모루", trigger_type="즉발형", category="복합", var_name="ab_anvil",
                    cost=3, power=0.15, target="SELF", order=3,
                    formula="회복: ((skill_lv*skill_power)*(1+skill_eff_fixed))*(1+heal_eff)",
                    description="자가 회복 + 기술 등급만큼 자신의 약화 스택 제거, 주목도 상승(상승량: 회복 수치*skill_lv).",
                    tier6_name="불굴",
                ),
                "derived": _skill(
                    "결의", trigger_type="지속형", category="지속형",
                    description="아군 전체에게 [고정] 타입 보호막을 부여하는 기술입니다.",
                    tier6_name="성역",
                    tier6_effect="아군 전체 [고정] 타입 보호막",
                    placeholder=True,
                ),
            },
            {
                "root": _skill(
                    "반격", trigger_type="혼합형", category="강화", stackable=False, var_name="ab_counter",
                    cost=3, power=0.05, target="1", order=3,
                    formula="피해 감소: dmg_r+(skill_lv*skill_power)*(1+def_eff) / 반격 피해: (atk+def)*(1+skill_lv)*(1+skill_eff_fixed)",
                    description="자신 또는 지정한 아군에게 오는 공격을 막으며 반격합니다.",
                    placeholder=True,
                ),
                "derived": _skill(
                    "항쟁", trigger_type="지속형", category="강화",
                    description="설명 준비 중입니다.",
                    placeholder=True,
                ),
            },
            {
                "root": _skill(
                    "보호", trigger_type="즉발형", category="회복", var_name="ab_protect",
                    cost=2, power=0.05, target="1", order=7,
                    formula="회복: (((skill_lv+1)*skill_power)*(1+skill_eff_fixed))*(1+heal_eff)",
                    description="지정한 아군의 체력을 회복시키며 주목도를 감소시키고, 감소량의 2배만큼 자신의 주목도를 높입니다.",
                    tier6_name="수호",
                ),
                "derived": _skill(
                    "장막", trigger_type="즉발형", category="회복",
                    power=2.0,
                    description="아군 전체에게 [고정] 타입 보호막을 부여하는 기술입니다.",
                    tier6_effect="아군 전체 [고정] 타입 보호막",
                    placeholder=True,
                ),
            },
        ],
    },
    "헌신의 서": {
        "branches": [
            {
                "root": _skill(
                    "회복", trigger_type="즉발형", category="회복", var_name="ab_cure",
                    cost=2, power=0.2, target="1", order=5,
                    formula="회복: (((skill_lv*skill_power)+0.15)*(1+skill_eff_fixed))*(1+heal_eff)",
                    description="지정한 아군의 체력을 회복시키는 기본 회복 기술입니다.",
                    tier6_name="생명",
                    tier6_effect="오버힐 허용, 대상에게 걸린 약화 n개 해제(n = skill_lv mod 6)",
                ),
                "derived": _skill(
                    "재생", trigger_type="지속형", category="강화", stackable=False, order=4,
                    description="설명 준비 중입니다.",
                    placeholder=True,
                ),
            },
            {
                "root": _skill(
                    "구호", trigger_type="즉발형", category="회복", stackable=True, var_name="ab_aid",
                    cost=3, power=0.1, target="2+N", order=2,
                    formula="회복: ((skill_lv*skill_power)*(1+skill_eff_fixed))*(1+heal_eff)",
                    description="복수의 아군을 체력이 낮은 순서대로 회복시킵니다.",
                    tier6_effect="일회성 강화 부여: 기술 등급만큼 피해 증폭 (기술 대상: 2+skill_lv*0.34+skill_target)",
                    placeholder=True,
                ),
                "derived": _skill(
                    "헌혈", description="설명 준비 중입니다.", placeholder=True,
                ),
            },
            {
                "root": _skill(
                    "정화", trigger_type="즉발형", category="회복", stackable=True, var_name="ab_purification",
                    cost=2, power=0.15, target="1", order=2,
                    formula="회복: (((skill_lv*skill_power)+0.1)*(1+skill_eff_fixed))*(1+heal_eff)",
                    description="지정한 아군의 체력을 회복시키고 기술 등급만큼 약화 스택을 제거합니다.",
                    tier6_name="승화",
                    tier6_effect="해제한 약화 수만큼 강화 스택 부여(약화 상태 방지, 스택*5만큼 피해 증폭)",
                ),
                "derived": _skill(
                    "성정화", cost=4, description="설명 준비 중입니다.", placeholder=True,
                ),
            },
        ],
    },
    "탐구의 서": {
        "branches": [
            {
                "root": _skill(
                    "격려", trigger_type="즉발형", category="강화", stackable=True, var_name="ab_encourage",
                    cost=2, power=0.2, target="1", order=2,
                    formula="강화 수치: (skill_lv*skill_power)*(1+skill_eff_fixed)",
                    description="지정한 아군에게 일회성 강화를 부여합니다.",
                    tier6_name="각성",
                    placeholder=True,
                ),
                "derived": _skill(
                    "개선", stackable=True,
                    description="설명 준비 중입니다.",
                    tier6_name="쇄신",
                    placeholder=True,
                ),
            },
            {
                "root": _skill(
                    "저주", trigger_type="즉발형", category="약화", stackable=True, var_name="ab_curse",
                    cost=3, power=0.05, target="1", order=3,
                    formula="약화 수치: ((skill_lv+1)*skill_power)*(1+skill_eff_fixed)",
                    description="지정한 적군의 피해 증폭을 감소시킵니다.",
                    tier6_name="봉인",
                ),
                "derived": _skill(
                    "속박", category="약화",
                    description="설명 준비 중입니다.",
                    placeholder=True,
                ),
            },
            {
                "root": _skill(
                    "충전", trigger_type="즉발형", category="회복", var_name="ab_charge",
                    cost=4, target="자신 제외", order=1,
                    formula="기술 비용 감소: skill_lv*0.34 / 마나 회복: 2+skill_lv*0.34",
                    description="지정한 아군의 마나를 회복시킵니다.",
                    placeholder=True,
                ),
                "derived": _skill(
                    "공명", description="설명 준비 중입니다.", placeholder=True,
                ),
            },
        ],
    },
}


def build_skill_node_specs(book: str) -> list[dict]:
    """서(book) 하나의 전체 노드 스펙을 (0단계 아이덴티티 + 3계열 x 2경로 x 1~6단계)로 펼친다.

    각 dict는 SkillNode 생성에 필요한 필드(branch/col/tier/default_name/기타 메타데이터)를 담는다.
    """
    config = SKILL_BOOKS.get(book)
    if not config:
        return []

    specs: list[dict] = [{
        "branch": None, "col": None, "tier": 0,
        "default_name": book, "is_placeholder": False,
    }]

    def node_fields(skill: dict, tier: int) -> dict:
        is_top = tier == 6
        name = skill["tier6_name"] if (is_top and skill["tier6_name"]) else skill["name"]
        # 6단계 효과는 기존 개요를 대체하지 않고 추가로 붙는다.
        description = skill["description"]
        if is_top and skill["tier6_effect"]:
            description = f"{description}\n[6단계 추가 효과] {skill['tier6_effect']}" if description else f"[6단계 추가 효과] {skill['tier6_effect']}"
        # 1단계·6단계는 실제 기획 데이터, 2~5단계는 근거 데이터가 없어 항상 임시값이다.
        placeholder = skill["placeholder"] or tier not in (1, 6)
        return {
            "default_name": name,
            "trigger_type": skill["trigger_type"],
            "category": skill["category"],
            "stackable": skill["stackable"],
            "var_name": skill["var_name"],
            "cost": skill["cost"],
            "power": skill["power"],
            "target": skill["target"],
            "activation_order": skill["order"],
            "formula": skill["formula"],
            "description": description,
            "is_placeholder": placeholder,
        }

    for branch_index, branch in enumerate(config["branches"]):
        # 1단계: 계열의 뿌리 기술 하나(2단계부터 col 0/1로 갈라지기 전, 공유 노드).
        specs.append({
            "branch": branch_index, "col": None, "tier": 1,
            **node_fields(branch["root"], 1),
        })
        # 2~6단계: col 0(뿌리 기술 그대로 강화) / col 1(파생 기술로 전환해 강화).
        for col_index, key in enumerate(("root", "derived")):
            skill = branch[key]
            for tier in range(2, 7):
                specs.append({
                    "branch": branch_index, "col": col_index, "tier": tier,
                    **node_fields(skill, tier),
                })

    return specs
