import asyncio
import unittest

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


if __name__ == "__main__":
    unittest.main()
