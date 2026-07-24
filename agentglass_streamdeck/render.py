"""Compose the images the deck shows: the 8 keys and the touch strip.

Kept free of any deck object — these take a size and return a PIL image, so they
can be exercised in the test suite and the hardware layer only has to convert
the result to the panel's native format. Deliberately plain: a title, an
optional value/badge, and an accent bar, legible on a 120px key and a 100px-tall
strip, themed by the caller rather than hard-coding agentglass's palette here.
"""

from __future__ import annotations

from functools import lru_cache

from PIL import Image, ImageDraw, ImageFont

BG = (17, 17, 20)
FG = (233, 233, 240)
MUTED = (140, 140, 150)
ACCENT = (167, 139, 250)  # agentglass midnight-purple primary


@lru_cache(maxsize=16)
def _font(size: int):
    for path in (
        "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _centered(draw: ImageDraw.ImageDraw, xy, text, font, fill):
    cx, cy = xy
    l, t, r, b = draw.textbbox((0, 0), text, font=font)
    draw.text((cx - (r - l) / 2 - l, cy - (b - t) / 2 - t), text, font=font, fill=fill)


def key_image(size, title, subtitle="", accent=ACCENT, emphasis=False, bg=BG):
    """One key: a title, an optional subtitle/badge, and a top accent bar.

    `emphasis` fills the key with the accent (used for a pending approval that
    wants the eye) and flips the text to dark for contrast.
    """
    w, h = size
    fill_bg = accent if emphasis else bg
    img = Image.new("RGB", size, fill_bg)
    d = ImageDraw.Draw(img)

    if not emphasis:
        d.rectangle([0, 0, w, max(3, h // 20)], fill=accent)

    title_fg = (10, 10, 12) if emphasis else FG
    sub_fg = (10, 10, 12) if emphasis else MUTED

    if subtitle:
        _centered(d, (w / 2, h * 0.40), title, _font(max(11, h // 7)), title_fg)
        _centered(d, (w / 2, h * 0.70), subtitle, _font(max(13, h // 5)), sub_fg)
    else:
        _centered(d, (w / 2, h / 2), title, _font(max(12, h // 6)), title_fg)

    return img


def touchscreen_image(size, cells, bg=BG):
    """The strip above the dials, split into one zone per dial.

    Each cell is `{"title": str, "value": str, "accent"?: rgb}`. Missing cells
    leave their zone blank rather than shifting the others, so a zone always
    sits above the dial it describes.
    """
    w, h = size
    img = Image.new("RGB", size, bg)
    d = ImageDraw.Draw(img)

    zones = 4
    zw = w / zones
    for i in range(zones):
        x0 = zw * i
        if i:
            d.line([(x0, h * 0.2), (x0, h * 0.8)], fill=(40, 40, 46), width=1)
        if i >= len(cells) or not cells[i]:
            continue
        cell = cells[i]
        accent = cell.get("accent", ACCENT)
        cx = x0 + zw / 2
        _centered(d, (cx, h * 0.32), str(cell.get("title", "")), _font(max(12, h // 6)), MUTED)
        _centered(d, (cx, h * 0.66), str(cell.get("value", "")), _font(max(16, h // 4)), accent)

    return img
