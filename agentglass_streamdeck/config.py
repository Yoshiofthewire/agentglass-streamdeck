"""Load the daemon's configuration: defaults, an optional TOML file, then env.

Precedence is env > file > default, so a token exported in the shell wins over a
stale one on disk. Only the standard library is used, so this stays covered by
the test suite with nothing installed.
"""

from __future__ import annotations

import os
import tomllib
from dataclasses import dataclass, fields
from typing import Mapping


@dataclass
class Config:
    server: str = "http://127.0.0.1:4000"
    token: str | None = None
    brightness: int = 60
    poll_interval: float = 2.0
    idle_brightness: int = 15
    idle_after: float = 90.0


def _clamp(v: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, v))


def load_config(path: str | os.PathLike | None = None,
                env: Mapping[str, str] | None = None) -> Config:
    if env is None:
        env = os.environ

    values: dict = {}

    if path is not None and os.path.exists(path):
        with open(path, "rb") as f:
            data = tomllib.load(f)
        known = {f.name for f in fields(Config)}
        # Take only the keys we know; an unrecognised one in the file is a typo,
        # not a reason to crash the daemon on start.
        values.update({k: v for k, v in data.items() if k in known})

    if "AGENTGLASS_SERVER" in env:
        values["server"] = env["AGENTGLASS_SERVER"]
    if "AGENTGLASS_TOKEN" in env:
        values["token"] = env["AGENTGLASS_TOKEN"]

    cfg = Config(**values)
    cfg.brightness = _clamp(int(cfg.brightness), 0, 100)
    cfg.idle_brightness = _clamp(int(cfg.idle_brightness), 0, 100)
    cfg.poll_interval = float(cfg.poll_interval)
    cfg.idle_after = float(cfg.idle_after)
    return cfg
