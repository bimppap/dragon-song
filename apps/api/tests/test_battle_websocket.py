import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

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


def battle_session(version="2026-09-08T12:00:00+09:00", **changes):
    return {"id": 1, "updated_at": version, "status": "in_progress", "phase": "ally", **changes}


class BattleWebSocketTest(unittest.IsolatedAsyncioTestCase):
    async def test_ordered_enemy_actions_sync_and_restore_for_staff(self):
        manager = BattleConnectionManager()
        session = battle_session(phase="telegraph", enemies=[{"enemy_id": 3, "action_count": 2}])
        manager.remember_session(1, session)
        staff = SnapshotWebSocket()
        await manager.connect(1, staff, is_staff=True, session=session)
        actions = [
            {"kind": "attack", "skill_index": 2, "target_character_ids": [12]},
            {"kind": "summon", "skill_index": 0, "target_character_ids": []},
        ]
        message = {"type": "draft_patch", "version": session["updated_at"], "client_id": "tab-a",
                   "draft_type": "enemy", "entity_id": 3, "patch": {"actions": actions}}
        with patch.object(ws, "manager", manager):
            await ws.handle_ws_message(1, SimpleNamespace(id=7, role="ADMIN"), staff, message)
            self.assertEqual(staff.messages[-1]["patch"]["actions"], actions)
            reconnected = SnapshotWebSocket()
            await manager.connect(1, reconnected, is_staff=True, session=session)
            self.assertEqual(reconnected.messages[-1]["draft"]["enemy"]["3"]["actions"], actions)
            for invalid in [actions[:1], [*actions, actions[0]], [None, actions[0]], [{**actions[0], "target_character_ids": "bad"}, actions[1]]]:
                before = len(staff.messages)
                await ws.handle_ws_message(1, SimpleNamespace(id=7, role="ADMIN"), staff, {**message, "patch": {"actions": invalid}})
                self.assertEqual(len(staff.messages), before)
            self.assertEqual(manager.session_message(1, is_staff=True)["draft"]["enemy"]["3"]["actions"], actions)

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
        mock_manager = SimpleNamespace(accepts_draft=Mock(return_value=True), apply_draft_patch=Mock(), broadcast=AsyncMock())
        ws.manager = mock_manager
        try:
            await ws.handle_ws_message(
                1,
                SimpleNamespace(id=7, role="STAFF"),
                SimpleNamespace(),
                {
                    "type": "draft_patch",
                    "version": battle_session()["updated_at"],
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
                "version": battle_session()["updated_at"],
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
        mock_manager = SimpleNamespace(accepts_draft=Mock(return_value=True), apply_draft_patch=Mock(), broadcast=AsyncMock())
        ws.manager = mock_manager
        try:
            await ws.handle_ws_message(
                1,
                SimpleNamespace(id=7, role="ADMIN"),
                SimpleNamespace(),
                {
                    "type": "draft_patch",
                    "version": battle_session()["updated_at"],
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
        session = battle_session()
        manager.remember_session(1, session)
        manager.apply_draft_patch(1, "character", 12, {"target_enemy_id": 3})
        websocket = SnapshotWebSocket()

        await manager.connect(1, websocket, is_staff=True, session=session)

        self.assertEqual(websocket.messages, [{
            "type": "battle_update",
            "session": session,
            "preview": None,
            "draft": {"character": {"12": {"target_enemy_id": 3}}},
        }])

    def test_clear_drafts_removes_saved_snapshot(self):
        manager = BattleConnectionManager()
        manager.apply_draft_patch(1, "enemy", 2, {"skill_index": 0})

        manager.clear_drafts(1)

        self.assertEqual(manager.draft_snapshot(1), {})


    async def test_runner_reconnect_receives_preview_without_another_edit(self):
        manager = BattleConnectionManager()
        session = battle_session()
        manager.remember_session(1, session)
        manager.apply_draft_patch(1, "character", 12, {"kind": "heal", "target_character_id": 13})
        preview = {"12": {"kind": "heal", "target_names": ["ally"]}}
        manager.apply_preview(1, preview, {"12": {"kind": "heal", "target_character_id": 13}})
        first = SnapshotWebSocket()
        await manager.connect(1, first, is_staff=False, session=session)
        manager.disconnect(1, first)
        reconnected = SnapshotWebSocket()

        await manager.connect(1, reconnected, is_staff=False, session=session)

        self.assertEqual(first.messages, reconnected.messages)
        self.assertEqual(reconnected.messages, [{"type": "battle_update", "session": session, "preview": preview}])
        self.assertNotIn("draft", reconnected.messages[0])

    async def test_turn_update_clears_drafts_for_every_operator_and_runner(self):
        manager = BattleConnectionManager()
        old = battle_session()
        operators = [SnapshotWebSocket(), SnapshotWebSocket()]
        runner = SnapshotWebSocket()
        for operator in operators:
            await manager.connect(1, operator, is_staff=True, session=old)
        await manager.connect(1, runner, is_staff=False, session=old)
        manager.apply_draft_patch(1, "character", 12, {"kind": "heal"})
        manager.apply_preview(1, {"12": {"kind": "heal"}}, {"12": {"kind": "heal"}})
        updated = battle_session("2026-09-08T12:01:00+09:00", phase="enemy")

        await manager.publish_session_message(1, {"type": "battle_update", "session": updated})

        for operator in operators:
            self.assertEqual(len(operator.messages), 2)
            self.assertEqual(operator.messages[-1], {
                "type": "battle_update", "session": updated, "preview": None, "draft": {},
            })
        self.assertEqual(runner.messages[-1], {"type": "battle_update", "session": updated, "preview": None})
        self.assertEqual(manager.draft_snapshot(1), {})

    async def test_late_messages_from_previous_turn_are_ignored(self):
        manager = BattleConnectionManager()
        manager.remember_session(1, battle_session("2026-09-08T12:01:00+09:00"))
        manager.broadcast = AsyncMock()
        with patch.object(ws, "manager", manager):
            for message in [
                {"type": "draft_patch", "client_id": "old-tab", "draft_type": "character", "entity_id": 12, "patch": {"kind": "heal"}},
                {"type": "draft_update", "draft": {"12": {"kind": "heal"}}, "sources": {"12": {"kind": "heal"}}},
            ]:
                await ws.handle_ws_message(1, SimpleNamespace(id=7, role="STAFF"), SnapshotWebSocket(), {
                    **message, "version": battle_session()["updated_at"],
                })
        manager.broadcast.assert_not_awaited()
        self.assertEqual(manager.draft_snapshot(1), {})
        self.assertIsNone(manager.session_message(1)["preview"])

    async def test_stale_operator_preview_cannot_replace_latest_action_or_target(self):
        manager = BattleConnectionManager()
        session = battle_session()
        manager.remember_session(1, session)
        manager.apply_draft_patch(1, "character", 12, {"kind": "heal", "target_character_id": 13})
        current = {"12": {"kind": "heal", "target_names": ["new target"]}}
        manager.apply_preview(1, current, {"12": {"kind": "heal", "target_character_id": 13}})
        manager.broadcast = AsyncMock()
        with patch.object(ws, "manager", manager):
            for source in [{"kind": "attack"}, {"kind": "heal", "target_character_id": 12}]:
                await ws.handle_ws_message(1, SimpleNamespace(id=7, role="ADMIN"), SnapshotWebSocket(), {
                    "type": "draft_update", "version": session["updated_at"],
                    "draft": {"12": {"kind": "attack", "target_names": ["old target"]}},
                    "sources": {"12": source},
                })
        manager.broadcast.assert_not_awaited()
        self.assertEqual(manager.session_message(1)["preview"], current)

    async def test_same_version_reconnect_and_delayed_update_preserve_new_edits(self):
        manager = BattleConnectionManager()
        session = battle_session("2026-09-08T12:01:00+09:00")
        manager.remember_session(1, session)
        manager.apply_draft_patch(1, "character", 12, {"kind": "none"})
        manager.apply_preview(1, {"12": {"kind": "none"}}, {"12": {"kind": "none"}})
        operator = SnapshotWebSocket()
        await manager.connect(1, operator, is_staff=True, session=battle_session())
        await manager.publish_session_message(1, {"type": "battle_update", "session": session})
        self.assertEqual(operator.messages[0], operator.messages[1])
        self.assertEqual(operator.messages[0]["session"], session)
        self.assertEqual(operator.messages[0]["draft"]["character"]["12"]["kind"], "none")
        self.assertEqual(operator.messages[0]["preview"]["12"]["kind"], "none")

    def test_preview_merges_characters_and_skips_identical_broadcasts(self):
        manager = BattleConnectionManager()
        manager.remember_session(1, battle_session())
        first = {"12": {"kind": "attack"}}
        second = {"13": {"kind": "heal"}}
        manager.apply_preview(1, first, first)
        self.assertEqual(manager.apply_preview(1, second, second), {**first, **second})
        self.assertIsNone(manager.apply_preview(1, second, second))

    async def test_deleted_battle_removes_all_cached_state(self):
        manager = BattleConnectionManager()
        manager.remember_session(1, battle_session())
        manager.apply_draft_patch(1, "character", 12, {"kind": "none"})
        manager.apply_preview(1, {"12": {"kind": "none"}}, {"12": {"kind": "none"}})
        await manager.publish_session_message(1, {"type": "battle_deleted", "session_id": 1})
        self.assertEqual(manager._sessions, {})
        self.assertEqual(manager._previews, {})
        self.assertEqual(manager.draft_snapshot(1), {})


if __name__ == "__main__":
    unittest.main()
