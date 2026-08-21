"""Poster generator tests.

The inputs are model output, so they are untrusted: an unescaped ampersand or
angle bracket produces a corrupt SVG that renders as nothing. These tests prove
escaping, wrapping and layout selection hold up.

    cd agent
    python -m unittest discover tests
"""

from __future__ import annotations

import os
import sys
import unittest
from xml.etree import ElementTree

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import poster  # noqa: E402

BASE = {
    "theme": "The Cartographer of Puddles",
    "title": "The City That Waited for Rain",
    "quote": "Some cities do not wait for rain. They rehearse for it.",
    "date": "2026-08-21",
    "weekday": "Friday",
    "season": "Monsoon",
    "location": "Mumbai, India",
    "mood": "playful-melancholy",
}


def render(**overrides) -> str:
    return poster.render(**{**BASE, **overrides}).decode("utf-8")


class TestStructure(unittest.TestCase):
    def test_is_well_formed_xml(self):
        ElementTree.fromstring(render())

    def test_has_expected_dimensions(self):
        root = ElementTree.fromstring(render())
        self.assertEqual(root.get("width"), str(poster.WIDTH))
        self.assertEqual(root.get("height"), str(poster.HEIGHT))

    def test_carries_an_accessible_label(self):
        root = ElementTree.fromstring(render())
        self.assertEqual(root.get("role"), "img")
        self.assertIn("Waited for Rain", root.get("aria-label", ""))

    def test_includes_the_content(self):
        svg = render()
        self.assertIn("CARTOGRAPHER", svg.upper())
        self.assertIn("2026-08-21", svg)
        self.assertIn("FRIDAY", svg.upper())
        self.assertIn("MONSOON", svg.upper())


class TestEscaping(unittest.TestCase):
    """The reason this module escapes at all — every field is model output."""

    def test_ampersands_and_brackets_survive(self):
        svg = render(
            theme="Rain & Ruin <the end>",
            title='She said "goodbye" & left',
            quote="a > b & c < d",
        )
        ElementTree.fromstring(svg)  # would raise if escaping were missing
        self.assertNotIn("Rain & Ruin", svg)
        self.assertIn("&amp;", svg)

    def test_a_script_tag_cannot_be_injected(self):
        svg = render(title="<script>alert(1)</script>")
        self.assertNotIn("<script>", svg)
        ElementTree.fromstring(svg)

    def test_non_ascii_is_preserved(self):
        svg = render(theme="Mumbai — Mónsoon", quote="a \u201cquoted\u201d line")
        ElementTree.fromstring(svg)
        # Themes are set in caps by every layout, so check the uppercased form.
        self.assertIn("MÓNSOON", svg)
        self.assertIn("\u201cquoted\u201d", svg)


class TestWrapping(unittest.TestCase):
    def test_long_text_is_truncated_with_an_ellipsis(self):
        lines = poster._wrap("word " * 200, 40, 3)
        self.assertEqual(len(lines), 3)
        self.assertTrue(lines[-1].endswith("\u2026"))

    def test_short_text_is_left_alone(self):
        self.assertEqual(poster._wrap("just a few words", 40, 3), ["just a few words"])

    def test_no_line_exceeds_the_budget_when_words_allow(self):
        for line in poster._wrap(BASE["quote"], 30, 4):
            self.assertLessEqual(len(line), 30)

    def test_empty_input_yields_one_empty_line(self):
        self.assertEqual(poster._wrap("", 40, 3), [""])

    def test_a_single_overlong_word_does_not_hang(self):
        lines = poster._wrap("x" * 300, 40, 3)
        self.assertGreaterEqual(len(lines), 1)

    def test_very_long_fields_still_produce_valid_svg(self):
        ElementTree.fromstring(
            render(theme="A " * 80, title="B " * 80, quote="C " * 200)
        )


class TestVariation(unittest.TestCase):
    def test_layout_is_stable_for_the_same_capsule(self):
        self.assertEqual(render(), render())

    def test_all_layouts_appear_across_a_month(self):
        seen = {
            poster._layout_index(f"2026-08-{day:02d}", 0) for day in range(1, 29)
        }
        self.assertEqual(seen, {0, 1, 2})

    def test_consecutive_days_never_share_a_layout(self):
        """A hash allowed five identical layouts in a row; rotation forbids it."""
        indexes = [poster._layout_index(f"2026-08-{day:02d}", 0) for day in range(1, 29)]
        for earlier, later in zip(indexes, indexes[1:]):
            self.assertNotEqual(earlier, later)

    def test_an_unparseable_date_falls_back_instead_of_raising(self):
        self.assertIn(poster._layout_index("not-a-date", 7), {0, 1, 2})

    def test_every_layout_renders(self):
        rendered = 0
        for day in range(1, 15):
            svg = render(date=f"2026-08-{day:02d}", theme=f"Theme Number {day}")
            ElementTree.fromstring(svg)
            rendered += 1
        self.assertEqual(rendered, 14)


class TestFitsCanvas(unittest.TestCase):
    """An earlier version used hardcoded character budgets that were never checked
    against the canvas width, so a long theme ran off the edge silently."""

    HOSTILE = {
        "theme": "A Theme Deliberately Far Too Long To Fit On Any Single Line",
        "title": "A Title That Also Refuses To Be Reasonably Concise At All",
        "quote": "This quote runs well beyond what any layout reserves for it, "
                 "which is exactly the case that used to overflow.",
    }

    def _texts(self, svg: str):
        root = ElementTree.fromstring(svg)
        ns = "{http://www.w3.org/2000/svg}"
        for node in root.iter(f"{ns}text"):
            yield node

    def test_no_text_baseline_falls_outside_the_canvas(self):
        for day in range(15, 22):
            svg = render(date=f"2026-08-{day}", **self.HOSTILE)
            for node in self._texts(svg):
                y = float(node.get("y", "0"))
                self.assertGreater(y, 0, f"day {day}: baseline above canvas")
                self.assertLess(y, poster.HEIGHT, f"day {day}: baseline below canvas")

    def test_no_line_overruns_the_content_width(self):
        for day in range(15, 22):
            svg = render(date=f"2026-08-{day}", **self.HOSTILE)
            for node in self._texts(svg):
                size = int(node.get("font-size", "16"))
                text = node.text or ""
                width = poster.chars_that_fit(poster.CONTENT_WIDTH, size)
                self.assertLessEqual(
                    len(text), width + 1, f"day {day}: '{text[:40]}' too wide at {size}px"
                )

    def test_char_budget_scales_with_available_width(self):
        narrow = poster.chars_that_fit(600, 60)
        wide = poster.chars_that_fit(1200, 60)
        self.assertGreater(wide, narrow)

    def test_larger_type_fits_fewer_characters(self):
        self.assertLess(
            poster.chars_that_fit(1200, 62), poster.chars_that_fit(1200, 25)
        )


class TestDimensions(unittest.TestCase):
    def test_is_landscape(self):
        self.assertGreater(poster.WIDTH, poster.HEIGHT)

    def test_content_width_accounts_for_both_margins(self):
        self.assertEqual(poster.CONTENT_WIDTH, poster.WIDTH - poster.MARGIN * 2)


class TestPalettes(unittest.TestCase):
    def test_mood_keywords_select_distinct_palettes(self):
        solemn = poster._palette_for("melancholic-reflective")
        warm = poster._palette_for("playful-bright")
        self.assertNotEqual(solemn.accent, warm.accent)

    def test_an_invented_mood_falls_back_rather_than_failing(self):
        palette = poster._palette_for("entirely-unheard-of-mood")
        self.assertEqual(palette, poster._FALLBACK_PALETTE)

    def test_every_palette_is_reachable_and_renders(self):
        for keywords, _ in poster._PALETTES:
            ElementTree.fromstring(render(mood=keywords[0]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
