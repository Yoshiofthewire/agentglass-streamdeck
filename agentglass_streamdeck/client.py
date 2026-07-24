"""Transport to agentglass: REST reads/writes and the live /stream socket.

REST uses the standard library (urllib) run off the event loop in a thread, so
the only third-party runtime dependency here is `websockets` for the stream.
Auth mirrors agentglass's own client: a bearer header on REST, `?token=` on the
socket (a browser can't set a header on a WS upgrade, and the daemon follows the
same rule). Everything is failure-tolerant — a down server yields None / a
dropped socket, never a crash — because the deck must keep drawing regardless.
"""

from __future__ import annotations

import asyncio
import json
import logging
import urllib.error
import urllib.request

from .config import Config

log = logging.getLogger(__name__)


class AgentglassClient:
    def __init__(self, config: Config):
        self.cfg = config
        self._base = config.server.rstrip("/")

    # --- REST ---------------------------------------------------------------

    def _headers(self) -> dict:
        h = {"content-type": "application/json"}
        if self.cfg.token:
            h["authorization"] = f"Bearer {self.cfg.token}"
        return h

    def _request_sync(self, method: str, path: str, body=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self._base + path, data=data, method=method,
                                     headers=self._headers())
        with urllib.request.urlopen(req, timeout=5) as resp:
            raw = resp.read()
        return json.loads(raw) if raw else {}

    async def request(self, method: str, path: str, body=None):
        """Return the decoded JSON, or None on any transport/parse failure."""
        try:
            return await asyncio.to_thread(self._request_sync, method, path, body)
        except (urllib.error.URLError, OSError, ValueError) as e:
            log.debug("request %s %s failed: %s", method, path, e)
            return None

    async def get(self, path: str):
        return await self.request("GET", path)

    async def pending_gates(self) -> list:
        data = await self.get("/gate/pending")
        return (data or {}).get("gates", []) if isinstance(data, dict) else []

    # --- live socket --------------------------------------------------------

    def _ws_url(self) -> str:
        base = self._base
        if base.startswith("https://"):
            base = "wss://" + base[len("https://"):]
        elif base.startswith("http://"):
            base = "ws://" + base[len("http://"):]
        url = base + "/stream"
        if self.cfg.token:
            url += f"?token={self.cfg.token}"
        return url

    async def stream(self, on_frame, on_connected):
        """Consume /stream forever, reconnecting with capped backoff.

        `on_frame(frame_dict)` for each frame; `on_connected(bool)` on every
        open/close so the deck can show a live-vs-stale badge.
        """
        import websockets  # imported here so the pure logic never needs it

        backoff = 0.5
        while True:
            try:
                async with websockets.connect(self._ws_url(), max_size=None,
                                               open_timeout=5) as ws:
                    on_connected(True)
                    backoff = 0.5
                    async for msg in ws:
                        try:
                            frame = json.loads(msg)
                        except (ValueError, TypeError):
                            continue
                        on_frame(frame)
            except asyncio.CancelledError:
                raise
            except Exception as e:  # noqa: BLE001 — any failure means retry
                log.debug("stream disconnected: %s", e)
            on_connected(False)
            await asyncio.sleep(backoff)
            backoff = min(8.0, backoff * 2)
