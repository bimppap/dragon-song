import asyncio

from fastapi import WebSocket

from app.auth import is_admin_role
from app.models import Member
from app.schemas import BattleSessionRead

SEND_TIMEOUT_SECONDS = 3.0


class BattleConnectionManager:
    """세션별 WebSocket 커넥션을 메모리에 보관하고 브로드캐스트한다.

    단일 프로세스(단일 uvicorn 워커) 배포를 전제로 한다. 워커를 여러 개로
    늘리면 프로세스마다 별도의 매니저 인스턴스가 생겨 브로드캐스트가
    다른 워커에 붙은 커넥션까지 전달되지 않으므로, 그 경우 Redis pub/sub
    등으로 교체해야 한다.
    """

    def __init__(self) -> None:
        self._rooms: dict[int, set[WebSocket]] = {}
        self._loop: asyncio.AbstractEventLoop | None = None

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    async def connect(self, session_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        self._rooms.setdefault(session_id, set()).add(websocket)

    def disconnect(self, session_id: int, websocket: WebSocket) -> None:
        room = self._rooms.get(session_id)
        if room is None:
            return
        room.discard(websocket)
        if not room:
            self._rooms.pop(session_id, None)

    async def broadcast(
        self,
        session_id: int,
        message: dict,
        *,
        exclude: WebSocket | None = None,
    ) -> None:
        room = self._rooms.get(session_id)
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
    payload = BattleSessionRead.model_validate(session).model_dump(mode="json")
    manager.schedule_broadcast(session_id, {"type": "battle_update", "session": payload})


def broadcast_battle_deleted(session_id: int) -> None:
    manager.schedule_broadcast(session_id, {"type": "battle_deleted", "session_id": session_id})


async def handle_ws_message(session_id: int, member: Member, websocket: WebSocket, raw: dict) -> None:
    """확정 전 초안(draft) 편집을 같은 세션 접속자에게 그대로 중계한다.

    서버에는 저장하지 않는다 - 확정된 상태는 REST 제출 시 broadcast_battle_update로
    별도 전달되므로, 여기서는 미확정 미리보기만 중계한다.
    발신자(관리자)도 제외하지 않고 함께 받는다 - 모의전은 러너 화면이 없어 관리자가
    "관리자 조작"/"러너 화면" 탭을 같은 커넥션으로 토글하며 미리보는데, 이때 자기 자신에게
    온 echo가 없으면 미리보기가 절대 반영되지 않는다.
    """
    if raw.get("type") != "draft_update" or not is_admin_role(member.role):
        return
    await manager.broadcast(
        session_id,
        {
            "type": "draft_preview",
            "phase": raw.get("phase"),
            "draft": raw.get("draft"),
        },
    )
