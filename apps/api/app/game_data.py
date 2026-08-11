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


# 기술트리 mock 데이터: 진영(faction)별 3계열 x 2컬럼 x 4단계(I~IV) + 기본 기술 1개.
SKILL_TREE_MOCK = {
    "공격": {
        "base_name": "기본 타격",
        "branches": [
            {"name": "강타", "columns": ["강타", "관통격"]},
            {"name": "연타", "columns": ["연타", "쾌속격"]},
            {"name": "필살", "columns": ["필살", "일격필살"]},
        ],
    },
    "수비": {
        "base_name": "기본 수비",
        "branches": [
            {"name": "방벽", "columns": ["방벽", "철벽"]},
            {"name": "반격", "columns": ["반격", "역린"]},
            {"name": "인내", "columns": ["인내", "불굴"]},
        ],
    },
    "치유": {
        "base_name": "기본 치유",
        "branches": [
            {"name": "회복", "columns": ["회복", "정화"]},
            {"name": "보호", "columns": ["보호", "축복"]},
            {"name": "축복", "columns": ["가호", "은총"]},
        ],
    },
}
