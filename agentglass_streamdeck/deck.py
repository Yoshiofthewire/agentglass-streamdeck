"""The Stream Deck + itself: open it, paint it, read its keys and dials.

This is the one module that touches `StreamDeck` and the hardware, so it is kept
thin — it converts the library's callbacks into plain (index / event) tuples and
turns a DeckState into pixels via `view` + `render`. Everything with logic worth
testing lives in the pure modules it calls; this only has to be correct against
the device, which is confirmed by running it, not by a unit test.
"""

from __future__ import annotations

import logging

from . import render, view

log = logging.getLogger(__name__)


class NoDeckError(RuntimeError):
    pass


class DeckSurface:
    """Adapter around one StreamDeck +. Construct, `open()`, then `paint()`."""

    def __init__(self):
        self.deck = None
        self._key_size = (120, 120)
        self._touch_size = (800, 100)
        self._on_key = None       # callable(index:int) on press
        self._on_dial = None      # callable(index:int, event:str, value:int)

    # --- lifecycle ----------------------------------------------------------

    def open(self):
        from StreamDeck.DeviceManager import DeviceManager

        decks = DeviceManager().enumerate()
        for d in decks:
            if getattr(d, "dial_count", lambda: 0)() >= 4:
                self.deck = d
                break
        if self.deck is None:
            raise NoDeckError(
                "no Stream Deck + found (a deck with dials). Plugged in? "
                "udev rule installed? See README."
            )

        self.deck.open()
        self.deck.reset()
        fmt = self.deck.key_image_format()
        self._key_size = fmt["size"]
        try:
            self._touch_size = self.deck.touchscreen_image_format()["size"]
        except Exception:  # noqa: BLE001 — some firmwares differ; fall back
            self._touch_size = (800, 100)
        return self

    def set_brightness(self, pct: int):
        if self.deck is not None:
            self.deck.set_brightness(max(0, min(100, int(pct))))

    def close(self):
        if self.deck is not None:
            try:
                self.deck.reset()
                self.deck.close()
            except Exception:  # noqa: BLE001
                pass

    # --- output -------------------------------------------------------------

    def paint(self, state):
        if self.deck is None:
            return
        from StreamDeck.ImageHelpers import PILHelper

        for i, spec in enumerate(view.key_specs(state)):
            img = render.key_image(self._key_size, spec["title"], spec["subtitle"],
                                   spec["accent"], spec["emphasis"])
            self.deck.set_key_image(i, PILHelper.to_native_key_format(self.deck, img))

        try:
            cells = view.touch_cells(state)
            timg = render.touchscreen_image(self._touch_size, cells)
            native = PILHelper.to_native_touchscreen_format(self.deck, timg)
            w, h = self._touch_size
            self.deck.set_touchscreen_image(native, 0, 0, w, h)
        except Exception as e:  # noqa: BLE001 — no touch strip is not fatal
            log.debug("touchscreen paint skipped: %s", e)

    # --- input --------------------------------------------------------------

    def set_handlers(self, on_key, on_dial):
        self._on_key = on_key
        self._on_dial = on_dial
        self.deck.set_key_callback(self._key_cb)
        try:
            self.deck.set_dial_callback(self._dial_cb)
        except Exception as e:  # noqa: BLE001
            log.warning("this deck exposes no dials: %s", e)

    def _key_cb(self, deck, key, pressed):
        if pressed and self._on_key:
            self._on_key(key)

    def _dial_cb(self, deck, dial, event, value):
        if not self._on_dial:
            return
        from StreamDeck.Devices.StreamDeckPlus import StreamDeckPlus

        if event == StreamDeckPlus.DialEventType.PUSH:
            if value:  # press down only
                self._on_dial(dial, "push", 0)
        elif event == StreamDeckPlus.DialEventType.TURN:
            self._on_dial(dial, "turn", int(value))
