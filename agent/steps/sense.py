"""Step 1 — build world context.

Contract: this function never raises. Every field has a fallback, because a
weather API hiccup must not stop the day's creation — it just means the agent
works with less context, like a person who didn't look out the window.

Uses urllib from the standard library rather than requests, so the Lambda
package needs no dependencies at all beyond the runtime's boto3.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

from config import CONFIG
from logging_util import warn
from models import WorldContext

_WEATHER_TIMEOUT_S = 3.5

# WMO weather codes as returned by Open-Meteo.
_CONDITIONS = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Freezing fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Heavy drizzle",
    61: "Light rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Freezing rain",
    67: "Heavy freezing rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Light showers",
    81: "Showers",
    82: "Violent showers",
    85: "Snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with hail",
    99: "Severe thunderstorm with hail",
}

# Indian seasons rather than temperate four — the location drives the creative
# framing, and "Monsoon" carries far more than "Summer" would in August.
_SEASONS = {
    1: "Winter", 2: "Winter",
    3: "Summer", 4: "Summer", 5: "Summer",
    6: "Monsoon", 7: "Monsoon", 8: "Monsoon", 9: "Monsoon",
    10: "Post-Monsoon", 11: "Post-Monsoon",
    12: "Winter",
}

_SPECIAL_DAYS = {
    (1, 1): "New Year's Day",
    (1, 26): "Republic Day",
    (6, 21): "Summer solstice",
    (8, 15): "Independence Day",
    (10, 2): "Gandhi Jayanti",
    (12, 21): "Winter solstice",
    (12, 25): "Christmas Day",
    (12, 31): "New Year's Eve",
}


def sense() -> WorldContext:
    """Gather today's context. Never raises."""
    now = _local_now()

    context = WorldContext(
        date=now.strftime("%Y-%m-%d"),
        weekday=now.strftime("%A"),
        is_weekend=now.weekday() >= 5,
        location=CONFIG.city,
        season=_SEASONS.get(now.month, "Unknown"),
        special_day=_SPECIAL_DAYS.get((now.month, now.day)),
    )

    weather = _fetch_weather()
    if weather:
        context.temp_c = weather[0]
        context.condition = weather[1]

    return context


def describe_weather(context: WorldContext) -> str:
    """A single phrase for prompts, valid whether or not weather was available."""
    if context.condition and context.temp_c is not None:
        return f"{context.condition}, {round(context.temp_c)}C"
    if context.condition:
        return context.condition
    return f"typical {context.season.lower()} weather"


def _local_now() -> datetime:
    """Now, in the configured timezone.

    Computed by offset rather than zoneinfo: the Lambda runtime ships without
    the tzdata package, so ZoneInfo("Asia/Kolkata") raises there.
    """
    offsets = {"Asia/Kolkata": 5.5, "UTC": 0.0}
    hours = offsets.get(CONFIG.timezone, 5.5)
    return datetime.now(timezone.utc) + timedelta(hours=hours)


def _fetch_weather() -> tuple[float, str] | None:
    """Open-Meteo current conditions. Returns None on any failure."""
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={CONFIG.latitude}&longitude={CONFIG.longitude}"
        "&current=temperature_2m,weather_code"
        "&timezone=auto"
    )

    try:
        request = urllib.request.Request(url, headers={"User-Agent": "dreamforge-agent/1.0"})
        with urllib.request.urlopen(request, timeout=_WEATHER_TIMEOUT_S) as response:
            payload = json.loads(response.read().decode("utf-8"))

        current = payload.get("current") or {}
        temp = current.get("temperature_2m")
        code = current.get("weather_code")

        if temp is None:
            return None

        condition = _CONDITIONS.get(int(code), "Unsettled") if code is not None else "Unsettled"
        return float(temp), condition

    except (urllib.error.URLError, TimeoutError, ValueError, KeyError, TypeError, OSError) as exc:
        # Degrading is correct here. Publishing matters more than the weather.
        warn("sense", weather="unavailable", reason=type(exc).__name__)
        return None
