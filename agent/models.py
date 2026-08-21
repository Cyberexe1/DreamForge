"""Dataclasses for everything that crosses a module boundary.

The Capsule shape here is the contract with the frontend, documented in
docs/ARCHITECTURE.md and mirrored in web/src/types.ts. Change all three in the
same commit.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class WorldContext:
    """What the agent knows about today. Every field has a working default so
    `sense` can degrade without raising."""

    date: str
    weekday: str
    is_weekend: bool
    location: str
    season: str
    temp_c: float | None = None
    condition: str | None = None
    special_day: str | None = None

    def to_capsule_context(self) -> dict[str, Any]:
        return {
            "location": self.location,
            "season": self.season,
            "temp_c": self.temp_c,
            "condition": self.condition,
            "is_weekend": self.is_weekend,
            "special_day": self.special_day,
        }


@dataclass
class Memory:
    """Recent work, used only to stop the agent repeating itself."""

    entries: list[dict[str, str]] = field(default_factory=list)

    @property
    def themes(self) -> list[str]:
        return [e["theme"] for e in self.entries if e.get("theme")]

    def __len__(self) -> int:
        return len(self.entries)


@dataclass
class Decision:
    """The agent's own creative choices. None of these come from a lookup table."""

    theme: str
    mood: str
    form: str
    reasoning: str
    art_direction: str
    # True when the model failed and a safe direction was substituted.
    fallback: bool = False


@dataclass
class Work:
    title: str
    body: str
    quote: str


@dataclass
class Critique:
    score: int
    weakness: str
    # True when the critic itself failed and the work was passed through.
    skipped: bool = False


@dataclass
class Capsule:
    date: str
    weekday: str
    context: dict[str, Any]
    theme: str
    mood: str
    form: str
    reasoning: str | None
    title: str
    story: str
    quote: str
    image_key: str | None
    image_prompt: str | None
    meta: dict[str, Any]

    def to_json_dict(self) -> dict[str, Any]:
        return asdict(self)
