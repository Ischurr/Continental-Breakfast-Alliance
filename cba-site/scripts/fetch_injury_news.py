"""
fetch_injury_news.py — Scrapes injury news from multiple sources.

Option A: RSS feeds (CBS Sports injuries)
Option B: HTML scraping (Rotowire, FantasyPros)

Returns a daily-cached map of normalized_player_name -> {text, source, date}
that patch_injury_status.py merges into data/erosp/latest.json as `injury_news`.

Run time: ~5-10 seconds (3-4 HTTP requests + parse).
Called by patch_injury_status.py — not meant to be run standalone.

Dependencies: requests, beautifulsoup4
  pip install requests beautifulsoup4
"""

import datetime
import json
import re
import unicodedata
import xml.etree.ElementTree as ET
from email.utils import parsedate
from pathlib import Path

try:
    import requests
except ImportError:
    raise ImportError("requests not installed: pip install requests")

try:
    from bs4 import BeautifulSoup
    BS4_AVAILABLE = True
except ImportError:
    BS4_AVAILABLE = False

SCRIPTS_DIR = Path(__file__).parent
CACHE_DIR = SCRIPTS_DIR / "erosp_cache"
CACHE_DIR.mkdir(exist_ok=True)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/123.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# Max chars to store per news blurb — long enough to be useful, short enough for JSON
NEWS_MAX_CHARS = 400

# ─────────────────────────────────────────────────────────────────
# Name normalization (mirrors EROSP pipeline)
# ─────────────────────────────────────────────────────────────────

def normalize_name(name: str) -> str:
    """Lowercase alphanumeric only, strip accents and suffixes."""
    name = unicodedata.normalize("NFKD", name)
    name = name.encode("ascii", "ignore").decode("ascii")
    name = re.sub(r"\s+(jr\.?|sr\.?|ii|iii|iv)\.?\s*$", "", name, flags=re.IGNORECASE)
    name = re.sub(r"[^a-z0-9]", "", name.lower())
    return name.strip()


# ─────────────────────────────────────────────────────────────────
# Source A — RSS feeds
# ─────────────────────────────────────────────────────────────────

INJURY_KEYWORDS = {
    "il", "injured list", "disabled list", "injury", "injured", "placed on",
    "strain", "sprain", "inflammation", "fracture", "surgery", "torn",
    "hamstring", "elbow", "shoulder", "knee", "back", "oblique", "concussion",
    "blister", "tendon", "ligament", "ucl", "acl", "forearm", "wrist",
    "quad", "groin", "calf", "finger", "thumb", "lat", "rib", "hip",
    "10-day", "15-day", "60-day", "dtd", "day-to-day",
}

RSS_FEEDS = [
    ("CBS Sports", "https://www.cbssports.com/rss/headlines/mlb/injuries/"),
    ("ESPN",       "https://www.espn.com/espn/rss/mlb/news"),
]


def _extract_name_from_headline(title: str) -> str:
    """Extract a player name from a news headline.

    Handles formats like:
      "Zack Wheeler placed on the IL"
      "Phillies place Zack Wheeler on IL"
      "Wheeler (forearm) goes on IL"
      "PHI - Zack Wheeler: IL update"
    """
    # Strip team-name prefixes: "Phillies: ", "PHI - ", "SF Giants | "
    title = re.sub(r"^[A-Z][a-zA-Z\s]{2,20}[:\|]\s*", "", title)
    title = re.sub(r"^[A-Z]{2,3}\s*[-–]\s*", "", title)

    # Name at start: "Zack Wheeler ..." or "Wheeler ..."
    m = re.match(r"^([A-Z][a-z]+(?:\s+[A-Z][a-z'-]+){1,2})", title)
    if m:
        candidate = m.group(1).strip()
        # Reject if it's a team/city name (single token that's a common word)
        if len(candidate.split()) >= 2:
            return candidate

    # "places/puts X on IL" pattern
    m = re.search(
        r"(?:places?|puts?|optioned?|transfers?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z'-]+){1,2})\s+(?:on|to)",
        title,
    )
    if m:
        return m.group(1).strip()

    return ""


def _parse_rss_date(pub_date: str) -> str:
    """Parse RFC-2822 RSS date to YYYY-MM-DD, falling back to today."""
    today = datetime.date.today().isoformat()
    try:
        parsed = parsedate(pub_date)
        if parsed:
            return datetime.date(*parsed[:3]).isoformat()
    except Exception:
        pass
    return today


def fetch_rss_injuries() -> dict:
    """Option A: Fetch injury-related items from RSS feeds.
    Returns {normalized_name: {text, source, date}}.
    """
    result: dict = {}
    today = datetime.date.today().isoformat()

    for source_name, feed_url in RSS_FEEDS:
        try:
            resp = requests.get(feed_url, headers=HEADERS, timeout=12)
            if resp.status_code != 200:
                print(f"  {source_name} RSS: HTTP {resp.status_code}")
                continue

            root = ET.fromstring(resp.content)
            items = root.findall(".//item")
            count = 0

            for item in items:
                title   = (item.findtext("title")       or "").strip()
                desc    = (item.findtext("description") or "").strip()
                pub_raw = (item.findtext("pubDate")     or today)

                combined = f"{title} {desc}".lower()
                if not any(kw in combined for kw in INJURY_KEYWORDS):
                    continue

                player_name = _extract_name_from_headline(title)
                if not player_name:
                    continue

                # Strip HTML from description
                text = re.sub(r"<[^>]+>", " ", desc).strip()
                text = re.sub(r"\s{2,}", " ", text)
                if not text:
                    text = title
                text = text[:NEWS_MAX_CHARS]

                date_str = _parse_rss_date(pub_raw)
                key = normalize_name(player_name)

                if key not in result or date_str > result[key]["date"]:
                    result[key] = {"text": text, "source": source_name, "date": date_str}
                    count += 1

            print(f"  {source_name} RSS: {count} injury items matched")

        except ET.ParseError as exc:
            print(f"  {source_name} RSS XML parse error: {exc}")
        except Exception as exc:
            print(f"  {source_name} RSS failed: {exc}")

    return result


# ─────────────────────────────────────────────────────────────────
# Source B1 — Rotowire
# ─────────────────────────────────────────────────────────────────

def fetch_rotowire_news() -> dict:
    """Option B: Scrape Rotowire MLB injury news page.
    Returns {normalized_name: {text, source, date}}.
    """
    if not BS4_AVAILABLE:
        print("  Rotowire: skipped (beautifulsoup4 not installed)")
        return {}

    url = "https://www.rotowire.com/baseball/injury-news.php"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            print(f"  Rotowire: HTTP {resp.status_code}")
            return {}
    except Exception as exc:
        print(f"  Rotowire fetch failed: {exc}")
        return {}

    soup = BeautifulSoup(resp.text, "html.parser")
    today = datetime.date.today().isoformat()
    result: dict = {}

    # Rotowire renders news as a list; try likely container selectors in order
    items = (
        soup.select("li.news-list__item")
        or soup.select(".player-news__item")
        or soup.select(".news-item")
        or soup.select("article")
    )

    if not items:
        # Fallback: look for any div/li containing a player link + paragraph
        items = [
            el for el in soup.find_all(["li", "div"])
            if el.find("a", href=re.compile(r"/baseball/player/"))
            and el.find("p")
        ]

    count = 0
    for item in items:
        # Player name — prefer explicit class, fall back to first player link
        name_el = (
            item.select_one(".news-player-name")
            or item.select_one(".news-player")
            or item.find("a", href=re.compile(r"/baseball/player/"))
        )
        if not name_el:
            continue
        player_name = name_el.get_text(strip=True)
        if not player_name or len(player_name) > 60:
            continue

        # News text — prefer dedicated body class, fall back to first <p>
        text_el = (
            item.select_one(".news-item__text")
            or item.select_one(".news-body")
            or item.select_one(".news-content")
            or item.find("p")
        )
        if not text_el:
            continue
        news_text = text_el.get_text(" ", strip=True)
        if len(news_text) < 20:
            continue

        # Date
        date_str = today
        date_el = item.find("time") or item.select_one(".news-timestamp")
        if date_el:
            dt = date_el.get("datetime", "") or date_el.get_text(strip=True)
            if dt:
                # Could be "2026-03-29" or "Mar 29" or "3/29/2026"
                m = re.search(r"(\d{4}-\d{2}-\d{2})", dt)
                if m:
                    date_str = m.group(1)

        key = normalize_name(player_name)
        if key not in result or date_str > result[key]["date"]:
            result[key] = {
                "text": news_text[:NEWS_MAX_CHARS],
                "source": "Rotowire",
                "date": date_str,
            }
            count += 1

    print(f"  Rotowire: {count} player news items")
    return result


# ─────────────────────────────────────────────────────────────────
# Source B2 — FantasyPros
# ─────────────────────────────────────────────────────────────────

def fetch_fantasypros_news() -> dict:
    """Option B: Scrape FantasyPros MLB injury news page.
    Returns {normalized_name: {text, source, date}}.
    """
    if not BS4_AVAILABLE:
        print("  FantasyPros: skipped (beautifulsoup4 not installed)")
        return {}

    url = "https://www.fantasypros.com/mlb/news/injuries/"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            print(f"  FantasyPros: HTTP {resp.status_code}")
            return {}
    except Exception as exc:
        print(f"  FantasyPros fetch failed: {exc}")
        return {}

    soup = BeautifulSoup(resp.text, "html.parser")
    today = datetime.date.today().isoformat()
    result: dict = {}

    # FantasyPros wraps each article in a distinct container
    articles = (
        soup.select(".news-item")
        or soup.select("article")
        or soup.select(".article-item")
        or soup.select(".player-news-item")
    )

    if not articles:
        articles = [
            el for el in soup.find_all(["div", "article"])
            if el.find("a", href=re.compile(r"/mlb/players/"))
            and el.find("p")
        ]

    count = 0
    for article in articles:
        # Player name — prefer player link, then h3/h4
        name_el = (
            article.find("a", href=re.compile(r"/mlb/players/"))
            or article.select_one(".player-name")
            or article.find("h4")
            or article.find("h3")
        )
        if not name_el:
            continue
        player_name = name_el.get_text(strip=True)
        # Reject if obviously not a name (too long, or contains lowercase run)
        if not player_name or len(player_name) > 50:
            continue

        # News text
        text_el = (
            article.select_one(".news-item__body")
            or article.select_one(".article-body")
            or article.select_one(".news-content")
            or article.find("p")
        )
        if not text_el:
            continue
        news_text = text_el.get_text(" ", strip=True)
        if len(news_text) < 20:
            continue

        # Date
        date_str = today
        date_el = article.find("time") or article.select_one(".date, .timestamp, .article-date")
        if date_el:
            dt = date_el.get("datetime", "") or date_el.get_text(strip=True)
            m = re.search(r"(\d{4}-\d{2}-\d{2})", dt)
            if m:
                date_str = m.group(1)

        key = normalize_name(player_name)
        if key not in result or date_str > result[key]["date"]:
            result[key] = {
                "text": news_text[:NEWS_MAX_CHARS],
                "source": "FantasyPros",
                "date": date_str,
            }
            count += 1

    print(f"  FantasyPros: {count} player news items")
    return result


# ─────────────────────────────────────────────────────────────────
# Main entry — merge all sources, cache daily
# ─────────────────────────────────────────────────────────────────

def fetch_all_injury_news(season: int) -> dict:
    """Fetch from all sources, deduplicate, cache daily.

    Priority: Rotowire > FantasyPros > RSS (in recency order).
    Returns {normalized_player_name: {text, source, date}}.
    """
    today = datetime.date.today()
    cache_path = CACHE_DIR / f"injury_news_{season}_{today.strftime('%Y%m%d')}.json"

    if cache_path.exists():
        print(f"  Cache hit → {cache_path.name}")
        with open(cache_path) as f:
            return json.load(f)

    print("  Fetching injury news (Rotowire + FantasyPros + RSS)…")

    # Rotowire is highest quality — fetch first, others fill gaps
    combined: dict = {}
    source_priority = {"Rotowire": 3, "FantasyPros": 2, "CBS Sports": 1, "ESPN": 1}

    def _merge(new_data: dict) -> None:
        for key, entry in new_data.items():
            if key not in combined:
                combined[key] = entry
            else:
                existing = combined[key]
                new_priority = source_priority.get(entry["source"], 0)
                old_priority = source_priority.get(existing["source"], 0)
                # Prefer higher-priority source; tie-break by recency
                if new_priority > old_priority or (
                    new_priority == old_priority and entry["date"] > existing["date"]
                ):
                    combined[key] = entry

    _merge(fetch_rotowire_news())
    _merge(fetch_fantasypros_news())
    _merge(fetch_rss_injuries())

    print(f"  Combined: {len(combined)} unique player news items across all sources")

    with open(cache_path, "w") as f:
        json.dump(combined, f)

    return combined
