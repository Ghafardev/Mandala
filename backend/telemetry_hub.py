"""One shared, non-blocking telemetry sampler.

``rocm-smi`` and NVML are synchronous calls (``subprocess.run(timeout=5)`` in the
ROCm path). Sampling them directly inside the websocket handler blocks the event
loop and repeats the work for every connected client, so a slow GPU read stalls
the same API that serves Copilot and kernel runs.

This module owns a single background task that samples through
``asyncio.to_thread``, keeps the newest frame, and fans it out to subscribers.
Clients read the same frame, so two views can never disagree.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional, Set


@dataclass(frozen=True)
class TelemetryFrame:
    payload: Dict[str, Any]
    sampled_at: float


class TelemetryHub:
    """Sample hardware once per interval and broadcast the frame to subscribers."""

    def __init__(
        self,
        sampler: Callable[[], Dict[str, Any]],
        interval_seconds: float = 1.0,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self._sampler = sampler
        self._interval = max(0.05, float(interval_seconds))
        self._clock = clock
        self._subscribers: Set[asyncio.Queue] = set()
        self._latest: Optional[TelemetryFrame] = None
        self._task: Optional[asyncio.Task] = None
        self._last_error: Optional[str] = None

    @property
    def latest(self) -> Optional[TelemetryFrame]:
        return self._latest

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)

    @property
    def interval_seconds(self) -> float:
        return self._interval

    def status(self) -> Dict[str, Any]:
        """Diagnostics for ``/api/v1/health``; never invents a reading."""
        return {
            "running": self._task is not None and not self._task.done(),
            "interval_seconds": self._interval,
            "subscribers": len(self._subscribers),
            "sampled_at": self._latest.sampled_at if self._latest else None,
            "last_error": self._last_error,
        }

    async def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run(), name="telemetry-sampler")

    async def stop(self) -> None:
        task, self._task = self._task, None
        if task is None:
            return
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        except Exception:  # pragma: no cover - task already recorded the error
            pass

    def subscribe(self) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=1)
        self._subscribers.add(queue)
        if self._latest is not None:
            queue.put_nowait(self._latest.payload)
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        self._subscribers.discard(queue)

    async def sample_once(self) -> TelemetryFrame:
        """Sample now without blocking the loop, then broadcast the frame."""
        payload = await asyncio.to_thread(self._sampler)
        frame = TelemetryFrame(payload=payload, sampled_at=self._clock())
        self._latest = frame
        self._last_error = None
        self._broadcast(payload)
        return frame

    async def _run(self) -> None:
        while True:
            try:
                await self.sample_once()
            except asyncio.CancelledError:
                raise
            except Exception as error:  # pragma: no cover - defensive
                self._last_error = str(error)
            await asyncio.sleep(self._interval)

    def _broadcast(self, payload: Dict[str, Any]) -> None:
        for queue in list(self._subscribers):
            if queue.full():
                # A slow client only needs the newest frame, not a backlog.
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            try:
                queue.put_nowait(payload)
            except asyncio.QueueFull:  # pragma: no cover - raced with a producer
                pass
