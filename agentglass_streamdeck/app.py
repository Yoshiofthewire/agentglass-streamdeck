"""The async controller: turn deck input into agentglass calls, and agentglass
state into deck pixels.

Four tasks run together — draining the input queue, polling the approval queue,
consuming the live socket, and dimming the deck when nothing is happening. The
decisions they make are all delegated to the tested pure modules (`layout`,
`dispatch`, `state`, `view`); this file is the wiring that holds them next to the
hardware and the network.
"""

from __future__ import annotations

import asyncio
import logging
import time

from .client import AgentglassClient
from .config import Config
from .deck import DeckSurface
from .dispatch import plan_request
from .layout import dial_action, key_action
from .state import DeckState, select_gate, set_connected, set_gates

log = logging.getLogger(__name__)


class Controller:
    def __init__(self, config: Config, deck: DeckSurface | None = None,
                 client: AgentglassClient | None = None):
        self.cfg = config
        self.client = client or AgentglassClient(config)
        self.deck = deck or DeckSurface()
        self.state = DeckState()
        self.brightness = config.brightness
        self._last_activity = time.monotonic()
        self._dimmed = False
        self._actions: asyncio.Queue = asyncio.Queue()
        self._loop: asyncio.AbstractEventLoop | None = None

    async def run(self):
        self._loop = asyncio.get_running_loop()
        self.deck.open()
        self.deck.set_brightness(self.brightness)
        self.deck.set_handlers(self._on_key, self._on_dial)
        self._repaint()
        try:
            await asyncio.gather(
                self._input_loop(),
                self._poll_loop(),
                self._stream_loop(),
                self._idle_loop(),
            )
        finally:
            self.deck.close()

    # --- deck callbacks (run on the library's HID thread) -------------------

    def _enqueue(self, action):
        if self._loop is not None:
            self._loop.call_soon_threadsafe(self._actions.put_nowait, action)

    def _on_key(self, index: int):
        self._enqueue(key_action(index))

    def _on_dial(self, index: int, event: str, value: int):
        self._enqueue(dial_action(index, event, value))

    # --- painting + wake ----------------------------------------------------

    def _repaint(self):
        try:
            self.deck.paint(self.state)
        except Exception as e:  # noqa: BLE001 — a paint glitch must not kill the loop
            log.debug("paint failed: %s", e)

    def _wake(self):
        self._last_activity = time.monotonic()
        if self._dimmed:
            self._dimmed = False
            self.deck.set_brightness(self.brightness)

    # --- tasks --------------------------------------------------------------

    async def _input_loop(self):
        while True:
            action = await self._actions.get()
            self._wake()
            await self._handle(action)

    async def _handle(self, action):
        k = action.kind
        if k == "gate_select":
            self.state = select_gate(self.state, action.arg)
            self._repaint()
            return
        if k == "brightness":
            self.brightness = max(0, min(100, self.brightness + action.arg * 10))
            self.deck.set_brightness(self.brightness)
            return
        if k == "noop":
            return

        plan = plan_request(action, self.state)
        if plan is None:
            return
        method, path, body = plan
        await self.client.request(method, path, body)
        if k in ("approve", "deny"):
            # The queue just changed; re-read so the deck reflects it at once
            # rather than waiting out the poll interval.
            await self._refresh_gates()

    async def _refresh_gates(self):
        gates = await self.client.pending_gates()
        had = len(self.state.gates)
        self.state = set_gates(self.state, gates)
        if self.state.gates and (self._dimmed or len(self.state.gates) > had):
            self._wake()  # a new approval is exactly when to light back up
        self._repaint()

    async def _poll_loop(self):
        while True:
            await self._refresh_gates()
            await asyncio.sleep(self.cfg.poll_interval)

    async def _stream_loop(self):
        # on_frame / on_conn run inside the event loop (within the socket
        # coroutine), so they can touch state directly.
        def on_frame(frame):
            if frame.get("type") in ("event", "initial"):
                self._wake()

        def on_conn(connected):
            self.state = set_connected(self.state, connected)
            self._repaint()

        await self.client.stream(on_frame, on_conn)

    async def _idle_loop(self):
        while True:
            await asyncio.sleep(2.0)
            if self._dimmed:
                continue
            idle = time.monotonic() - self._last_activity
            if idle >= self.cfg.idle_after and not self.state.gates:
                self._dimmed = True
                self.deck.set_brightness(self.cfg.idle_brightness)


async def run(config: Config):
    await Controller(config).run()
