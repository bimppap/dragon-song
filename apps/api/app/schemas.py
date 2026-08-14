from datetime import date, datetime
from typing import Literal
from pydantic import BaseModel, Field, field_validator, model_validator

EnemySkillType = Literal["지정 공격A", "지정 공격B", "광역 공격A", "광역 공격B", "소환"]
Faction = Literal["공격", "수비", "치유"]
MemberRole = Literal["RUNNER", "ADMIN"]

# 아이템 효과가 적용될 수 있는 캐릭터 능력치와 값의 정수/실수 여부.
# "def"는 Character 모델의 예약어 회피용 컬럼명(def_)에 대응한다.
ITEM_EFFECT_STAT_TYPES: dict[str, type] = {
    "lv": int, "rank": int, "exp": int, "gold": int, "cp": int, "ap": int,
    "stat_courage": int, "stat_endurance": int, "stat_charity": int, "stat_wisdom": int,
    "hp": int, "hp_max": int, "hp_max_p": float, "hp_regen_true": int, "hp_regen_fixed": float,
    "mp": int, "mp_max": int, "mp_regen": int,
    "atk": int, "atk_p": float, "def": int, "def_p": float, "def_eff": float,
    "attn": int, "presence": float, "heal_eff": float,
    "sh": int, "dmg_p": float, "dmg_r": float,
    "skill_lv": int, "skill_eff_true": int, "skill_eff_fixed": float,
    "skill_cost": int, "skill_target": int,
    "start_sh": int, "revive_hp": float, "act_time": int,
}
# 특수 효과: 캐릭터 능력치가 아니라 별도 동작을 트리거한다(값 무시).
# "ap_reset": 소모 시 기술을 전부 기본으로 되돌리고 소모한 AP를 환급한다.
ITEM_EFFECT_SPECIAL_STATS = {"ap_reset"}
ItemEffectStat = Literal[
    "lv", "rank", "exp", "gold", "cp", "ap",
    "stat_courage", "stat_endurance", "stat_charity", "stat_wisdom",
    "hp", "hp_max", "hp_max_p", "hp_regen_true", "hp_regen_fixed",
    "mp", "mp_max", "mp_regen",
    "atk", "atk_p", "def", "def_p", "def_eff",
    "attn", "presence", "heal_eff",
    "sh", "dmg_p", "dmg_r",
    "skill_lv", "skill_eff_true", "skill_eff_fixed",
    "skill_cost", "skill_target",
    "start_sh", "revive_hp", "act_time",
    "ap_reset",
]
ItemType = Literal["consumable", "equipment"]


class ItemEffect(BaseModel):
    stat: ItemEffectStat
    delta: float


def _validate_reward_entries(entries: list[dict]) -> list[dict]:
    """아이템 지급과 능력치 증가를 한 목록으로 검증한다. 구형 아이템 형식도 허용한다."""
    validated: list[dict] = []
    for entry in entries:
        entry_type = entry.get("type", "item")
        if entry_type == "item":
            item_id = int(entry.get("item_id", 0))
            quantity = int(entry.get("quantity", 1))
            if item_id <= 0 or quantity <= 0:
                raise ValueError("아이템과 수량을 올바르게 선택해 주세요.")
            validated.append({"type": "item", "item_id": item_id, "quantity": quantity})
            continue
        if entry_type == "stat":
            effect = ItemEffect(stat=entry.get("stat"), delta=entry.get("amount", 0))
            if effect.stat in ITEM_EFFECT_SPECIAL_STATS:
                raise ValueError("보상으로 지급할 수 없는 특수 효과입니다.")
            if effect.delta <= 0:
                raise ValueError("능력치 보상 수치는 0보다 커야 합니다.")
            validated.append({"type": "stat", "stat": effect.stat, "amount": effect.delta})
            continue
        raise ValueError("지원하지 않는 보상 유형입니다.")
    return validated


class SignupRequest(BaseModel):
    login_id: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=4, max_length=100)
    password_confirm: str

    @model_validator(mode="after")
    def check_passwords_match(self):
        if self.password != self.password_confirm:
            raise ValueError("비밀번호가 일치하지 않습니다.")
        return self


class LoginRequest(BaseModel):
    login_id: str
    password: str


class MemberRead(BaseModel):
    id: int
    login_id: str
    role: MemberRole
    character_id: int | None

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    member: MemberRead


class CharacterOnboardingCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    faction: Faction
    stat_courage: int = Field(default=0, ge=0, le=2)
    stat_endurance: int = Field(default=0, ge=0, le=2)
    stat_charity: int = Field(default=0, ge=0, le=2)
    stat_wisdom: int = Field(default=0, ge=0, le=2)

    @model_validator(mode="after")
    def check_ap_total(self):
        total = self.stat_courage + self.stat_endurance + self.stat_charity + self.stat_wisdom
        if total != 2:
            raise ValueError("AP 포인트 2를 모두 투자해야 합니다.")
        return self


class ChapterCreate(BaseModel):
    name: str
    start_date: date
    end_date: date
    music_url: str | None = None


class ChapterRead(BaseModel):
    id: int
    name: str
    start_date: date
    end_date: date
    image_url: str | None = None
    music_url: str | None = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class RewardItemEntry(BaseModel):
    type: str  # "gold" | "item"
    amount: float | None = None
    item_id: int | None = None
    quantity: int | None = None
    stat: str | None = None


class RewardRead(BaseModel):
    id: int
    type: str
    character_id: int
    source_id: int | None
    reward_items: list[RewardItemEntry]
    rewarded_at: date
    created_at: datetime

    model_config = {"from_attributes": True}


class RewardPayResult(BaseModel):
    paid_count: int
    rewards: list[RewardRead]


class CharacterCreate(BaseModel):
    model_config = {"populate_by_name": True}

    name: str
    faction: Faction | None = None
    skill_node_ids: list[int] = Field(default_factory=list)
    gold: int = Field(default=1000, ge=0)
    cp: int = Field(default=0, ge=0)
    ap: int = Field(default=10, ge=0)

    # 성장 등급 배지
    lv: int = Field(default=1, ge=0)
    rank: int = Field(default=1, ge=0)
    exp: int = Field(default=0, ge=0)

    # 적게 변하는 능력치
    stat_courage: int = Field(default=0)
    stat_endurance: int = Field(default=0)
    stat_charity: int = Field(default=0)
    stat_wisdom: int = Field(default=0)

    # 체력 / 마나
    hp: int = Field(default=0)
    hp_max: int = Field(default=0)
    hp_max_p: float = Field(default=0)
    hp_regen_true: int = Field(default=0)
    hp_regen_fixed: float = Field(default=0)
    mp: int = Field(default=0)
    mp_max: int = Field(default=0)
    mp_regen: int = Field(default=0)

    # 상세 능력치
    atk: int = Field(default=0)
    atk_p: float = Field(default=0)
    def_: int = Field(default=0, alias="def")
    def_p: float = Field(default=0)
    def_eff: float = Field(default=0)
    attn: int = Field(default=0)
    presence: float = Field(default=0)
    heal_eff: float = Field(default=0)
    sh: int = Field(default=0)
    dmg_p: float = Field(default=0)
    dmg_r: float = Field(default=0)
    skill_lv: int = Field(default=0)
    skill_eff_true: int = Field(default=0)
    skill_eff_fixed: float = Field(default=0)
    skill_cost: int = Field(default=0)
    skill_target: int = Field(default=0)

    # 관리자 전용 능력치
    start_sh: int = Field(default=0)
    revive_hp: float = Field(default=0.1)
    act_time: int = Field(default=1)
    over_heal: bool = Field(default=False)


class CharacterRead(BaseModel):
    model_config = {"from_attributes": True, "populate_by_name": True}

    id: int
    name: str
    member_id: int | None
    faction: Faction | None
    gold: int
    cp: int
    ap: int

    lv: int
    rank: int
    exp: int

    stat_courage: int
    stat_endurance: int
    stat_charity: int
    stat_wisdom: int

    hp: int
    hp_max: int
    hp_max_p: float
    hp_regen_true: int
    hp_regen_fixed: float
    mp: int
    mp_max: int
    mp_regen: int

    atk: int
    atk_p: float
    def_: int = Field(alias="def")
    def_p: float
    def_eff: float
    attn: int
    presence: float
    heal_eff: float
    sh: int
    dmg_p: float
    dmg_r: float
    skill_lv: int
    skill_eff_true: int
    skill_eff_fixed: float
    skill_cost: int
    skill_target: int

    # 관리자 전용 능력치 (RUNNER 조회 시 null 처리됨)
    start_sh: int | None
    revive_hp: float | None
    act_time: int | None
    over_heal: bool | None

    # 관리자 전용 관리 플래그 (RUNNER 조회 시 null 처리됨)
    caution: bool | None = None
    warning_count: int | None = None
    mission_passed: bool | None = None

    image_url: str | None = None


class ItemCreate(BaseModel):
    name: str
    price_gold: int | None = Field(default=None, ge=0)
    price_cp: int | None = Field(default=None, ge=0)
    description_user: str = ""
    purchase_limit_per_character: int | None = None
    purchase_limit_global: int | None = None
    available_from_chapter: str | None = None
    available_until_chapter: str | None = None
    item_type: ItemType = "consumable"
    restricted_mission_id: int | None = None  # 이 임무의 보상 수령자는 구매 불가
    effects: list[ItemEffect] = Field(default_factory=list)

    @model_validator(mode="after")
    def check_at_least_one_price(self):
        if not self.price_gold and not self.price_cp:
            raise ValueError("골드 또는 CP 중 하나 이상의 가격을 설정해야 합니다.")
        return self


class ItemRead(BaseModel):
    id: int
    name: str
    price_gold: int | None
    price_cp: int | None
    description_user: str
    purchase_limit_per_character: int | None
    purchase_limit_global: int | None
    available_from_chapter: str | None
    available_until_chapter: str | None
    item_type: ItemType
    restricted_mission_id: int | None = None
    image_url: str | None = None
    effects: list[ItemEffect] = Field(default_factory=list)
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("effects", mode="before")
    @classmethod
    def coerce_effects(cls, v: object) -> list:
        return v if v is not None else []


class ItemWithStock(ItemRead):
    purchased_by_character: int
    purchased_total: int
    remaining_per_character: int | None
    remaining_global: int | None
    purchasable: bool


class CartItem(BaseModel):
    item_id: int
    quantity: int


class BulkPurchaseRequest(BaseModel):
    character_id: int
    items: list[CartItem]


class CharacterFlagsUpdate(BaseModel):
    """관리자 전용 관리 플래그 (주의·경고·합격미션여부) 수정."""

    caution: bool
    warning_count: int = Field(ge=0)
    mission_passed: bool


class AdminGiftRequest(BaseModel):
    """관리자가 캐릭터에게 보내는 선물 (골드·CP·아이템)."""

    character_id: int
    gold: int = Field(default=0, ge=0)
    cp: int = Field(default=0, ge=0)
    items: list[CartItem] = Field(default_factory=list)

    @model_validator(mode="after")
    def check_has_content(self):
        if self.gold <= 0 and self.cp <= 0 and not self.items:
            raise ValueError("보낼 골드, CP 또는 아이템을 입력해 주세요.")
        if any(item.quantity < 1 for item in self.items):
            raise ValueError("아이템 수량은 1 이상이어야 합니다.")
        return self


class PurchaseRead(BaseModel):
    id: int
    character_id: int
    character_name: str
    item_id: int
    item_name: str
    quantity: int
    created_at: datetime

    model_config = {"from_attributes": True}


class CharacterOwnedItemRead(BaseModel):
    item_id: int
    item_name: str
    item_description: str
    item_type: ItemType
    effects: list[ItemEffect] = Field(default_factory=list)
    quantity: int
    used_quantity: int
    equipped: bool

    @field_validator("effects", mode="before")
    @classmethod
    def coerce_effects(cls, v: object) -> list:
        return v if v is not None else []


class CharacterAchievedChallengeRead(BaseModel):
    challenge_id: int
    chapter: str
    name: str
    description: str
    reward: str


class CharacterDetailRead(CharacterRead):
    owned_items: list[CharacterOwnedItemRead]
    achieved_challenges: list[CharacterAchievedChallengeRead]
    purchase_history: list[PurchaseRead]
    reward_history: list[RewardRead]
    attendance_streak: int = 0


class ChallengeCreate(BaseModel):
    chapter: str
    name: str
    description: str
    reward: str
    reward_gold: int = Field(default=0, ge=0)
    reward_experience: int = Field(default=0, ge=0)
    reward_ap: int = Field(default=0, ge=0)
    reward_hp: int = Field(default=0, ge=0)
    reward_attack: int = Field(default=0, ge=0)
    reward_defense: int = Field(default=0, ge=0)
    reward_items: list[dict] = Field(default_factory=list)
    is_public: bool = True

    @field_validator("reward_items")
    @classmethod
    def validate_reward_entries(cls, entries: list[dict]) -> list[dict]:
        return _validate_reward_entries(entries)


class ChallengeRead(BaseModel):
    id: int
    chapter: str
    name: str
    description: str
    reward: str
    reward_gold: int
    reward_experience: int
    reward_ap: int
    reward_hp: int
    reward_attack: int
    reward_defense: int
    reward_items: list = Field(default_factory=list)
    is_public: bool
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("reward_items", mode="before")
    @classmethod
    def coerce_reward_items(cls, v: object) -> list:
        return v if v is not None else []


class ChallengeProgressUpdate(BaseModel):
    character_id: int
    achieved: bool
    memo: str = ""


class ChallengeProgressBulkUpdate(BaseModel):
    entries: list[ChallengeProgressUpdate]


class ChallengeProgressRead(BaseModel):
    character_id: int
    character_name: str
    achieved: bool
    memo: str

    model_config = {"from_attributes": True}


class MissionCreate(BaseModel):
    chapter: str
    mission_type: str  # "일일" | "중요"
    name: str
    description: str
    reward: str
    reward_gold: int = Field(default=0, ge=0)
    reward_experience: int = Field(default=0, ge=0)
    reward_ap: int = Field(default=0, ge=0)
    reward_hp: int = Field(default=0, ge=0)
    reward_attack: int = Field(default=0, ge=0)
    reward_defense: int = Field(default=0, ge=0)
    reward_items: list[dict] = Field(default_factory=list)
    is_public: bool = True

    @field_validator("reward_items")
    @classmethod
    def validate_reward_entries(cls, entries: list[dict]) -> list[dict]:
        return _validate_reward_entries(entries)


class MissionRead(BaseModel):
    id: int
    chapter: str
    mission_type: str
    name: str
    description: str
    reward: str
    reward_gold: int
    reward_experience: int
    reward_ap: int
    reward_hp: int
    reward_attack: int
    reward_defense: int
    reward_items: list = Field(default_factory=list)
    is_public: bool
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("reward_items", mode="before")
    @classmethod
    def coerce_reward_items(cls, v: object) -> list:
        return v if v is not None else []


class MissionProgressUpdate(BaseModel):
    character_id: int
    achieved: bool
    memo: str = ""


class MissionProgressBulkUpdate(BaseModel):
    entries: list[MissionProgressUpdate]


class MissionProgressRead(BaseModel):
    character_id: int
    character_name: str
    achieved: bool
    memo: str

    model_config = {"from_attributes": True}


class EnemySkill(BaseModel):
    skill_type: EnemySkillType
    name: str
    target_count: int = 0
    damage_percent: int = 0
    summon_name: str | None = None
    summon_hp: int | None = None
    summon_attack: int | None = None
    summon_count: int | None = None


class EnemyCreate(BaseModel):
    name: str
    chapter: str | None = None
    base_hp: int = Field(ge=0)
    hp_per_attacker: int = Field(default=0, ge=0)
    hp_per_defender: int = Field(default=0, ge=0)
    hp_per_healer: int = Field(default=0, ge=0)
    attack: int = Field(ge=0)
    skills: list[EnemySkill] = Field(default_factory=list)


class EnemyRead(BaseModel):
    id: int
    name: str
    chapter: str | None
    base_hp: int
    hp_per_attacker: int
    hp_per_defender: int
    hp_per_healer: int
    attack: int
    skills: list[EnemySkill]
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("skills", mode="before")
    @classmethod
    def coerce_skills(cls, v: object) -> list:
        return v if v is not None else []


SettlementType = Literal["board", "log"]


class SettlementCreate(BaseModel):
    type: SettlementType
    total_posts: int | None = Field(default=None, ge=0)
    total_comments: int | None = Field(default=None, ge=0)
    links: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def check_by_type(self):
        if self.type == "board":
            if self.total_posts is None or self.total_comments is None:
                raise ValueError("총 게시물 갯수와 총 댓글 갯수를 모두 입력해 주세요.")
            self.links = []
        else:
            self.links = [link.strip() for link in self.links if link.strip()]
            if not self.links:
                raise ValueError("게시물 링크를 1개 이상 입력해 주세요.")
            self.total_posts = None
            self.total_comments = None
        return self


class SettlementRead(BaseModel):
    id: int
    character_id: int
    character_name: str
    character_image_url: str | None
    type: SettlementType
    total_posts: int | None
    total_comments: int | None
    links: list[str]
    status: str  # "pending" | "paid"
    # 규칙(게시글 1개=1G, 댓글 50개=1CP, 링크 1개=1CP)과 직전 지급 이력으로 계산한 제안값
    suggested_gold: int
    suggested_cp: int
    paid_gold: int | None
    paid_cp: int | None
    created_at: datetime
    updated_at: datetime


class SettlementPayRequest(BaseModel):
    gold: int = Field(default=0, ge=0)
    cp: int = Field(default=0, ge=0)


class RewardWithCharacterRead(RewardRead):
    character_name: str
    revoked: bool = False


class AttendanceEntryCreate(BaseModel):
    attendance_date: date
    message: str = Field(default="", max_length=200)


class AttendanceEntryUpdate(BaseModel):
    message: str = Field(default="", max_length=200)


class AttendanceEntryRead(BaseModel):
    id: int
    attendance_date: date
    character_id: int
    character_name: str
    character_image_url: str | None
    message: str
    rank: int | None  # 그날 1~3번째 출석자에게만 1·2·3 부여
    created_at: datetime
    updated_at: datetime


class AttendanceMissionRead(BaseModel):
    mission_date: date
    content: str

    model_config = {"from_attributes": True}


class AttendanceMissionUpdate(BaseModel):
    content: str = Field(default="", max_length=500)


class AttendanceCharacterBrief(BaseModel):
    id: int
    name: str
    image_url: str | None


class AttendanceStreakEntry(BaseModel):
    character_id: int
    character_name: str
    character_image_url: str | None
    streak: int


class AttendanceSummaryRead(BaseModel):
    attendance_date: date
    attended: list[AttendanceCharacterBrief]
    absent: list[AttendanceCharacterBrief]
    streaks: list[AttendanceStreakEntry]


TIER_LABELS = {0: "기본", 1: "선택", 2: "I", 3: "II", 4: "III", 5: "IV"}


class SkillNodeRead(BaseModel):
    id: int
    faction: Faction
    branch: int | None
    col: int | None
    tier: int
    tier_label: str
    default_name: str
    image_url: str | None = None
    effects: list[ItemEffect] = Field(default_factory=list)

    model_config = {"from_attributes": True}

    @field_validator("effects", mode="before")
    @classmethod
    def coerce_effects(cls, v: object) -> list:
        return v if v is not None else []


class SkillNodeUpdate(BaseModel):
    default_name: str = Field(min_length=1, max_length=50)
    effects: list[ItemEffect] = Field(default_factory=list)


class CharacterSkillNodeRead(SkillNodeRead):
    unlocked: bool
    custom_name: str | None
    display_name: str


class CharacterSkillTreeRead(BaseModel):
    faction: Faction
    character_ap: int
    ap_cost_to_unlock: int
    latest_unlocked_node_id: int | None = None
    nodes: list[CharacterSkillNodeRead]


class SkillNameUpdate(BaseModel):
    custom_name: str = Field(default="", max_length=50)
