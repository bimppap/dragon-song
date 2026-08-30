from datetime import date, datetime
from typing import Literal
from pydantic import BaseModel, Field, field_validator, model_validator

EnemySkillType = Literal["지정 공격A", "지정 공격B", "광역 공격A", "광역 공격B", "소환"]
Faction = Literal["공격", "수비", "치유"]
# 기술트리 "서" — 캐릭터의 역할(Faction)과 무관한 별개의 축. 모든 캐릭터가 4개 서 전부를 배울 수 있다.
SkillBook = Literal["용맹의 서", "불굴의 서", "헌신의 서", "탐구의 서"]
MemberRole = Literal["RUNNER", "ADMIN", "STAFF"]

# 아이템 효과가 적용될 수 있는 캐릭터 능력치와 값의 정수/실수 여부.
# "def"는 Character 모델의 예약어 회피용 컬럼명(def_)에 대응한다.
ITEM_EFFECT_STAT_TYPES: dict[str, type] = {
    "lv": int, "rank": int, "exp": int, "gold": int, "cp": int, "ap": int,
    "stat_courage": int, "stat_endurance": int, "stat_charity": int, "stat_wisdom": int,
    "hp": int, "hp_max": int, "hp_max_p": float, "hp_heal_p": float, "hp_regen_true": int, "hp_regen_fixed": float,
    "mp": int, "mp_max": int, "mp_regen": int,
    "atk": int, "atk_p": float, "def": int, "def_p": float, "def_eff": float,
    "attn": int, "presence": float, "heal_eff": float,
    "sh": int, "dmg_p": float, "dmg_r": float,
    "skill_lv": int, "skill_eff_true": int, "skill_eff_fixed": float,
    "skill_cost": int, "skill_target": int,
    "start_sh": int, "revive_hp": float, "act_time": int,
}
# 능력치 등급(용기/인내/자애/지혜) 필드 — "가능성/잠재성의 메달"에서 사용자가 고를 수 있는 대상.
GRADE_STAT_FIELDS = ("stat_courage", "stat_endurance", "stat_charity", "stat_wisdom")

# 특수 효과: 캐릭터 능력치가 아니라 별도 동작을 트리거한다(값 무시).
# "ap_reset": 소모 시 기술을 전부 기본으로 되돌리고 소모한 AP를 환급한다.
# "hp_heal_p": 최대 체력 대비 퍼센트만큼 현재 체력을 회복한다(_apply_item_effects에서 특수 처리).
# "grade_choice_1"/"grade_choice_2": 사용 시 용기/인내/자애/지혜 중 1개/2개(중복 불가)를 선택해 각각 1등급 올린다
#   (가능성의 메달 / 잠재성의 메달). 선택값은 사용 요청의 chosen_stats로 받는다.
# "cleanse_debuffs": 전투 중 사용 시 자신에게 걸린 디버프(status_effects, affinity="debuff")와
#   챕터 환경 스택(env_stacks)을 전부 제거한다. 전투 밖에서 사용하면 지울 대상이 없어 아무 효과가 없다.
ITEM_EFFECT_SPECIAL_STATS = {"ap_reset", "grade_choice_1", "grade_choice_2", "cleanse_debuffs"}
ItemEffectStat = Literal[
    "lv", "rank", "exp", "gold", "cp", "ap",
    "stat_courage", "stat_endurance", "stat_charity", "stat_wisdom",
    "hp", "hp_max", "hp_max_p", "hp_heal_p", "hp_regen_true", "hp_regen_fixed",
    "mp", "mp_max", "mp_regen",
    "atk", "atk_p", "def", "def_p", "def_eff",
    "attn", "presence", "heal_eff",
    "sh", "dmg_p", "dmg_r",
    "skill_lv", "skill_eff_true", "skill_eff_fixed",
    "skill_cost", "skill_target",
    "start_sh", "revive_hp", "act_time",
    "ap_reset", "grade_choice_1", "grade_choice_2", "cleanse_debuffs",
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


class StaffCandidateRead(BaseModel):
    """권한 탭에서 스텝 임명/해제 대상으로 보여줄 러너 정보(캐릭터 이름 기준)."""

    member_id: int
    character_id: int
    character_name: str
    role: MemberRole


class StaffRoleUpdate(BaseModel):
    role: Literal["RUNNER", "STAFF"]


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    member: MemberRead


class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class CharacterOnboardingCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    faction: Faction
    rank: Literal[1, 4] = 1
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
    battle_date: date | None = None
    music_url: str | None = None
    # 이 챕터의 실전 전투 종료 후 지급되는 보상 설정.
    battle_victory_reward_gold: int = Field(default=0, ge=0)
    battle_action_reward_gold: int = Field(default=0, ge=0)
    battle_participation_reward_exp: int = Field(default=0, ge=0)

    @model_validator(mode="after")
    def validate_dates(self):
        if self.start_date > self.end_date:
            raise ValueError("챕터 시작일은 종료일보다 늦을 수 없습니다.")
        if self.battle_date and not (self.start_date <= self.battle_date <= self.end_date):
            raise ValueError("전투 일정은 챕터 진행 기간 안에서만 지정할 수 있습니다.")
        return self


class ChapterRead(BaseModel):
    id: int
    name: str
    start_date: date
    end_date: date
    battle_date: date | None = None
    image_url: str | None = None
    music_url: str | None = None
    battle_victory_reward_gold: int
    battle_action_reward_gold: int
    battle_participation_reward_exp: int
    is_active: bool
    is_battle_day: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class RewardItemEntry(BaseModel):
    type: str  # "gold" | "item"
    amount: float | None = None
    item_id: int | None = None
    item_name: str | None = None
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
    gold: int = Field(default=0, ge=0)
    cp: int = Field(default=0, ge=0)
    ap: int = Field(default=0, ge=0)

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
    sale_paused: bool = False
    battle_only: bool = False

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
    sale_paused: bool = False
    battle_only: bool = False
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


class ShopStatusRead(BaseModel):
    is_open: bool

    model_config = {"from_attributes": True}


class ShopStatusUpdate(BaseModel):
    is_open: bool


class CartItem(BaseModel):
    item_id: int
    quantity: int


class BulkPurchaseRequest(BaseModel):
    character_id: int
    items: list[CartItem]


class UseItemRequest(BaseModel):
    """가능성/잠재성의 메달처럼 사용 시점에 선택이 필요한 아이템을 위한 선택값. 그 외 아이템은 무시된다."""
    chosen_stats: list[str] = Field(default_factory=list)


class CharacterFlagsUpdate(BaseModel):
    """관리자 전용 관리 플래그 (주의·경고) 수정."""

    caution: bool
    warning_count: int = Field(ge=0)


class AdminGiftRequest(BaseModel):
    """관리자가 하나 이상의 캐릭터에게 보내는 선물 (골드·CP·아이템). 각 캐릭터에게 동일한 내용이 각각 지급된다."""

    character_ids: list[int] = Field(min_length=1)
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
    item_image_url: str | None = None
    quantity: int
    created_at: datetime

    model_config = {"from_attributes": True}


class ItemHistoryEntry(BaseModel):
    """구매/사용 이력을 시간순으로 병합해 보여주기 위한 통합 엔트리."""
    id: int
    kind: Literal["purchase", "use"]
    item_id: int
    item_name: str
    item_image_url: str | None = None
    quantity: int
    created_at: datetime

    model_config = {"from_attributes": True}


class CharacterOwnedItemRead(BaseModel):
    item_id: int
    item_name: str
    item_description: str
    item_image_url: str | None = None
    item_type: ItemType
    effects: list[ItemEffect] = Field(default_factory=list)
    quantity: int
    used_quantity: int
    equipped: bool
    battle_only: bool = False

    @field_validator("effects", mode="before")
    @classmethod
    def coerce_effects(cls, v: object) -> list:
        return v if v is not None else []


class CharacterAchievedChallengeRead(BaseModel):
    challenge_id: int
    chapter: str
    name: str
    description: str
    image_url: str | None = None
    reward: str
    reward_items: list = Field(default_factory=list)

    @field_validator("reward_items", mode="before")
    @classmethod
    def coerce_reward_items(cls, v: object) -> list:
        return v if v is not None else []


class CharacterAchievedMissionRead(BaseModel):
    mission_id: int
    chapter: str
    name: str
    description: str
    image_url: str | None = None
    reward: str
    reward_items: list = Field(default_factory=list)

    @field_validator("reward_items", mode="before")
    @classmethod
    def coerce_reward_items(cls, v: object) -> list:
        return v if v is not None else []


class CharacterDetailRead(CharacterRead):
    owned_items: list[CharacterOwnedItemRead]
    achieved_challenges: list[CharacterAchievedChallengeRead]
    achieved_missions: list[CharacterAchievedMissionRead]
    item_history: list[ItemHistoryEntry]
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
    image_url: str | None = None
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


class ChallengeUpdate(ChallengeCreate):
    pass


class ChallengeProgressUpdate(BaseModel):
    character_id: int
    achieved: bool
    memo: str = ""


class ChallengeProgressBulkUpdate(BaseModel):
    entries: list[ChallengeProgressUpdate]


class ChallengeProgressRead(BaseModel):
    character_id: int
    character_name: str
    character_image_url: str | None
    achieved: bool
    memo: str
    reward_paid: bool = False

    model_config = {"from_attributes": True}


class MissionCreate(BaseModel):
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


class MissionRead(BaseModel):
    id: int
    chapter: str
    name: str
    description: str
    image_url: str | None = None
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


class MissionUpdate(MissionCreate):
    pass


class MissionProgressUpdate(BaseModel):
    character_id: int
    achieved: bool
    memo: str = ""


class MissionProgressBulkUpdate(BaseModel):
    entries: list[MissionProgressUpdate]


class MissionProgressRead(BaseModel):
    character_id: int
    character_name: str
    character_image_url: str | None
    achieved: bool
    memo: str
    reward_paid: bool = False

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
    summon_image_url: str | None = None


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
    image_url: str | None = None
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


class EnvironmentCreate(BaseModel):
    chapter: str
    name: str
    stacks_per_round: int = Field(default=1, ge=0)
    damage_per_stack: int = Field(default=0, ge=0)


class EnvironmentRead(BaseModel):
    id: int
    chapter: str
    name: str
    stacks_per_round: int
    damage_per_stack: int
    created_at: datetime

    model_config = {"from_attributes": True}


BattleMode = Literal["practice", "real"]
BattleStatus = Literal["in_progress", "victory", "defeat", "early_terminated"]
# 한 라운드는 3턴으로 나뉜다: "telegraph"(적의 행동 암시) → "ally"(아군 턴) → "enemy"(에너미 턴).
BattlePhase = Literal["telegraph", "ally", "enemy"]
# "skill"(기술 사용)은 현재는 "attack"과 동일하게 처리되는 자리만 갖춘 행동이다.
CharacterActionKind = Literal["attack", "skill", "defend", "heal", "rescue", "item", "none", "retreat"]
EnemyActionKind = Literal["attack", "summon", "none"]


class BattleStartRequest(BaseModel):
    mode: BattleMode
    enemy_ids: list[int] = Field(min_length=1)
    character_ids: list[int] = Field(min_length=1)


class CharacterActionInput(BaseModel):
    character_id: int
    kind: CharacterActionKind
    skill_node_id: int | None = None
    target_enemy_id: int | None = None
    target_character_id: int | None = None  # 치유/구조 지정 대상
    protect_target_character_id: int | None = None  # 방어(수비 포지션 한정) 시 대신 맞아줄 대상. 기본값은 본인
    item_id: int | None = None


class EnemyActionInput(BaseModel):
    enemy_id: int
    kind: EnemyActionKind
    skill_index: int | None = None
    # 지정 공격일 때 관리자가 직접 고르는 공격 대상(기술의 target_count 명). 광역/소환/무반응은 사용하지 않는다.
    target_character_ids: list[int] = Field(default_factory=list)


class BattleTelegraphRequest(BaseModel):
    enemy_actions: list[EnemyActionInput] = Field(default_factory=list)


class BattleAllyTurnRequest(BaseModel):
    character_actions: list[CharacterActionInput] = Field(default_factory=list)


class BattleJoinRequest(BaseModel):
    character_id: int


class BattleEnemyJoinRequest(BaseModel):
    enemy_id: int


class BattleSessionRead(BaseModel):
    id: int
    mode: BattleMode
    chapter: str | None
    status: BattleStatus
    round: int
    phase: BattlePhase
    pending_enemy_actions: list = Field(default_factory=list)
    enemies: list = Field(default_factory=list)
    summons: list = Field(default_factory=list)
    participants: list = Field(default_factory=list)
    log: list = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BattleSessionSummary(BaseModel):
    id: int
    mode: BattleMode
    chapter: str | None
    status: BattleStatus
    round: int
    enemy_names: list[str] = Field(default_factory=list)
    rewards_sent: bool = False
    created_at: datetime
    updated_at: datetime


class BattleRewardEntry(BaseModel):
    character_id: int
    character_name: str
    victory_gold: int = 0
    action_rounds: int = 0
    action_gold: int = 0
    total_gold: int = 0
    participation_exp: int = 0


class BattleRewardPreview(BaseModel):
    session_id: int
    chapter: str | None
    already_sent: bool
    entries: list[BattleRewardEntry] = Field(default_factory=list)


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
    character_image_url: str | None = None
    revoked: bool = False


class AttendanceEntryCreate(BaseModel):
    character_id: int
    attendance_date: date


class AttendanceEntryRead(BaseModel):
    id: int
    attendance_date: date
    character_id: int
    character_name: str
    character_image_url: str | None
    reward_paid: bool
    created_at: datetime


class AttendanceRewardPayResult(BaseModel):
    paid_count: int
    entries: list[AttendanceEntryRead]


class AttendanceStreakEntry(BaseModel):
    character_id: int
    character_name: str
    character_image_url: str | None
    streak: int
    rank: int  # 동률은 같은 순위를 공유한다(밀집 순위). 최대 5위까지만 반환된다.


TIER_LABELS = {0: "기본", 1: "1단계", 2: "2단계", 3: "3단계", 4: "4단계", 5: "5단계", 6: "6단계"}


class SkillNodeRead(BaseModel):
    """var_name(내부 변수명)은 러너·관리자 모두에게 노출하지 않으므로 이 스키마에 포함하지 않는다."""

    id: int
    book: SkillBook
    branch: int | None
    col: int | None
    tier: int
    tier_label: str
    default_name: str
    image_url: str | None = None
    effects: list[ItemEffect] = Field(default_factory=list)
    trigger_type: str | None = None
    category: str | None = None
    stackable: bool | None = None
    cost: float | None = None
    power: float | None = None
    target: str | None = None
    activation_order: int | None = None
    formula: str | None = None
    description: str | None = None
    is_placeholder: bool = False
    is_public: bool = True

    model_config = {"from_attributes": True}

    @field_validator("effects", mode="before")
    @classmethod
    def coerce_effects(cls, v: object) -> list:
        return v if v is not None else []


class SkillNodeUpdate(BaseModel):
    default_name: str = Field(min_length=1, max_length=50)
    description: str | None = Field(default=None, max_length=2000)


class SkillVisibilityUpdate(BaseModel):
    max_public_tier: int = Field(ge=0, le=6)


class CharacterSkillNodeRead(SkillNodeRead):
    unlocked: bool
    custom_name: str | None
    custom_image_url: str | None = None
    display_name: str
    unlocked_at: datetime | None = None


class CharacterSkillTreeRead(BaseModel):
    book: SkillBook
    character_ap: int
    ap_cost_to_unlock: int
    latest_unlocked_node_id: int | None = None
    nodes: list[CharacterSkillNodeRead]


class SkillNameUpdate(BaseModel):
    custom_name: str = Field(default="", max_length=50)
