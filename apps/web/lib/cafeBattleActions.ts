import type { CharacterActionKind, NaverCafePost } from "@/lib/api";

/** 전투 게시판 말머리 → 캐릭터 행동. 게시판 규칙이라 화면의 행동 이름과 따로 둔다. 대상·아이템은 관리자가 직접 지정한다. */
const CAFE_HEAD_ACTION_KIND = new Map<string, CharacterActionKind>([
  ["공격", "attack"],
  ["기술", "skill"],
  ["방어", "defend"],
  ["치유", "heal"],
  ["소비", "item"],
  ["구조", "rescue"],
  ["퇴각", "retreat"],
]);

function headKind(head: string | null): CharacterActionKind | undefined {
  return head ? CAFE_HEAD_ACTION_KIND.get(head) : undefined;
}

/** menuid 숫자 또는 게시판 주소(…/menus/44, …menuid=44)에서 menuid를 읽는다. */
export function parseCafeMenuId(value: string): number | null {
  const match = value.trim().match(/^(\d+)$/) ?? value.match(/menus\/(\d+)/) ?? value.match(/menuid=(\d+)/i);
  const menuId = match ? Number(match[1]) : 0;
  return menuId > 0 ? menuId : null;
}

export interface CafeActionActor {
  character_id: number;
  name: string;
}

export interface CafeAction {
  character_id: number;
  name: string;
  kind: CharacterActionKind;
  /** 행동을 정한 글. null이면 범위 안에 글이 없어 무반응으로 지정한 것이다. */
  post: NaverCafePost | null;
}

export interface CafeActionPlan {
  actions: CafeAction[];
  /** 글은 썼지만 말머리를 행동으로 읽을 수 없는 참가자. 행동을 바꾸지 않는다. */
  unknownHeads: { name: string; head: string | null }[];
  /** 행동 말머리로 글을 썼지만 이번 턴에 행동할 참가자가 아닌 작성자 */
  outsiders: string[];
}

/**
 * 글쓴이 닉네임을 이번 턴에 행동할 캐릭터 이름과 맞춰 행동을 정한다.
 * posts는 글번호 오름차순(서버 응답 순서)이며, 한 사람이 글을 여러 개 쓰면 마지막 글을 따른다.
 */
export function planCafeActions(posts: NaverCafePost[], actors: CafeActionActor[]): CafeActionPlan {
  const latestPostByWriter = new Map(posts.map((post) => [post.writer_name, post]));

  const actions: CafeAction[] = [];
  const unknownHeads: CafeActionPlan["unknownHeads"] = [];
  for (const actor of actors) {
    const post = latestPostByWriter.get(actor.name);
    if (!post) {
      actions.push({ character_id: actor.character_id, name: actor.name, kind: "none", post: null });
      continue;
    }
    const kind = headKind(post.head_name);
    if (kind) actions.push({ character_id: actor.character_id, name: actor.name, kind, post });
    else unknownHeads.push({ name: actor.name, head: post.head_name });
  }

  const actorNames = new Set(actors.map((actor) => actor.name));
  const outsiders = [...latestPostByWriter.values()]
    .filter((post) => headKind(post.head_name) && !actorNames.has(post.writer_name))
    .map((post) => post.writer_name);

  return { actions, unknownHeads, outsiders };
}
