import asyncio

from fastapi import WebSocket

from app.auth import is_admin_role
from app.models import Member
from app.schemas import BattleSessionRead

SEND_TIMEOUT_SECONDS = 3.0

# 브라우저가 보낸 임시 초안은 DB에 저장하지 않지만, 다른 운영 화면에 그대로
# 병합되므로 각 초안 유형에서 실제로 사용하는 필드만 전달한다.
DRAFT_PATCH_FIELDS: dict[str, frozenset[str]] = {
    "character": frozenset({
        "kind",
        "skill_node_id",
        "skill_target_keys",
        "target_enemy_id",
        "target_character_id",
        "protect_target_character_id",
        "item_id",
    }),
    "enemy": frozenset({"kind", "skill_index", "target_character_ids"}),
}


class BattleConnectionManager:
    """세션별 WebSocket 커넥션을 메모리에 보관하고 브로드캐스트한다.

    단일 프로세스(단일 uvicorn 워커) 배포를 전제로 한다. 워커를 여러 개로
    늘리면 프로세스마다 별도의 매니저 인스턴스가 생겨 브로드캐스트가
    다른 워커에 붙은 커넥션까지 전달되지 않으므로, 그 경우 Redis pub/sub
    등으로 교체해야 한다.
    """

    def __init__(self) -> None:
        self._rooms: dict[int, set[WebSocket]] = {}
        self._staff_rooms: dict[int, set[WebSocket]] = {}
        self._drafts: dict[int, dict[str, dict[int, dict]]] = {}
        self._loop: asyncio.AbstractEventLoop | None = None

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    async def connect(self, session_id: int, websocket: WebSocket, *, is_staff: bool) -> None:
        await websocket.accept()
        self._rooms.setdefault(session_id, set()).add(websocket)
        if is_staff:
            self._staff_rooms.setdefault(session_id, set()).add(websocket)
            draft = self.draft_snapshot(session_id)
            if draft:
                await websocket.send_json({"type": "draft_snapshot", "draft": draft})

    def apply_draft_patch(self, session_id: int, draft_type: str, entity_id: int, patch: dict) -> None:
        session_drafts = self._drafts.setdefault(session_id, {})
        drafts_by_type = session_drafts.setdefault(draft_type, {})
        drafts_by_type.setdefault(entity_id, {}).update(patch)

    def draft_snapshot(self, session_id: int) -> dict[str, dict[str, dict]]:
        session_drafts = self._drafts.get(session_id)
        if not session_drafts:
            return {}
        return {
            draft_type: {str(entity_id): dict(patch) for entity_id, patch in drafts.items()}
            for draft_type, drafts in session_drafts.items()
        }

    def clear_drafts(self, session_id: int) -> None:
        self._drafts.pop(session_id, None)

    def disconnect(self, session_id: int, websocket: WebSocket) -> None:
        room = self._rooms.get(session_id)
        if room is None:
            return
        room.discard(websocket)
        staff_room = self._staff_rooms.get(session_id)
        if staff_room is not None:
            staff_room.discard(websocket)
            if not staff_room:
                self._staff_rooms.pop(session_id, None)
        if not room:
            self._rooms.pop(session_id, None)

    async def broadcast(
        self,
        session_id: int,
        message: dict,
        *,
        exclude: WebSocket | None = None,
        staff_only: bool = False,
    ) -> None:
        room = (self._staff_rooms if staff_only else self._rooms).get(session_id)
        if not room:
            return
        recipients = tuple(ws for ws in room if ws is not exclude)

        async def send(ws: WebSocket) -> WebSocket | None:
            try:
                await asyncio.wait_for(ws.send_json(message), timeout=SEND_TIMEOUT_SECONDS)
                return None
            except Exception:
                return ws

        # 한 사용자의 느린 연결이 나머지 전체 전송을 순차적으로 막지 않게 한다.
        dead = [ws for ws in await asyncio.gather(*(send(ws) for ws in recipients)) if ws is not None]
        for ws in dead:
            self.disconnect(session_id, ws)

    def schedule_broadcast(self, session_id: int, message: dict) -> None:
        """동기 컨텍스트(일반 REST 엔드포인트, 스레드풀에서 실행됨)에서
        비동기 브로드캐스트를 메인 이벤트루프에 안전하게 스케줄한다."""
        if self._loop is None:
            return
        asyncio.run_coroutine_threadsafe(self.broadcast(session_id, message), self._loop)


manager = BattleConnectionManager()


def broadcast_battle_update(session_id: int, session) -> None:
    manager.clear_drafts(session_id)
    payload = BattleSessionRead.model_validate(session).model_dump(mode="json")
    manager.schedule_broadcast(session_id, {"type": "battle_update", "session": payload})


def broadcast_battle_deleted(session_id: int) -> None:
    manager.clear_drafts(session_id)
    manager.schedule_broadcast(session_id, {"type": "battle_deleted", "session_id": session_id})


async def handle_ws_message(session_id: int, member: Member, websocket: WebSocket, raw: dict) -> None:
    """확정 전 초안(draft) 편집을 같은 세션 접속자에게 그대로 중계한다.

    서버에는 저장하지 않는다 - 확정된 상태는 REST 제출 시 broadcast_battle_update로
    별도 전달되므로, 여기서는 미확정 미리보기만 중계한다.
    발신자(관리자)도 제외하지 않고 함께 받는다 - 모의전은 러너 화면이 없어 관리자가
    "관리자 조작"/"러너 화면" 탭을 같은 커넥션으로 토글하며 미리보는데, 이때 자기 자신에게
    온 echo가 없으면 미리보기가 절대 반영되지 않는다.
    """
    if not is_admin_role(member.role):
        return
    if raw.get("type") == "draft_update":
        await manager.broadcast(
            session_id,
            {
                "type": "draft_preview",
                "phase": raw.get("phase"),
                "draft": raw.get("draft"),
            },
        )
        return

    if raw.get("type") == "draft_patch":
        client_id = raw.get("client_id")
        draft_type = raw.get("draft_type")
        entity_id = raw.get("entity_id")
        patch = raw.get("patch")
        if not isinstance(client_id, str) or not client_id or len(client_id) > 120:
            return
        if draft_type not in DRAFT_PATCH_FIELDS or type(entity_id) is not int or entity_id <= 0:
            return
        if not isinstance(patch, dict) or len(patch) == 0 or len(patch) > 8:
            return
        if not set(patch).issubset(DRAFT_PATCH_FIELDS[draft_type]):
            return
        manager.apply_draft_patch(session_id, draft_type, entity_id, patch)
        await manager.broadcast(
            session_id,
            {
                "type": "draft_patch",
                "editor_id": member.id,
                "editor_client_id": client_id,
                "draft_type": draft_type,
                "entity_id": entity_id,
                "patch": patch,
            },
            staff_only=True,
        )
        return

    if raw.get("type") != "editing_state":
        return
    input_id = raw.get("input_id")
    client_id = raw.get("client_id")
    field = raw.get("field")
    active = raw.get("active")
    if not isinstance(input_id, str) or not input_id or len(input_id) > 120:
        return
    if not isinstance(client_id, str) or not client_id or len(client_id) > 120:
        return
    if field not in {"action", "target"} or not isinstance(active, bool):
        return
    await manager.broadcast(
        session_id,
        {
            "type": "editing_state",
            "editor_id": member.id,
            "editor_client_id": client_id,
            "input_id": input_id,
            "field": field,
            "active": active,
        },
        staff_only=True,
    )
