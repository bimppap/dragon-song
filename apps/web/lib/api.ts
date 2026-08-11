import { getToken } from "./token";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit, errorMessage = "요청 처리에 실패했습니다."): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
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
  token_type: string;
  member: Member;
}

export interface CharacterOnboardingCreate {
  name: string;
  faction: Faction;
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
  | "hp" | "hp_max" | "hp_max_p" | "hp_regen_true" | "hp_regen_fixed"
  | "mp" | "mp_max" | "mp_regen"
  | "atk" | "atk_p" | "def" | "def_p" | "def_eff"
  | "attn" | "presence" | "heal_eff" | "heal_eff_p"
  | "sh" | "dmg_p" | "dmg_r"
  | "skill_lv" | "skill_eff_true" | "skill_eff_fixed"
  | "skill_cost" | "skill_target"
  | "start_sh" | "revive_hp" | "act_time"
  | "ap_reset";

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
  { value: "heal_eff_p", label: "치유 효율 증폭" },
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
];

/** ItemEffectStat → 한글 라벨 조회 맵. */
export const EFFECT_STAT_LABELS: Record<string, string> = Object.fromEntries(
  ITEM_EFFECT_STAT_OPTIONS.map((option) => [option.value, option.label]),
);

/** 효과 하나를 "라벨 +N" 형태의 문자열로 표현한다. */
export function formatEffect(effect: ItemEffect): string {
  const label = EFFECT_STAT_LABELS[effect.stat] ?? effect.stat;
  if (effect.stat === "ap_reset") return label;
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
  effects: ItemEffect[];
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
  effects: ItemEffect[];
}

export interface Purchase {
  id: number;
  character_id: number;
  character_name: string;
  item_id: number;
  item_name: string;
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
  heal_eff_p: number;
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
}

export type CharacterCreate = Partial<Omit<Character, "id">> & { name: string };

export interface CharacterOwnedItem {
  item_id: number;
  item_name: string;
  item_description: string;
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
  reward: string;
}

export interface CharacterDetail extends Character {
  owned_items: CharacterOwnedItem[];
  achieved_challenges: CharacterAchievedChallenge[];
  purchase_history: Purchase[];
  reward_history: Reward[];
}

export interface ChallengeRewardItemGrant {
  item_id: number;
  quantity: number;
}

export interface Challenge {
  id: number;
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
  quantity: number | null;
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
  achieved: boolean;
  memo: string;
}

export interface ChallengeProgressUpdate {
  character_id: number;
  achieved: boolean;
  memo: string;
}

export interface AttendanceRecord {
  attendance_date: string;
  character_ids: number[];
  reward_paid: boolean;
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

export async function createCharacter(data: CharacterCreate): Promise<Character> {
  return request<Character>("/characters", {
    method: "POST",
    body: JSON.stringify(data),
  }, "캐릭터 생성 실패");
}

export async function fetchAttendance(attendanceDate: string): Promise<AttendanceRecord> {
  const params = new URLSearchParams({ attendance_date: attendanceDate });
  return request<AttendanceRecord>(`/attendance?${params.toString()}`, undefined, "출석 데이터 조회 실패");
}

export async function saveAttendance(
  attendanceDate: string,
  characterIds: number[],
  rewardPaid: boolean,
): Promise<AttendanceRecord> {
  const params = new URLSearchParams({ attendance_date: attendanceDate });
  return request<AttendanceRecord>(`/attendance?${params.toString()}`, {
    method: "PUT",
    body: JSON.stringify({
      character_ids: characterIds,
      reward_paid: rewardPaid,
    }),
  }, "출석 데이터 저장 실패");
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

export async function useItem(characterId: number, itemId: number): Promise<CharacterDetail> {
  return request<CharacterDetail>(`/characters/${characterId}/items/${itemId}/use`, {
    method: "POST",
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

export async function fetchPurchases(character_id?: number, item_id?: number): Promise<Purchase[]> {
  const params = new URLSearchParams();
  if (character_id != null) params.set("character_id", String(character_id));
  if (item_id != null) params.set("item_id", String(item_id));
  const query = params.toString() ? `?${params}` : "";
  return request<Purchase[]>(`/purchases${query}`, undefined, "구매 내역 조회 실패");
}

export async function payAttendanceRewards(attendanceDate: string): Promise<RewardPayResult> {
  const params = new URLSearchParams({ attendance_date: attendanceDate });
  return request<RewardPayResult>(`/rewards/attendance?${params.toString()}`, {
    method: "POST",
  }, "출석 보상 지급 실패");
}

export interface MissionRewardItemGrant {
  item_id: number;
  quantity: number;
}

export interface Mission {
  id: number;
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
  achieved: boolean;
  memo: string;
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
  is_active: boolean;
  created_at: string;
}

export interface ChapterCreate {
  name: string;
  start_date: string;
  end_date: string;
}

export async function fetchChapters(): Promise<Chapter[]> {
  return request<Chapter[]>("/chapters", undefined, "챕터 조회 실패");
}

export async function createChapter(data: ChapterCreate): Promise<Chapter> {
  return request<Chapter>("/chapters", {
    method: "POST",
    body: JSON.stringify(data),
  }, "챕터 생성 실패");
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
}

export interface Enemy {
  id: number;
  name: string;
  chapter: string | null;
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

export interface SkillNode {
  id: number;
  faction: Faction;
  branch: number | null;
  col: number | null;
  tier: number;
  tier_label: string;
  default_name: string;
  effects: ItemEffect[];
}

export interface CharacterSkillNode extends SkillNode {
  unlocked: boolean;
  custom_name: string | null;
  display_name: string;
}

export interface CharacterSkillTree {
  faction: Faction;
  character_ap: number;
  ap_cost_to_unlock: number;
  latest_unlocked_node_id: number | null;
  nodes: CharacterSkillNode[];
}

export async function fetchSkillNodes(faction: Faction): Promise<SkillNode[]> {
  return request<SkillNode[]>(`/skills?faction=${encodeURIComponent(faction)}`, undefined, "기술트리 조회 실패");
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

export async function fetchCharacterSkillTree(characterId: number): Promise<CharacterSkillTree> {
  return request<CharacterSkillTree>(`/characters/${characterId}/skills`, undefined, "캐릭터 기술트리 조회 실패");
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
