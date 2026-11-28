"""Tests for the single shared, non-blocking telemetry sampler."""

from __future__ import annotations

import asyncio
import threading
import time

from backend.telemetry_hub import TelemetryHub


def test_one_sample_is_shared_by_every_subscriber() -> None:
    async def scenario() -> None:
        calls: list[int] = []
        threads: list[str] = []

        def sampler() -> dict:
            calls.append(1)
            threads.append(threading.current_thread().name)
            return {"backend": "none", "gpus": [], "cpu": {}}

        hub = TelemetryHub(sampler, interval_seconds=60.0)
        await hub.start()
        first_queue = hub.subscribe()
        second_queue = hub.subscribe()

        first = await asyncio.wait_for(first_queue.get(), timeout=2)
        second = await asyncio.wait_for(second_queue.get(), timeout=2)
        await hub.stop()

        # Both clients read the same frame, sampled exactly once.
        assert first == second
        assert len(calls) == 1
        # The blocking hardware read happened off the event loop thread.
        assert threads and threads[0] != threading.current_thread().name

    asyncio.run(scenario())


def test_blocking_sampler_does_not_block_the_event_loop() -> None:
    async def scenario() -> None:
        def sampler() -> dict:
            time.sleep(0.4)
            return {"backend": "none", "gpus": []}

        hub = TelemetryHub(sampler, interval_seconds=60.0)
        await hub.start()

        ticks = 0
        started = time.perf_counter()
        for _ in range(10):
            ticks += 1
            await asyncio.sleep(0.01)
        elapsed = time.perf_counter() - started
        await hub.stop()

        assert ticks == 10
        # A blocking sample would hold the loop for the whole 0.4 s sleep.
        assert elapsed < 0.3

    asyncio.run(scenario())


def test_slow_subscriber_only_keeps_the_newest_frame() -> None:
    async def scenario() -> None:
        hub = TelemetryHub(lambda: {"gpus": []}, interval_seconds=60.0)
        queue = hub.subscribe()

        hub._broadcast({"frame": 1})  # noqa: SLF001 - exercising the fan-out directly
        hub._broadcast({"frame": 2})  # noqa: SLF001

        assert await asyncio.wait_for(queue.get(), timeout=1) == {"frame": 2}
        assert queue.empty()

    asyncio.run(scenario())


def test_unsubscribe_and_stop_are_safe_to_repeat() -> None:
    async def scenario() -> None:
        hub = TelemetryHub(lambda: {"gpus": []}, interval_seconds=60.0)
        await hub.start()
        queue = hub.subscribe()
        assert hub.subscriber_count == 1

        hub.unsubscribe(queue)
        hub.unsubscribe(queue)
        assert hub.subscriber_count == 0

        await hub.stop()
        await hub.stop()
        assert hub.status()["running"] is False

    asyncio.run(scenario())
