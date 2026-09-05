import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

from app import ws
from app.ws import BattleConnectionManager


class FakeWebSocket:
    def __init__(self, started: list["FakeWebSocket"], release: asyncio.Event, *, fail: bool = False):
        self.started = started
        self.release = release
        self.fail = fail

    async def send_json(self, _message: dict) -> None:
        self.started.append(self)
        await self.release.wait()
        if self.fail:
            raise RuntimeError("disconnected")


class SnapshotWebSocket:
    def __init__(self):
        self.messages: list[dict] = []

    async def accept(self) -> None:
        pass

    async def send_json(self, message: dict) -> None:
        self.messages.append(message)


class BattleWebSocketTest(unittest.IsolatedAsyncioTestCase):
    async def test_broadcasts_in_parallel_and_removes_dead_connections(self):
        manager = BattleConnectionManager()
        started: list[FakeWebSocket] = []
        release = asyncio.Event()
        alive = FakeWebSocket(started, release)
        dead = FakeWebSocket(started, release, fail=True)
        manager._rooms[1] = {alive, dead}  # 연결 수명주기와 무관하게 전송 동작만 검증한다.

        task = asyncio.create_task(manager.broadcast(1, {"type": "test"}))
        for _ in range(10):
            await asyncio.sleep(0)
            if len(started) == 2:
                break
        self.assertCountEqual(started, [alive, dead])
        release.set()
        await task

        self.assertEqual(manager._rooms[1], {alive})

    async def test_staff_only_broadcast_excludes_runner_connections(self):
        manager = BattleConnectionManager()
        started: list[FakeWebSocket] = []
        release = asyncio.Event()
        staff = FakeWebSocket(started, release)
        runner = FakeWebSocket(started, release)
        manager._rooms[1] = {staff, runner}
        manager._staff_rooms[1] = {staff}

        task = asyncio.create_task(manager.broadcast(1, {"type": "editing_state"}, staff_only=True))
        for _ in range(10):
            await asyncio.sleep(0)
            if started:
                break
        self.assertEqual(started, [staff])
        release.set()
        await task

    async def test_draft_patch_is_shared_only_with_staff(self):
        original_manager = ws.manager
        mock_manager = SimpleNamespace(apply_draft_patch=Mock(), broadcast=AsyncMock())
        ws.manager = mock_manager
        try:
            await ws.handle_ws_message(
                1,
                SimpleNamespace(id=7, role="STAFF"),
                SimpleNamespace(),
                {
                    "type": "draft_patch",
                    "client_id": "browser-tab-a",
                    "draft_type": "character",
                    "entity_id": 12,
                    "patch": {"target_enemy_id": 3},
                },
            )
        finally:
            ws.manager = original_manager

        mock_manager.broadcast.assert_awaited_once_with(
            1,
            {
                "type": "draft_patch",
                "editor_id": 7,
                "editor_client_id": "browser-tab-a",
                "draft_type": "character",
                "entity_id": 12,
                "patch": {"target_enemy_id": 3},
            },
            staff_only=True,
        )
        mock_manager.apply_draft_patch.assert_called_once_with(1, "character", 12, {"target_enemy_id": 3})

    async def test_draft_patch_drops_unknown_fields(self):
        original_manager = ws.manager
        mock_manager = SimpleNamespace(apply_draft_patch=Mock(), broadcast=AsyncMock())
        ws.manager = mock_manager
        try:
            await ws.handle_ws_message(
                1,
                SimpleNamespace(id=7, role="ADMIN"),
                SimpleNamespace(),
                {
                    "type": "draft_patch",
                    "client_id": "browser-tab-a",
                    "draft_type": "enemy",
                    "entity_id": 2,
                    "patch": {"unknown": "value"},
                },
            )
        finally:
            ws.manager = original_manager

        mock_manager.broadcast.assert_not_awaited()
        mock_manager.apply_draft_patch.assert_not_called()

    async def test_staff_connection_receives_saved_draft_snapshot(self):
        manager = BattleConnectionManager()
        manager.apply_draft_patch(1, "character", 12, {"target_enemy_id": 3})
        websocket = SnapshotWebSocket()

        await manager.connect(1, websocket, is_staff=True)

        self.assertEqual(websocket.messages, [{
            "type": "draft_snapshot",
            "draft": {"character": {"12": {"target_enemy_id": 3}}},
        }])

    def test_clear_drafts_removes_saved_snapshot(self):
        manager = BattleConnectionManager()
        manager.apply_draft_patch(1, "enemy", 2, {"skill_index": 0})

        manager.clear_drafts(1)

        self.assertEqual(manager.draft_snapshot(1), {})


if __name__ == "__main__":
    unittest.main()
