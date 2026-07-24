"""Entry point: `agentglass-streamdeck` (or `python -m agentglass_streamdeck`)."""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys

from . import __version__
from .app import run
from .config import load_config


def _default_config_path() -> str | None:
    base = os.environ.get("XDG_CONFIG_HOME") or os.path.expanduser("~/.config")
    for candidate in (
        os.path.join(base, "agentglass-streamdeck", "config.toml"),
        os.path.expanduser("~/.agentglass-streamdeck.toml"),
    ):
        if os.path.exists(candidate):
            return candidate
    return None


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        prog="agentglass-streamdeck",
        description="Drive the agentglass cockpit from an Elgato Stream Deck +.",
    )
    parser.add_argument("--config", help="path to a TOML config (default: "
                        "$XDG_CONFIG_HOME/agentglass-streamdeck/config.toml)")
    parser.add_argument("--server", help="override the agentglass URL")
    parser.add_argument("-v", "--verbose", action="store_true", help="debug logging")
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    env = dict(os.environ)
    if args.server:
        env["AGENTGLASS_SERVER"] = args.server
    config = load_config(path=args.config or _default_config_path(), env=env)

    log = logging.getLogger("agentglass_streamdeck")
    log.info("agentglass-streamdeck %s → %s", __version__, config.server)

    try:
        asyncio.run(run(config))
    except KeyboardInterrupt:
        return 0
    except Exception as e:  # noqa: BLE001 — top-level: report, don't traceback-spew
        log.error("%s", e)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
