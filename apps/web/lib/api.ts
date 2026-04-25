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
  item_id: number;
  item_name: string;
  created_at: string;
}

export interface Character {
  id: number;
  name: string;
  hp: number;
  attack: number;
  defense: number;
  gold: number;
}

export async function fetchCharacters(): Promise<Character[]> {
  const res = await fetch(`${API_URL}/characters`);
  if (!res.ok) throw new Error("캐릭터 조회 실패");
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

export async function purchaseItem(character_id: number, item_id: number): Promise<Purchase> {
  const res = await fetch(`${API_URL}/purchases`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ character_id, item_id }),
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
