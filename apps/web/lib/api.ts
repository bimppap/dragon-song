const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface Item {
  id: number;
  name: string;
  price: number;
  description_user: string;
  description_internal: string;
  purchase_limit_per_character: number | null;
  purchase_limit_global: number | null;
  created_at: string;
  purchased_by_character: number;
  purchased_total: number;
  remaining_per_character: number | null;
  remaining_global: number | null;
}

export interface ItemCreate {
  name: string;
  price: number;
  description_user: string;
  description_internal: string;
  purchase_limit_per_character: number | null;
  purchase_limit_global: number | null;
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
  hp: number;
  attack: number;
  defense: number;
  gold: number;
  ap: number;
  experience: number;
}

export interface CharacterCreate {
  name: string;
  hp: number;
  attack: number;
  defense: number;
  gold: number;
  ap: number;
  experience: number;
}

export interface CharacterOwnedItem {
  item_id: number;
  item_name: string;
  quantity: number;
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
  const res = await fetch(`${API_URL}/characters`);
  if (!res.ok) throw new Error("캐릭터 조회 실패");
  return res.json();
}

export async function fetchCharacterDetail(characterId: number): Promise<CharacterDetail> {
  const res = await fetch(`${API_URL}/characters/${characterId}`);
  if (!res.ok) throw new Error("캐릭터 상세 조회 실패");
  return res.json();
}

export async function createCharacter(data: CharacterCreate): Promise<Character> {
  const res = await fetch(`${API_URL}/characters`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "캐릭터 생성 실패");
  }
  return res.json();
}

export async function fetchAttendance(attendanceDate: string): Promise<AttendanceRecord> {
  const params = new URLSearchParams({ attendance_date: attendanceDate });
  const res = await fetch(`${API_URL}/attendance?${params.toString()}`);
  if (!res.ok) throw new Error("출석 데이터 조회 실패");
  return res.json();
}

export async function saveAttendance(
  attendanceDate: string,
  characterIds: number[],
  rewardPaid: boolean,
): Promise<AttendanceRecord> {
  const params = new URLSearchParams({ attendance_date: attendanceDate });
  const res = await fetch(`${API_URL}/attendance?${params.toString()}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      character_ids: characterIds,
      reward_paid: rewardPaid,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "출석 데이터 저장 실패");
  }
  return res.json();
}

export async function fetchItems(character_id?: number): Promise<Item[]> {
  const params = character_id != null ? `?character_id=${character_id}` : "";
  const res = await fetch(`${API_URL}/items${params}`);
  if (!res.ok) throw new Error("아이템 조회 실패");
  return res.json();
}

export async function createItem(data: ItemCreate): Promise<Item> {
  const res = await fetch(`${API_URL}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("아이템 생성 실패");
  return res.json();
}

export async function fetchChallenges(chapter?: string): Promise<Challenge[]> {
  const params = new URLSearchParams();
  if (chapter) params.set("chapter", chapter);
  const query = params.toString() ? `?${params}` : "";
  const res = await fetch(`${API_URL}/challenges${query}`);
  if (!res.ok) throw new Error("도전과제 조회 실패");
  return res.json();
}

export async function createChallenge(data: ChallengeCreate): Promise<Challenge> {
  const res = await fetch(`${API_URL}/challenges`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "도전과제 생성 실패");
  }
  return res.json();
}

export async function fetchChallengeProgress(challengeId: number): Promise<ChallengeProgress[]> {
  const res = await fetch(`${API_URL}/challenges/${challengeId}/progress`);
  if (!res.ok) throw new Error("도전과제 현황 조회 실패");
  return res.json();
}

export async function saveChallengeProgress(
  challengeId: number,
  entries: ChallengeProgressUpdate[],
): Promise<ChallengeProgress[]> {
  const res = await fetch(`${API_URL}/challenges/${challengeId}/progress`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entries }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "도전과제 현황 저장 실패");
  }
  return res.json();
}

export async function bulkPurchase(
  character_id: number,
  items: CartItem[]
): Promise<Purchase[]> {
  const res = await fetch(`${API_URL}/purchases/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ character_id, items }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "구매 실패");
  }
  return res.json();
}

export async function fetchPurchases(character_id?: number, item_id?: number): Promise<Purchase[]> {
  const params = new URLSearchParams();
  if (character_id != null) params.set("character_id", String(character_id));
  if (item_id != null) params.set("item_id", String(item_id));
  const query = params.toString() ? `?${params}` : "";
  const res = await fetch(`${API_URL}/purchases${query}`);
  if (!res.ok) throw new Error("구매 내역 조회 실패");
  return res.json();
}

export async function payAttendanceRewards(attendanceDate: string): Promise<RewardPayResult> {
  const params = new URLSearchParams({ attendance_date: attendanceDate });
  const res = await fetch(`${API_URL}/rewards/attendance?${params.toString()}`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "출석 보상 지급 실패");
  }
  return res.json();
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
  const res = await fetch(`${API_URL}/missions${query}`);
  if (!res.ok) throw new Error("임무 조회 실패");
  return res.json();
}

export async function createMission(data: MissionCreate): Promise<Mission> {
  const res = await fetch(`${API_URL}/missions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "임무 생성 실패");
  }
  return res.json();
}

export async function fetchMissionProgress(missionId: number): Promise<MissionProgress[]> {
  const res = await fetch(`${API_URL}/missions/${missionId}/progress`);
  if (!res.ok) throw new Error("임무 현황 조회 실패");
  return res.json();
}

export async function saveMissionProgress(
  missionId: number,
  entries: MissionProgressUpdate[],
): Promise<MissionProgress[]> {
  const res = await fetch(`${API_URL}/missions/${missionId}/progress`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entries }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "임무 현황 저장 실패");
  }
  return res.json();
}

export async function payMissionRewards(missionId: number): Promise<RewardPayResult> {
  const res = await fetch(`${API_URL}/rewards/mission/${missionId}`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "임무 보상 지급 실패");
  }
  return res.json();
}

export async function payChallengeRewards(challengeId: number): Promise<RewardPayResult> {
  const res = await fetch(`${API_URL}/rewards/challenge/${challengeId}`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "도전과제 보상 지급 실패");
  }
  return res.json();
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
  const res = await fetch(`${API_URL}/chapters`);
  if (!res.ok) throw new Error("챕터 조회 실패");
  return res.json();
}

export async function createChapter(data: ChapterCreate): Promise<Chapter> {
  const res = await fetch(`${API_URL}/chapters`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "챕터 생성 실패");
  }
  return res.json();
}

export async function fetchActiveChapter(): Promise<Chapter | null> {
  const res = await fetch(`${API_URL}/chapters/active`);
  if (!res.ok) throw new Error("활성 챕터 조회 실패");
  return res.json();
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
  const res = await fetch(`${API_URL}/enemies${params}`);
  if (!res.ok) throw new Error("에너미 조회 실패");
  return res.json();
}

export async function createEnemy(data: EnemyCreate): Promise<Enemy> {
  const res = await fetch(`${API_URL}/enemies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "에너미 생성 실패");
  }
  return res.json();
}
