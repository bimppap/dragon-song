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
}

export interface Challenge {
  id: number;
  chapter: string;
  name: string;
  description: string;
  reward: string;
  is_public: boolean;
  created_at: string;
}

export interface ChallengeCreate {
  chapter: string;
  name: string;
  description: string;
  reward: string;
  is_public: boolean;
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
