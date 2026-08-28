import { clearToken, getRefreshToken, getToken, setToken } from "./token";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// 액세스 토큰(1시간) 만료 시 refresh token(7일)으로 한 번 재발급을 시도한 뒤 재요청한다.
// 동시에 여러 요청이 401을 받아도 재발급은 한 번만 일어나도록 진행 중인 시도를 공유한다.
let refreshInFlight: Promise<boolean> | null = null;

async function tryRefreshAccessToken(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const refreshToken = getRefreshToken();
      if (!refreshToken) return false;
      try {
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!res.ok) {
          clearToken();
          return false;
        }
        const data = await res.json();
        setToken(data.access_token);
        return true;
      } catch {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

/** 인증 헤더를 붙여 fetch하고, 401이면 액세스 토큰을 한 번 재발급받아 재시도한다. */
async function authorizedFetch(path: string, init?: RequestInit): Promise<Response> {
  const attempt = () => {
    const token = getToken();
    return fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
  };

  let res = await attempt();
  if (res.status === 401 && getRefreshToken() && (await tryRefreshAccessToken())) {
    res = await attempt();
  }
  return res;
}

async function request<T>(path: string, init?: RequestInit, errorMessage = "요청 처리에 실패했습니다."): Promise<T> {
  const res = await authorizedFetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? errorMessage);
  }
  return res.json();
}

/** 파일 업로드 전용: FormData 본문 + 인증 헤더 재시도를 공유한다(캐릭터/아이템/챕터/기술 이미지 업로드에서 재사용). */
async function uploadFile<T>(path: string, file: File, fieldName = "file", errorMessage = "업로드 실패"): Promise<T> {
  const formData = new FormData();
  formData.append(fieldName, file);
  const res = await authorizedFetch(path, { method: "POST", body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? errorMessage);
  }
  return res.json();
}

export type MemberRole = "RUNNER" | "ADMIN";
export type Faction = "공격" | "수비" | "치유";

export interface Member {
  id: number;
  login_id: string;
  role: MemberRole;
  character_id: number | null;
}

export interface SignupRequest {
  login_id: string;
  password: string;
  password_confirm: string;
}

export interface LoginRequest {
  login_id: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  member: Member;
}

export interface CharacterOnboardingCreate {
  name: string;
  faction: Faction;
  rank: 1 | 4;
  stat_courage: number;
  stat_endurance: number;
  stat_charity: number;
  stat_wisdom: number;
}

export async function signup(data: SignupRequest): Promise<Member> {
  return request<Member>("/auth/signup", {
    method: "POST",
    body: JSON.stringify(data),
  }, "회원가입 실패");
}

export async function login(data: LoginRequest): Promise<TokenResponse> {
  return request<TokenResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(data),
  }, "로그인 실패");
}

export async function fetchMe(): Promise<Member> {
  return request<Member>("/auth/me", undefined, "내 정보 조회 실패");
}

export async function logoutRequest(refreshToken: string): Promise<void> {
  await request("/auth/logout", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  }, "로그아웃 실패");
}

export async function createMyCharacter(data: CharacterOnboardingCreate): Promise<Character> {
  return request<Character>("/members/me/character", {
    method: "POST",
    body: JSON.stringify(data),
  }, "캐릭터 생성 실패");
}

export async function fetchMyCharacter(): Promise<CharacterDetail> {
  return request<CharacterDetail>("/members/me/character", undefined, "내 캐릭터 조회 실패");
}

export type ItemType = "consumable" | "equipment";

export type ItemEffectStat =
  | "lv" | "rank" | "exp" | "gold" | "cp" | "ap"
  | "stat_courage" | "stat_endurance" | "stat_charity" | "stat_wisdom"
  | "hp" | "hp_max" | "hp_max_p" | "hp_heal_p" | "hp_regen_true" | "hp_regen_fixed"
  | "mp" | "mp_max" | "mp_regen"
  | "atk" | "atk_p" | "def" | "def_p" | "def_eff"
  | "attn" | "presence" | "heal_eff"
  | "sh" | "dmg_p" | "dmg_r"
  | "skill_lv" | "skill_eff_true" | "skill_eff_fixed"
  | "skill_cost" | "skill_target"
  | "start_sh" | "revive_hp" | "act_time"
  | "ap_reset" | "grade_choice_1" | "grade_choice_2";

export const ITEM_EFFECT_STAT_OPTIONS: { value: ItemEffectStat; label: string }[] = [
  { value: "lv", label: "성장 등급" },
  { value: "rank", label: "모험가 등급" },
  { value: "exp", label: "경험치" },
  { value: "gold", label: "골드" },
  { value: "cp", label: "CP" },
  { value: "ap", label: "AP" },
  { value: "stat_courage", label: "용기" },
  { value: "stat_endurance", label: "인내" },
  { value: "stat_charity", label: "자애" },
  { value: "stat_wisdom", label: "지혜" },
  { value: "hp", label: "현재 체력" },
  { value: "hp_max", label: "최대 체력" },
  { value: "hp_max_p", label: "체력 증폭(%)" },
  { value: "hp_heal_p", label: "체력 회복(%)" },
  { value: "hp_regen_true", label: "체력 재생력(고정)" },
  { value: "hp_regen_fixed", label: "체력 재생력(비례)" },
  { value: "mp", label: "마나" },
  { value: "mp_max", label: "마나 최대치" },
  { value: "mp_regen", label: "마나 재생력" },
  { value: "atk", label: "공격력" },
  { value: "atk_p", label: "공격력 증폭(%)" },
  { value: "def", label: "방어력" },
  { value: "def_p", label: "방어력 증폭(%)" },
  { value: "def_eff", label: "방어 효율" },
  { value: "attn", label: "주목도" },
  { value: "presence", label: "존재감" },
  { value: "heal_eff", label: "치유 효율" },
  { value: "sh", label: "보호막" },
  { value: "dmg_p", label: "피해 증폭" },
  { value: "dmg_r", label: "피해 감소" },
  { value: "skill_lv", label: "기술 등급" },
  { value: "skill_eff_true", label: "기술 효율(고정)" },
  { value: "skill_eff_fixed", label: "기술 효율(비례)" },
  { value: "skill_cost", label: "기술 비용" },
  { value: "skill_target", label: "기술 대상" },
  { value: "start_sh", label: "시작 보호막" },
  { value: "revive_hp", label: "부활 후 체력" },
  { value: "act_time", label: "행동횟수" },
  { value: "ap_reset", label: "AP 초기화(기술 리셋)" },
  { value: "grade_choice_1", label: "능력치 1개 선택 +1" },
  { value: "grade_choice_2", label: "능력치 2개 선택 +1" },
];

/** ItemEffectStat → 한글 라벨 조회 맵. */
export const EFFECT_STAT_LABELS: Record<string, string> = Object.fromEntries(
  ITEM_EFFECT_STAT_OPTIONS.map((option) => [option.value, option.label]),
);

/** 효과 하나를 "라벨 +N" 형태의 문자열로 표현한다. */
export function formatEffect(effect: ItemEffect): string {
  const label = EFFECT_STAT_LABELS[effect.stat] ?? effect.stat;
  if (effect.stat === "ap_reset" || effect.stat === "grade_choice_1" || effect.stat === "grade_choice_2") return label;
  const sign = effect.delta >= 0 ? "+" : "";
  return `${label} ${sign}${effect.delta}`;
}

export interface ItemEffect {
  stat: ItemEffectStat;
  delta: number;
}

export interface Item {
  id: number;
  name: string;
  price_gold: number | null;
  price_cp: number | null;
  description_user: string;
  purchase_limit_per_character: number | null;
  purchase_limit_global: number | null;
  available_from_chapter: string | null;
  available_until_chapter: string | null;
  item_type: ItemType;
  restricted_mission_id: number | null;
  image_url: string | null;
  effects: ItemEffect[];
  sale_paused: boolean;
  created_at: string;
  purchased_by_character: number;
  purchased_total: number;
  remaining_per_character: number | null;
  remaining_global: number | null;
  purchasable: boolean;
}

export interface ItemCreate {
  name: string;
  price_gold: number | null;
  price_cp: number | null;
  description_user: string;
  purchase_limit_per_character: number | null;
  purchase_limit_global: number | null;
  available_from_chapter: string | null;
  available_until_chapter: string | null;
  item_type: ItemType;
  restricted_mission_id: number | null;
  effects: ItemEffect[];
  sale_paused: boolean;
}

export interface Purchase {
  id: number;
  character_id: number;
  character_name: string;
  item_id: number;
  item_name: string;
  item_image_url: string | null;
  quantity: number;
  created_at: string;
}

export interface ItemHistoryEntry {
  id: number;
  kind: "purchase" | "use";
  item_id: number;
  item_name: string;
  item_image_url: string | null;
  quantity: number;
  created_at: string;
}

export interface Character {
  id: number;
  name: string;
  member_id: number | null;
  faction: Faction | null;
  gold: number;
  cp: number;
  ap: number;

  // 성장 등급 배지
  lv: number;
  rank: number;
  exp: number;

  // 적게 변하는 능력치
  stat_courage: number;
  stat_endurance: number;
  stat_charity: number;
  stat_wisdom: number;

  // 체력 / 마나
  hp: number;
  hp_max: number;
  hp_max_p: number;
  hp_regen_true: number;
  hp_regen_fixed: number;
  mp: number;
  mp_max: number;
  mp_regen: number;

  // 상세 능력치
  atk: number;
  atk_p: number;
  def: number;
  def_p: number;
  def_eff: number;
  attn: number;
  presence: number;
  heal_eff: number;
  sh: number;
  dmg_p: number;
  dmg_r: number;
  skill_lv: number;
  skill_eff_true: number;
  skill_eff_fixed: number;
  skill_cost: number;
  skill_target: number;

  // 관리자 전용 능력치 (RUNNER 조회 시 null)
  start_sh: number | null;
  revive_hp: number | null;
  act_time: number | null;
  over_heal: boolean | null;

  // 관리자 전용 관리 플래그 (RUNNER 조회 시 null)
  caution: boolean | null;
  warning_count: number | null;

  image_url: string | null;
}

export interface CharacterFlagsUpdate {
  caution: boolean;
  warning_count: number;
}

export type CharacterCreate = Partial<Omit<Character, "id">> & {
  name: string;
  skill_node_ids?: number[];
};

export interface CharacterOwnedItem {
  item_id: number;
  item_name: string;
  item_description: string;
  item_image_url: string | null;
  item_type: ItemType;
  effects: ItemEffect[];
  quantity: number;
  used_quantity: number;
  equipped: boolean;
}

export interface CharacterAchievedChallenge {
  challenge_id: number;
  chapter: string;
  name: string;
  description: string;
  image_url: string | null;
  reward: string;
  reward_items: ChallengeRewardItemGrant[];
}

export interface CharacterDetail extends Character {
  owned_items: CharacterOwnedItem[];
  achieved_challenges: CharacterAchievedChallenge[];
  item_history: ItemHistoryEntry[];
  reward_history: Reward[];
  attendance_streak: number;
}

export type RewardGrant =
  | { type: "item"; item_id: number; quantity: number }
  | { type: "stat"; stat: Exclude<ItemEffectStat, "ap_reset" | "grade_choice_1" | "grade_choice_2">; amount: number };

export type ChallengeRewardItemGrant = RewardGrant;

export interface Challenge {
  id: number;
  chapter: string;
  name: string;
  description: string;
  image_url: string | null;
  reward: string;
  reward_gold: number;
  reward_experience: number;
  reward_ap: number;
  reward_hp: number;
  reward_attack: number;
  reward_defense: number;
  reward_items: ChallengeRewardItemGrant[];
  is_public: boolean;
  created_at: string;
}

export interface ChallengeCreate {
  chapter: string;
  name: string;
  description: string;
  reward: string;
  reward_gold: number;
  reward_experience: number;
  reward_ap: number;
  reward_hp: number;
  reward_attack: number;
  reward_defense: number;
  reward_items: ChallengeRewardItemGrant[];
  is_public: boolean;
}

export interface RewardItemEntry {
  type: string;
  amount: number | null;
  item_id: number | null;
  item_name: string | null;
  quantity: number | null;
  stat?: string | null;
}

export interface Reward {
  id: number;
  type: string;
  character_id: number;
  source_id: number | null;
  reward_items: RewardItemEntry[];
  rewarded_at: string;
  created_at: string;
}

export interface RewardPayResult {
  paid_count: number;
  rewards: Reward[];
}

export interface ChallengeProgress {
  character_id: number;
  character_name: string;
  character_image_url: string | null;
  achieved: boolean;
  memo: string;
  reward_paid: boolean;
}

export interface ChallengeProgressUpdate {
  character_id: number;
  achieved: boolean;
  memo: string;
}

export interface AttendanceEntry {
  id: number;
  attendance_date: string;
  character_id: number;
  character_name: string;
  character_image_url: string | null;
  reward_paid: boolean;
  created_at: string;
}

export interface AttendanceRewardPayResult {
  paid_count: number;
  entries: AttendanceEntry[];
}

export interface AttendanceStreakEntry {
  character_id: number;
  character_name: string;
  character_image_url: string | null;
  streak: number;
  rank: number;
}

export interface CartItem {
  item_id: number;
  quantity: number;
}

export async function fetchCharacters(): Promise<Character[]> {
  return request<Character[]>("/characters", undefined, "캐릭터 조회 실패");
}

export async function fetchCharacterDetail(characterId: number): Promise<CharacterDetail> {
  return request<CharacterDetail>(`/characters/${characterId}`, undefined, "캐릭터 상세 조회 실패");
}

export async function uploadCharacterImage(characterId: number, file: File): Promise<CharacterDetail> {
  return uploadFile<CharacterDetail>(`/characters/${characterId}/image`, file, "file", "캐릭터 이미지 업로드 실패");
}

export async function updateCharacterFlags(
  characterId: number,
  flags: CharacterFlagsUpdate,
): Promise<Character> {
  return request<Character>(`/characters/${characterId}/flags`, {
    method: "PATCH",
    body: JSON.stringify(flags),
  }, "관리 플래그 저장 실패");
}

export async function createCharacter(data: CharacterCreate): Promise<Character> {
  return request<Character>("/characters", {
    method: "POST",
    body: JSON.stringify(data),
  }, "캐릭터 생성 실패");
}

export async function fetchAttendanceEntries(): Promise<AttendanceEntry[]> {
  return request<AttendanceEntry[]>("/attendance/entries", undefined, "출석 목록 조회 실패");
}

export async function createAttendanceEntry(characterId: number, attendanceDate: string): Promise<AttendanceEntry[]> {
  return request<AttendanceEntry[]>("/attendance/entries", {
    method: "POST",
    body: JSON.stringify({ character_id: characterId, attendance_date: attendanceDate }),
  }, "출석 처리 실패");
}

export async function deleteAttendanceEntry(entryId: number): Promise<AttendanceEntry[]> {
  return request<AttendanceEntry[]>(`/attendance/entries/${entryId}`, {
    method: "DELETE",
  }, "출석 기록 삭제 실패");
}

export async function payAttendanceRewards(): Promise<AttendanceRewardPayResult> {
  return request<AttendanceRewardPayResult>("/attendance/rewards/pay", {
    method: "POST",
  }, "출석 보상 전송 실패");
}

export async function fetchAttendanceStreakRanking(): Promise<AttendanceStreakEntry[]> {
  return request<AttendanceStreakEntry[]>("/attendance/streak-ranking", undefined, "연속 출석 순위 조회 실패");
}

export async function fetchItems(character_id?: number): Promise<Item[]> {
  const params = character_id != null ? `?character_id=${character_id}` : "";
  return request<Item[]>(`/items${params}`, undefined, "아이템 조회 실패");
}

export async function createItem(data: ItemCreate): Promise<Item> {
  return request<Item>("/items", {
    method: "POST",
    body: JSON.stringify(data),
  }, "아이템 생성 실패");
}

export async function updateItem(itemId: number, data: ItemCreate): Promise<Item> {
  return request<Item>(`/items/${itemId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  }, "아이템 수정 실패");
}

export async function uploadItemImage(itemId: number, file: File): Promise<Item> {
  return uploadFile<Item>(`/items/${itemId}/image`, file, "file", "이미지 업로드 실패");
}

/** 가능성/잠재성의 메달 사용 시 선택 가능한 능력치. */
export const GRADE_CHOICE_STAT_OPTIONS: { value: "stat_courage" | "stat_endurance" | "stat_charity" | "stat_wisdom"; label: string }[] = [
  { value: "stat_courage", label: "용기" },
  { value: "stat_endurance", label: "인내" },
  { value: "stat_charity", label: "자애" },
  { value: "stat_wisdom", label: "지혜" },
];

// "use"로 시작하면 React Hook으로 오인되어 rules-of-hooks 린트 오탐이 발생하므로 consumeItem으로 명명한다.
export async function consumeItem(characterId: number, itemId: number, chosenStats?: string[]): Promise<CharacterDetail> {
  return request<CharacterDetail>(`/characters/${characterId}/items/${itemId}/use`, {
    method: "POST",
    body: JSON.stringify({ chosen_stats: chosenStats ?? [] }),
  }, "아이템 사용 실패");
}

export async function equipItem(characterId: number, itemId: number): Promise<CharacterDetail> {
  return request<CharacterDetail>(`/characters/${characterId}/items/${itemId}/equip`, {
    method: "POST",
  }, "아이템 장착 실패");
}

export async function unequipItem(characterId: number, itemId: number): Promise<CharacterDetail> {
  return request<CharacterDetail>(`/characters/${characterId}/items/${itemId}/unequip`, {
    method: "POST",
  }, "아이템 장착 해제 실패");
}

export async function fetchChallenges(chapter?: string): Promise<Challenge[]> {
  const params = new URLSearchParams();
  if (chapter) params.set("chapter", chapter);
  const query = params.toString() ? `?${params}` : "";
  return request<Challenge[]>(`/challenges${query}`, undefined, "도전과제 조회 실패");
}

export async function createChallenge(data: ChallengeCreate): Promise<Challenge> {
  return request<Challenge>("/challenges", {
    method: "POST",
    body: JSON.stringify(data),
  }, "도전과제 생성 실패");
}

export async function updateChallenge(challengeId: number, data: ChallengeCreate): Promise<Challenge> {
  return request<Challenge>(`/challenges/${challengeId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  }, "도전과제 수정 실패");
}

export async function uploadChallengeImage(challengeId: number, file: File): Promise<Challenge> {
  return uploadFile<Challenge>(`/challenges/${challengeId}/image`, file, "file", "도전과제 이미지 업로드 실패");
}

export async function fetchChallengeProgress(challengeId: number): Promise<ChallengeProgress[]> {
  return request<ChallengeProgress[]>(`/challenges/${challengeId}/progress`, undefined, "도전과제 현황 조회 실패");
}

export async function saveChallengeProgress(
  challengeId: number,
  entries: ChallengeProgressUpdate[],
): Promise<ChallengeProgress[]> {
  return request<ChallengeProgress[]>(`/challenges/${challengeId}/progress`, {
    method: "PUT",
    body: JSON.stringify({ entries }),
  }, "도전과제 현황 저장 실패");
}

export async function bulkPurchase(
  character_id: number,
  items: CartItem[]
): Promise<Purchase[]> {
  return request<Purchase[]>("/purchases/bulk", {
    method: "POST",
    body: JSON.stringify({ character_id, items }),
  }, "구매 실패");
}

export type SettlementType = "board" | "log";

export interface Settlement {
  id: number;
  character_id: number;
  character_name: string;
  character_image_url: string | null;
  type: SettlementType;
  total_posts: number | null;
  total_comments: number | null;
  links: string[];
  status: "pending" | "paid";
  suggested_gold: number;
  suggested_cp: number;
  paid_gold: number | null;
  paid_cp: number | null;
  created_at: string;
  updated_at: string;
}

export interface SettlementCreate {
  type: SettlementType;
  total_posts?: number | null;
  total_comments?: number | null;
  links?: string[];
}

export async function fetchSettlements(): Promise<Settlement[]> {
  return request<Settlement[]>("/settlements", undefined, "정산 요청 조회 실패");
}

export async function createSettlement(data: SettlementCreate): Promise<Settlement[]> {
  return request<Settlement[]>("/settlements", {
    method: "POST",
    body: JSON.stringify(data),
  }, "정산 요청 실패");
}

export async function paySettlement(settlementId: number, gold: number, cp: number): Promise<Settlement> {
  return request<Settlement>(`/settlements/${settlementId}/pay`, {
    method: "POST",
    body: JSON.stringify({ gold, cp }),
  }, "정산 지급 실패");
}

export interface RewardWithCharacter extends Reward {
  character_name: string;
  character_image_url: string | null;
  revoked: boolean;
}

export async function fetchAllRewards(filters?: {
  character_id?: number;
  date_from?: string;
  date_to?: string;
}): Promise<RewardWithCharacter[]> {
  const params = new URLSearchParams();
  if (filters?.character_id != null) params.set("character_id", String(filters.character_id));
  if (filters?.date_from) params.set("date_from", filters.date_from);
  if (filters?.date_to) params.set("date_to", filters.date_to);
  const query = params.toString() ? `?${params}` : "";
  return request<RewardWithCharacter[]>(`/rewards${query}`, undefined, "보상 이력 조회 실패");
}

export async function revokeReward(rewardId: number): Promise<RewardWithCharacter> {
  return request<RewardWithCharacter>(`/rewards/${rewardId}/revoke`, {
    method: "POST",
  }, "보상 회수 실패");
}

export interface AdminGiftRequest {
  character_ids: number[];
  gold: number;
  cp: number;
  items: CartItem[];
}

export async function sendAdminGift(data: AdminGiftRequest): Promise<Reward[]> {
  return request<Reward[]>("/rewards/admin-gift", {
    method: "POST",
    body: JSON.stringify(data),
  }, "선물 보내기 실패");
}

export async function fetchPurchases(character_id?: number, item_id?: number): Promise<Purchase[]> {
  const params = new URLSearchParams();
  if (character_id != null) params.set("character_id", String(character_id));
  if (item_id != null) params.set("item_id", String(item_id));
  const query = params.toString() ? `?${params}` : "";
  return request<Purchase[]>(`/purchases${query}`, undefined, "구매 내역 조회 실패");
}

export type MissionRewardItemGrant = RewardGrant;

export interface Mission {
  id: number;
  chapter: string;
  mission_type: string;
  name: string;
  description: string;
  image_url: string | null;
  reward: string;
  reward_gold: number;
  reward_experience: number;
  reward_ap: number;
  reward_hp: number;
  reward_attack: number;
  reward_defense: number;
  reward_items: MissionRewardItemGrant[];
  is_public: boolean;
  created_at: string;
}

export interface MissionCreate {
  chapter: string;
  mission_type: string;
  name: string;
  description: string;
  reward: string;
  reward_gold: number;
  reward_experience: number;
  reward_ap: number;
  reward_hp: number;
  reward_attack: number;
  reward_defense: number;
  reward_items: MissionRewardItemGrant[];
  is_public: boolean;
}

export interface MissionProgress {
  character_id: number;
  character_name: string;
  character_image_url: string | null;
  achieved: boolean;
  memo: string;
  reward_paid: boolean;
}

export interface MissionProgressUpdate {
  character_id: number;
  achieved: boolean;
  memo: string;
}

export async function fetchMissions(chapter?: string): Promise<Mission[]> {
  const params = new URLSearchParams();
  if (chapter) params.set("chapter", chapter);
  const query = params.toString() ? `?${params}` : "";
  return request<Mission[]>(`/missions${query}`, undefined, "임무 조회 실패");
}

export async function createMission(data: MissionCreate): Promise<Mission> {
  return request<Mission>("/missions", {
    method: "POST",
    body: JSON.stringify(data),
  }, "임무 생성 실패");
}

export async function updateMission(missionId: number, data: MissionCreate): Promise<Mission> {
  return request<Mission>(`/missions/${missionId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  }, "임무 수정 실패");
}

export async function uploadMissionImage(missionId: number, file: File): Promise<Mission> {
  return uploadFile<Mission>(`/missions/${missionId}/image`, file, "file", "임무 이미지 업로드 실패");
}

export async function fetchMissionProgress(missionId: number): Promise<MissionProgress[]> {
  return request<MissionProgress[]>(`/missions/${missionId}/progress`, undefined, "임무 현황 조회 실패");
}

export async function saveMissionProgress(
  missionId: number,
  entries: MissionProgressUpdate[],
): Promise<MissionProgress[]> {
  return request<MissionProgress[]>(`/missions/${missionId}/progress`, {
    method: "PUT",
    body: JSON.stringify({ entries }),
  }, "임무 현황 저장 실패");
}

export async function payMissionRewards(missionId: number): Promise<RewardPayResult> {
  return request<RewardPayResult>(`/rewards/mission/${missionId}`, {
    method: "POST",
  }, "임무 보상 지급 실패");
}

export async function payChallengeRewards(challengeId: number): Promise<RewardPayResult> {
  return request<RewardPayResult>(`/rewards/challenge/${challengeId}`, {
    method: "POST",
  }, "도전과제 보상 지급 실패");
}

export interface Chapter {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  battle_date: string | null;
  image_url: string | null;
  music_url: string | null;
  is_active: boolean;
  is_battle_day: boolean;
  created_at: string;
}

export interface ChapterCreate {
  name: string;
  start_date: string;
  end_date: string;
  battle_date?: string | null;
  music_url?: string | null;
}

// 챕터 목록은 자주 조회되지만 거의 바뀌지 않으므로 짧게 캐싱해 페이지 이동마다 재조회하지 않는다.
// 생성/수정/이미지·음원 업로드 시에는 즉시 무효화해 관리자가 바로 최신 상태를 본다.
const CHAPTER_CACHE_TTL_MS = 60_000;
let chapterCache: { data: Chapter[]; expiresAt: number } | null = null;

function invalidateChapterCache() {
  chapterCache = null;
}

export async function fetchChapters(): Promise<Chapter[]> {
  if (chapterCache && Date.now() < chapterCache.expiresAt) {
    return chapterCache.data;
  }
  const data = await request<Chapter[]>("/chapters", undefined, "챕터 조회 실패");
  chapterCache = { data, expiresAt: Date.now() + CHAPTER_CACHE_TTL_MS };
  return data;
}

export async function createChapter(data: ChapterCreate): Promise<Chapter> {
  const created = await request<Chapter>("/chapters", {
    method: "POST",
    body: JSON.stringify(data),
  }, "챕터 생성 실패");
  invalidateChapterCache();
  return created;
}

export async function updateChapter(chapterId: number, data: ChapterCreate): Promise<Chapter> {
  const updated = await request<Chapter>(`/chapters/${chapterId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  }, "챕터 수정 실패");
  invalidateChapterCache();
  return updated;
}

export async function uploadChapterImage(chapterId: number, file: File): Promise<Chapter> {
  const updated = await uploadFile<Chapter>(`/chapters/${chapterId}/image`, file, "file", "챕터 이미지 업로드 실패");
  invalidateChapterCache();
  return updated;
}

export async function uploadChapterMusic(chapterId: number, file: File): Promise<Chapter> {
  const updated = await uploadFile<Chapter>(`/chapters/${chapterId}/music`, file, "file", "챕터 음원 업로드 실패");
  invalidateChapterCache();
  return updated;
}

export async function fetchActiveChapter(): Promise<Chapter | null> {
  return request<Chapter | null>("/chapters/active", undefined, "활성 챕터 조회 실패");
}

export interface EnemySkill {
  skill_type: string;
  name: string;
  target_count: number;
  damage_percent: number;
  summon_name: string | null;
  summon_hp: number | null;
  summon_attack: number | null;
  summon_count: number | null;
  summon_image_url: string | null;
}

export interface Enemy {
  id: number;
  name: string;
  chapter: string | null;
  image_url: string | null;
  base_hp: number;
  hp_per_attacker: number;
  hp_per_defender: number;
  hp_per_healer: number;
  attack: number;
  skills: EnemySkill[];
  created_at: string;
}

export interface EnemyCreate {
  name: string;
  chapter: string | null;
  base_hp: number;
  hp_per_attacker: number;
  hp_per_defender: number;
  hp_per_healer: number;
  attack: number;
  skills: EnemySkill[];
}

export async function fetchEnemies(chapter?: string): Promise<Enemy[]> {
  const params = chapter ? `?chapter=${encodeURIComponent(chapter)}` : "";
  return request<Enemy[]>(`/enemies${params}`, undefined, "에너미 조회 실패");
}

export async function createEnemy(data: EnemyCreate): Promise<Enemy> {
  return request<Enemy>("/enemies", {
    method: "POST",
    body: JSON.stringify(data),
  }, "에너미 생성 실패");
}

export async function updateEnemy(enemyId: number, data: EnemyCreate): Promise<Enemy> {
  return request<Enemy>(`/enemies/${enemyId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  }, "에너미 수정 실패");
}

export async function uploadEnemyImage(enemyId: number, file: File): Promise<Enemy> {
  return uploadFile<Enemy>(`/enemies/${enemyId}/image`, file, "file", "에너미 이미지 업로드 실패");
}

export async function uploadEnemySummonImage(enemyId: number, skillIndex: number, file: File): Promise<Enemy> {
  return uploadFile<Enemy>(`/enemies/${enemyId}/skills/${skillIndex}/summon-image`, file, "file", "소환수 이미지 업로드 실패");
}

export type BattleMode = "practice" | "real";
export type BattleStatus = "in_progress" | "victory" | "defeat" | "early_terminated";
export type CharacterActionKind = "attack" | "skill" | "defend" | "heal" | "item" | "none" | "retreat";
export type EnemyActionKind = "attack" | "summon" | "none";

export interface BattleEnemyState {
  enemy_id: number;
  name: string;
  attack: number;
  hp: number;
  max_hp: number;
  skills: EnemySkill[];
  joined_round?: number;
}

export interface BattleSummonState {
  id: number;
  name: string;
  log_number?: number | null;
  hp: number;
  max_hp: number;
  attack: number;
}

export interface BattleParticipant {
  character_id: number;
  name: string;
  image_url: string | null;
  faction: Faction | null;
  atk: number; atk_p: number; dmg_p: number;
  skill_lv: number; skill_eff_true: number; skill_eff_fixed: number; skill_cost: number;
  def: number; def_p: number; def_eff: number; dmg_r: number;
  heal_eff: number; skill_target: number; over_heal: boolean;
  attn: number; presence: number;
  hp: number; max_hp: number; shield: number;
  mp: number; max_mp: number;
  hp_regen_true: number; hp_regen_fixed: number; mp_regen: number;
  downed: boolean; retreated: boolean; joined_round: number;
}

export interface BattleLogRound {
  round: number;
  events: string[];
}

export interface BattleSession {
  id: number;
  mode: BattleMode;
  chapter: string | null;
  status: BattleStatus;
  round: number;
  enemies: BattleEnemyState[];
  summons: BattleSummonState[];
  participants: BattleParticipant[];
  log: BattleLogRound[];
  created_at: string;
  updated_at: string;
}

export interface BattleSessionSummary {
  id: number;
  mode: BattleMode;
  chapter: string | null;
  status: BattleStatus;
  round: number;
  enemy_names: string[];
  created_at: string;
  updated_at: string;
}

export interface BattleStartRequest {
  mode: BattleMode;
  enemy_ids: number[];
  character_ids: number[];
}

export interface BattleCharacterActionInput {
  character_id: number;
  kind: CharacterActionKind;
  target_enemy_id?: number | null;
  target_character_id?: number | null;
  item_id?: number | null;
}

export interface BattleEnemyActionInput {
  enemy_id: number;
  kind: EnemyActionKind;
  skill_index?: number | null;
}

export async function fetchBattles(params?: { mode?: BattleMode; status?: BattleStatus }): Promise<BattleSessionSummary[]> {
  const search = new URLSearchParams();
  if (params?.mode) search.set("mode", params.mode);
  if (params?.status) search.set("status", params.status);
  const query = search.toString() ? `?${search}` : "";
  return request<BattleSessionSummary[]>(`/battles${query}`, undefined, "전투 목록 조회 실패");
}

export async function fetchBattle(sessionId: number): Promise<BattleSession> {
  return request<BattleSession>(`/battles/${sessionId}`, undefined, "전투 조회 실패");
}

/** 러너 관전용: 진행 중인 실전 전투가 있으면 반환하고, 없으면 null을 반환한다. */
export async function fetchLiveBattle(): Promise<BattleSession | null> {
  return request<BattleSession | null>("/battles/live", undefined, "전투 조회 실패");
}

export async function createBattle(data: BattleStartRequest): Promise<BattleSession> {
  return request<BattleSession>("/battles", {
    method: "POST",
    body: JSON.stringify(data),
  }, "전투 시작 실패");
}

export async function submitBattleActions(
  sessionId: number,
  characterActions: BattleCharacterActionInput[],
  enemyActions: BattleEnemyActionInput[],
): Promise<BattleSession> {
  return request<BattleSession>(`/battles/${sessionId}/actions`, {
    method: "POST",
    body: JSON.stringify({ character_actions: characterActions, enemy_actions: enemyActions }),
  }, "라운드 진행 실패");
}

export async function terminateBattle(sessionId: number): Promise<BattleSession> {
  return request<BattleSession>(`/battles/${sessionId}/terminate`, {
    method: "POST",
  }, "전투 종료 실패");
}

export async function joinBattle(sessionId: number, characterId: number): Promise<BattleSession> {
  return request<BattleSession>(`/battles/${sessionId}/join`, {
    method: "POST",
    body: JSON.stringify({ character_id: characterId }),
  }, "난입 실패");
}

export async function joinBattleEnemy(sessionId: number, enemyId: number): Promise<BattleSession> {
  return request<BattleSession>(`/battles/${sessionId}/join-enemy`, {
    method: "POST",
    body: JSON.stringify({ enemy_id: enemyId }),
  }, "에너미 참가 실패");
}

/** 직전 라운드를 되돌려 그 라운드를 다시 진행할 수 있게 한다(실전 전투만 가능). */
export async function undoLastBattleRound(sessionId: number): Promise<BattleSession> {
  return request<BattleSession>(`/battles/${sessionId}/undo-round`, {
    method: "POST",
  }, "라운드 되돌리기 실패");
}

export async function deleteBattle(sessionId: number): Promise<void> {
  await request(`/battles/${sessionId}`, { method: "DELETE" }, "전투 기록 삭제 실패");
}

/** 기술트리 "서" — 캐릭터의 역할(Faction)과 무관한 별개의 축. 모든 캐릭터가 4개 서 전부를 배울 수 있다. */
export type SkillBook = "용맹의 서" | "불굴의 서" | "헌신의 서" | "탐구의 서";

export interface SkillNode {
  id: number;
  book: SkillBook;
  branch: number | null;
  col: number | null;
  tier: number;
  tier_label: string;
  default_name: string;
  image_url: string | null;
  effects: ItemEffect[];
  trigger_type: string | null;
  category: string | null;
  stackable: boolean | null;
  cost: number | null;
  power: number | null;
  target: string | null;
  activation_order: number | null;
  formula: string | null;
  description: string | null;
  is_placeholder: boolean;
  is_public: boolean;
}

export interface CharacterSkillNode extends SkillNode {
  unlocked: boolean;
  custom_name: string | null;
  display_name: string;
  unlocked_at: string | null;
}

export interface CharacterSkillTree {
  book: SkillBook;
  character_ap: number;
  ap_cost_to_unlock: number;
  latest_unlocked_node_id: number | null;
  nodes: CharacterSkillNode[];
}

export async function fetchSkillNodes(book: SkillBook): Promise<SkillNode[]> {
  return request<SkillNode[]>(`/skills?book=${encodeURIComponent(book)}`, undefined, "기술트리 조회 실패");
}

export async function updateSkillNode(
  nodeId: number,
  data: { default_name: string; effects: ItemEffect[] },
): Promise<SkillNode> {
  return request<SkillNode>(`/skills/${nodeId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  }, "기술 수정 실패");
}

export async function updateSkillVisibility(maxPublicTier: number): Promise<SkillNode[]> {
  return request<SkillNode[]>("/skills/visibility", {
    method: "PUT",
    body: JSON.stringify({ max_public_tier: maxPublicTier }),
  }, "기술 공개 단계 저장 실패");
}

export async function uploadSkillImage(nodeId: number, file: File): Promise<SkillNode> {
  return uploadFile<SkillNode>(`/skills/${nodeId}/image`, file, "file", "기술 이미지 업로드 실패");
}

export async function fetchCharacterSkillTree(characterId: number, book: SkillBook): Promise<CharacterSkillTree> {
  return request<CharacterSkillTree>(`/characters/${characterId}/skills?book=${encodeURIComponent(book)}`, undefined, "캐릭터 기술트리 조회 실패");
}

export async function unlockCharacterSkill(characterId: number, nodeId: number): Promise<CharacterSkillTree> {
  return request<CharacterSkillTree>(`/characters/${characterId}/skills/${nodeId}/unlock`, {
    method: "POST",
  }, "기술 강화 실패");
}

export async function renameCharacterSkill(
  characterId: number,
  nodeId: number,
  customName: string,
): Promise<CharacterSkillTree> {
  return request<CharacterSkillTree>(`/characters/${characterId}/skills/${nodeId}/name`, {
    method: "PUT",
    body: JSON.stringify({ custom_name: customName }),
  }, "기술 이름 설정 실패");
}
