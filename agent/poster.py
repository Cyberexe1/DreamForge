"""Typographic poster generator — the visual fallback when no image model is reachable.

Writes SVG directly as text, so the agent keeps zero third-party dependencies.
No Pillow, no font file to bundle, no arm64 wheel to get wrong. Output is ~2.5KB
instead of ~1.4MB and stays crisp at any size.

Honesty note: this is a composed typographic poster, not a diffusion image. The
capsule records `meta.image_kind = "poster"` so the UI and the article can say so
plainly. The design decisions are still the agent's — palette, layout and type
scale all derive from the mood it chose in `decide`.

Constraint worth knowing: an SVG loaded through <img> is sandboxed and cannot
fetch external fonts, so only web-safe families are used.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import date as _date

# Landscape. web/src/lib/poster.ts mirrors this ratio so the UI reserves the
# right box — a typographic poster cropped by object-cover loses words.
WIDTH = 1382
HEIGHT = 896
MARGIN = 88

CONTENT_WIDTH = WIDTH - MARGIN * 2

# Georgia averages a little over half the font size per character. Used to derive
# wrap budgets, since SVG has no automatic line breaking.
_SERIF_CHAR_RATIO = 0.52


@dataclass(frozen=True)
class Palette:
    top: str
    bottom: str
    accent: str
    text: str
    muted: str


# Matched by keyword because the agent invents its own mood strings rather than
# picking from a list.
_PALETTES: tuple[tuple[tuple[str, ...], Palette], ...] = (
    (
        ("melanchol", "wistful", "solemn", "somber", "grief", "nostalg", "reflective"),
        Palette("#1b2140", "#0a0c16", "#8fa2cc", "#f2f4fa", "#8e97b4"),
    ),
    (
        ("playful", "bright", "joy", "warm", "hopeful", "renewal"),
        Palette("#40200e", "#150a09", "#eaa544", "#fdf6ec", "#bd9a72"),
    ),
    (
        ("weary", "tired", "grey", "gray", "mundane", "observational"),
        Palette("#242830", "#0d0e12", "#9fa8b4", "#f1f3f6", "#8b939e"),
    ),
    (
        ("tense", "restless", "urgent", "storm", "anger"),
        Palette("#2f1222", "#100a13", "#dc6d8e", "#fbeff3", "#ad7d8c"),
    ),
    (
        ("serene", "calm", "still", "tender", "quiet"),
        Palette("#0f2c30", "#061012", "#71c3b8", "#eff9f8", "#7fa6a3"),
    ),
)

_FALLBACK_PALETTE = _PALETTES[0][1]

# Type scale. Tuned for the landscape canvas: wide enough for a long theme on one
# or two lines, short enough that three blocks still fit vertically.
_THEME_SIZE = 62
_THEME_LINE_H = 74
_THEME_MAX_LINES = 2
_TITLE_SIZE = 29
_TITLE_LINE_H = 40
_QUOTE_SIZE = 25
_QUOTE_LINE_H = 36


def render(
    *,
    theme: str,
    title: str,
    quote: str,
    date: str,
    weekday: str,
    season: str,
    location: str,
    mood: str,
) -> bytes:
    """Compose the poster. Returns UTF-8 encoded SVG."""
    palette = _palette_for(mood)
    seed = _seed(f"{date}|{theme}")
    # Layout rotates by calendar day rather than by hash. A hash gave no
    # guarantee of variety — one sample week landed on the same layout five days
    # running. Rotating guarantees consecutive capsules never look alike, while
    # texture and palette still vary by hash.
    layout = _layout_index(date, seed)

    body = _LAYOUTS[layout](
        theme=theme,
        title=title,
        quote=quote,
        season=season,
        location=location,
        mood=mood,
        palette=palette,
    )

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" \
viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-label="{_esc(title)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="{palette.top}"/>
      <stop offset="1" stop-color="{palette.bottom}"/>
    </linearGradient>
    <radialGradient id="glow" cx="{18 + seed % 64}%" cy="{14 + seed % 30}%" r="65%">
      <stop offset="0" stop-color="{palette.accent}" stop-opacity="0.20"/>
      <stop offset="1" stop-color="{palette.accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="{WIDTH}" height="{HEIGHT}" fill="url(#bg)"/>
  <rect width="{WIDTH}" height="{HEIGHT}" fill="url(#glow)"/>
{_texture(seed, palette)}
{_kicker(date, weekday, palette)}
{body}
{_footer(season, location, mood, palette)}
</svg>
"""
    return svg.encode("utf-8")


# ── layouts ──────────────────────────────────────────────────────────────────
# Three arrangements, rotated by calendar day. Vertical positions are chosen so
# the blocks cannot collide at maximum line counts on an 896px canvas.


def _layout_left(*, theme, title, quote, season, location, mood, palette):
    """Theme upper-left, title beneath a rule, quote lower. Left aligned."""
    lines = _wrap_px(theme.upper(), CONTENT_WIDTH, _THEME_SIZE, _THEME_MAX_LINES)
    y = 232

    parts = []
    for line in lines:
        parts.append(_text(line, MARGIN, y, _THEME_SIZE, palette.text, letter_spacing=1.5))
        y += _THEME_LINE_H

    rule_y = y - _THEME_LINE_H + 34
    parts.append(_rule(MARGIN, rule_y, 168, palette.accent, 3))
    parts.append(_block(title, MARGIN, rule_y + 76, _TITLE_SIZE, _TITLE_LINE_H, palette.accent, italic=True))
    parts.append(_block(quote, MARGIN, 660, _QUOTE_SIZE, _QUOTE_LINE_H, palette.muted))
    return "\n".join(parts)


def _layout_centre(*, theme, title, quote, season, location, mood, palette):
    """Everything centred on the horizontal axis."""
    lines = _wrap_px(theme.upper(), CONTENT_WIDTH - 120, _THEME_SIZE, _THEME_MAX_LINES)
    centre = WIDTH // 2
    y = 300 if len(lines) > 1 else 340

    parts = []
    for line in lines:
        parts.append(
            _text(line, centre, y, _THEME_SIZE, palette.text, letter_spacing=2, centre=True)
        )
        y += _THEME_LINE_H

    rule_y = y - _THEME_LINE_H + 40
    parts.append(_rule(centre - 70, rule_y, 140, palette.accent, 2))
    parts.append(
        _block(
            title, centre, rule_y + 74, _TITLE_SIZE, _TITLE_LINE_H, palette.accent,
            italic=True, centre=True,
        )
    )
    parts.append(
        _block(quote, centre, 692, _QUOTE_SIZE, _QUOTE_LINE_H, palette.muted, centre=True)
    )
    return "\n".join(parts)


def _layout_bottom(*, theme, title, quote, season, location, mood, palette):
    """Quote high, theme anchored low. Leaves the upper canvas open."""
    lines = _wrap_px(theme.upper(), CONTENT_WIDTH, _THEME_SIZE, _THEME_MAX_LINES)

    parts = [_block(quote, MARGIN, 236, 28, 40, palette.muted, italic=True)]

    y = 640 - (len(lines) - 1) * _THEME_LINE_H
    for line in lines:
        parts.append(_text(line, MARGIN, y, _THEME_SIZE, palette.text, letter_spacing=1.5))
        y += _THEME_LINE_H

    rule_y = y - _THEME_LINE_H + 30
    parts.append(_rule(MARGIN, rule_y, 140, palette.accent, 3))
    parts.append(_block(title, MARGIN, rule_y + 60, 26, 36, palette.accent, italic=True, max_lines=1))
    return "\n".join(parts)


_LAYOUTS = (_layout_left, _layout_centre, _layout_bottom)


# ── pieces ───────────────────────────────────────────────────────────────────


def _kicker(date: str, weekday: str, palette: Palette) -> str:
    label = f"DREAMFORGE \u2726 {weekday.upper()} \u00b7 {date}"
    return (
        f'  <text x="{MARGIN}" y="92" font-family="Helvetica, Arial, sans-serif" font-size="19" '
        f'letter-spacing="5" fill="{palette.accent}" opacity="0.85">{_esc(label)}</text>'
    )


def _footer(season: str, location: str, mood: str, palette: Palette) -> str:
    label = f"{season.upper()} \u00b7 {location.upper()} \u00b7 {mood.replace('-', ' ').upper()}"
    return (
        f'  <text x="{MARGIN}" y="{HEIGHT - 62}" font-family="Helvetica, Arial, sans-serif" '
        f'font-size="16" letter-spacing="3.5" fill="{palette.muted}" opacity="0.75">'
        f"{_esc(label)}</text>"
    )


def _text(
    content: str,
    x: int,
    y: int,
    size: int,
    colour: str,
    *,
    letter_spacing: float | None = None,
    italic: bool = False,
    centre: bool = False,
) -> str:
    spacing = f' letter-spacing="{letter_spacing}"' if letter_spacing is not None else ""
    style = ' font-style="italic"' if italic else ""
    anchor = ' text-anchor="middle"' if centre else ""
    return (
        f'  <text x="{x}" y="{y}"{anchor} font-family="Georgia, serif" font-size="{size}"'
        f"{spacing}{style} fill=\"{colour}\">{_esc(content)}</text>"
    )


def _rule(x: int, y: int, length: int, colour: str, width: int) -> str:
    return f'  <line x1="{x}" y1="{y}" x2="{x + length}" y2="{y}" stroke="{colour}" stroke-width="{width}"/>'


def _block(
    content: str,
    x: int,
    y: int,
    size: int,
    line_height: int,
    colour: str,
    *,
    italic: bool = False,
    centre: bool = False,
    max_lines: int = 3,
) -> str:
    """A wrapped run of text. SVG has no auto-wrap, so lines are placed manually."""
    available = CONTENT_WIDTH - (120 if centre else 0)
    lines = _wrap_px(content, available, size, max_lines)
    return "\n".join(
        _text(line, x, y + i * line_height, size, colour, italic=italic, centre=centre)
        for i, line in enumerate(lines)
    )


def _texture(seed: int, palette: Palette) -> str:
    """A few faint shapes so no two posters are identically empty."""
    shapes = []
    value = seed
    for i in range(5):
        value = (value * 1103515245 + 12345) & 0x7FFFFFFF
        cx = value % WIDTH
        cy = (value // 7) % HEIGHT
        r = 110 + (value // 13) % 300
        shapes.append(
            f'  <circle cx="{cx}" cy="{cy}" r="{r}" fill="none" '
            f'stroke="{palette.accent}" stroke-width="1" opacity="0.06"/>'
        )
        if i % 2 == 0:
            shapes.append(
                f'  <line x1="0" y1="{cy}" x2="{WIDTH}" y2="{cy}" '
                f'stroke="{palette.muted}" stroke-width="1" opacity="0.05"/>'
            )
    return "\n".join(shapes)


# ── helpers ──────────────────────────────────────────────────────────────────


def _palette_for(mood: str) -> Palette:
    lowered = mood.lower()
    for keywords, palette in _PALETTES:
        if any(k in lowered for k in keywords):
            return palette
    return _FALLBACK_PALETTE


def _seed(value: str) -> int:
    """Stable across runs, unlike hash(), which is salted per process."""
    return int(hashlib.sha256(value.encode("utf-8")).hexdigest()[:8], 16)


def _layout_index(date: str, seed: int) -> int:
    """Rotate layouts by calendar day so consecutive capsules always differ."""
    try:
        return _date.fromisoformat(date).toordinal() % len(_LAYOUTS)
    except ValueError:
        # Unparseable date: fall back to the hash rather than failing.
        return seed % len(_LAYOUTS)


def chars_that_fit(available_px: float, font_size: int) -> int:
    """How many characters fit in a given width at a given size.

    Wrap budgets are derived rather than hardcoded. An earlier version passed
    fixed character counts that were never checked against the canvas, so a long
    theme silently ran off the edge.
    """
    return max(1, int(available_px / (font_size * _SERIF_CHAR_RATIO)))


def _wrap_px(text: str, available_px: float, font_size: int, max_lines: int) -> list[str]:
    return _wrap(text, chars_that_fit(available_px, font_size), max_lines)


def _wrap(text: str, max_chars: int, max_lines: int) -> list[str]:
    """Greedy word wrap, with an ellipsis if it overruns."""
    words = " ".join(text.split()).split(" ")
    lines: list[str] = []
    current = ""

    for word in words:
        candidate = f"{current} {word}".strip()
        if len(candidate) <= max_chars:
            current = candidate
            continue

        if current:
            lines.append(current)
        # A single word longer than the budget still has to go somewhere.
        current = word
        if len(lines) == max_lines:
            current = ""
            break

    if current and len(lines) < max_lines:
        lines.append(current)

    if not lines:
        return [""]

    # Signal truncation rather than silently dropping words.
    if sum(len(line.split()) for line in lines) < len(words):
        lines[-1] = lines[-1].rstrip(",.;:") + "\u2026"

    return lines


def _esc(text: str) -> str:
    """XML-escape. Essential: theme, title and quote all come from a model, so
    an unescaped ampersand or angle bracket would produce a corrupt SVG."""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )
