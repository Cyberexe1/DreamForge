"""Render sample posters to agent/preview/ and build an index page.

A contact sheet is the only honest way to judge a generator like this — unit
tests prove the SVG is valid, not that it looks good.

    cd agent
    python scripts/preview_posters.py
    start preview/index.html
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import poster  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "preview")

# Deliberately includes awkward cases: a long theme, a long quote, an unknown
# mood that must fall back, and characters that would break unescaped XML.
SAMPLES = [
    {
        "date": "2026-08-21", "weekday": "Friday", "mood": "playful-melancholy",
        "theme": "The Cartographer of Puddles",
        "title": "The City That Waited for Rain",
        "quote": "Some cities do not wait for rain. They rehearse for it.",
    },
    {
        "date": "2026-08-20", "weekday": "Thursday", "mood": "solemn",
        "theme": "Concrete Silence",
        "title": "Nine Floors of Nobody",
        "quote": "The lift announced each floor to no one in particular.",
    },
    {
        "date": "2026-08-19", "weekday": "Wednesday", "mood": "weary",
        "theme": "The Long Commute Home",
        "title": "Seat 4B, Westbound",
        "quote": "He had memorised the shape of the window's scratch.",
    },
    {
        "date": "2026-08-18", "weekday": "Tuesday", "mood": "restless-storm",
        "theme": "What the Gutters Carried",
        "title": "A Tarnished Locket, Found",
        "quote": "The water kept what the street let go of.",
    },
    {
        "date": "2026-08-17", "weekday": "Monday", "mood": "serene",
        "theme": "Platform Nine, Again",
        "title": "A Brief History of Standing Still",
        "quote": "Waiting is a kind of arriving, practised badly.",
    },
    {
        "date": "2026-08-16", "weekday": "Sunday", "mood": "entirely-invented-mood",
        "theme": "Rain & Ruin <after the fact>",
        "title": 'She said "goodbye" & meant it',
        "quote": "An unescaped ampersand & a bracket > should not break this.",
    },
    {
        "date": "2026-08-15", "weekday": "Saturday", "mood": "hopeful",
        "theme": "A Theme Deliberately Far Too Long To Fit On Any Single Line Of This Poster",
        "title": "Truncation Should Read As Intentional",
        "quote": "This quote is also excessive, running well beyond what the layout reserves for it, "
                 "so the wrap and the ellipsis both get exercised properly.",
    },
]

COMMON = {"season": "Monsoon", "location": "Mumbai, India"}


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    cards = []

    for sample in SAMPLES:
        svg = poster.render(**{**COMMON, **sample})
        name = f"{sample['date']}.svg"
        with open(os.path.join(OUT, name), "wb") as handle:
            handle.write(svg)

        layout = poster._layout_index(sample["date"], 0)
        cards.append(
            f'<figure><img src="{name}" alt="{sample["title"]}" loading="lazy">'
            f'<figcaption>layout {layout} &middot; {sample["mood"]} '
            f"&middot; {len(svg)} bytes</figcaption></figure>"
        )
        print(f"  {name}  layout {layout}  {len(svg):>5} bytes  {sample['mood']}")

    html = f"""<!doctype html>
<meta charset="utf-8">
<title>DreamForge poster previews</title>
<style>
  body {{ background:#0b0d12; color:#8b939e; font:14px/1.5 system-ui, sans-serif; margin:0; padding:40px; }}
  h1 {{ color:#fff; font-weight:400; font-size:24px; margin:0 0 8px; }}
  p {{ max-width:60ch; }}
  .grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:28px; margin-top:32px; }}
  figure {{ margin:0; }}
  img {{ width:100%; border-radius:14px; display:block; border:1px solid rgba(255,255,255,.1); }}
  figcaption {{ margin-top:10px; font-size:12px; color:#6b7280; }}
</style>
<h1>Poster previews</h1>
<p>Rendered by <code>agent/poster.py</code> with no third-party libraries. The last two
samples are deliberately hostile: unescaped XML characters, an unknown mood, and
text far longer than the layout reserves.</p>
<div class="grid">
{chr(10).join(cards)}
</div>
"""
    with open(os.path.join(OUT, "index.html"), "w", encoding="utf-8") as handle:
        handle.write(html)

    print(f"\nOpen: {os.path.join(OUT, 'index.html')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
