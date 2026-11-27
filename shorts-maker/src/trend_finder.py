"""Поиск вирусных тем: топ-посты Reddit и растущие запросы Google Trends.

Reddit: публичный JSON. Если Reddit его не отдаёт (403/429), можно задать
REDDIT_CLIENT_ID и REDDIT_CLIENT_SECRET — тогда используется официальный OAuth API.
Google: официальная RSS-лента Google Trends.
"""
from __future__ import annotations

import html
import json
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path

import requests

import config
from src import PipelineError, keys

HEADERS = {"User-Agent": "shorts-maker/1.0"}
TIME_FILTERS = ("hour", "day", "week", "month", "year", "all")
RSS_URL = "https://trends.google.com/trending/rss"
RSS_NS = {"ht": "https://trends.google.com/trending/rss"}


@dataclass
class RedditPost:
    id: str
    subreddit: str
    title: str
    text: str
    upvotes: int
    comments: int
    url: str


@dataclass
class Trend:
    query: str
    traffic: str = ""
    news: list[str] = field(default_factory=list)  # заголовки новостей — контекст для сценария


# --- Reddit ---------------------------------------------------------------

def _reddit_token() -> str | None:
    client, secret = keys.get("REDDIT_CLIENT_ID"), keys.get("REDDIT_CLIENT_SECRET")
    if not client or not secret:
        return None
    response = requests.post(
        "https://www.reddit.com/api/v1/access_token",
        auth=(client, secret), data={"grant_type": "client_credentials"},
        headers=HEADERS, timeout=30,
    )
    if not response.ok or "access_token" not in response.json():
        raise PipelineError(f"Reddit не принял REDDIT_CLIENT_ID/SECRET (код {response.status_code}).")
    return response.json()["access_token"]


def check_reddit() -> None:
    try:
        if not _reddit_token():
            raise PipelineError("Нужны оба ключа Reddit: ID и Secret.")
    except requests.RequestException as error:
        raise PipelineError(f"Нет связи с Reddit: {error}") from error
    except ValueError as error:
        raise PipelineError("Reddit вернул не JSON — повтори позже.") from error


def _reddit_listing(subreddit: str, time_filter: str) -> dict:
    params = {"t": time_filter, "limit": 100, "raw_json": 1}
    try:
        token = _reddit_token()
        if token:
            url = f"https://oauth.reddit.com/r/{subreddit}/top"
            headers = {**HEADERS, "Authorization": f"Bearer {token}"}
        else:
            url, headers = f"https://www.reddit.com/r/{subreddit}/top.json", HEADERS
        response = requests.get(url, params=params, headers=headers, timeout=30)
        if response.status_code in (403, 429):
            raise PipelineError(
                f"Reddit отказал в доступе (код {response.status_code}). Без регистрации публичный JSON "
                "часто закрыт: добавь ключи Reddit на вкладке «Ключи» (см. README) или повтори позже."
            )
        response.raise_for_status()
        return response.json()
    except requests.RequestException as error:
        raise PipelineError(f"Не удалось получить посты Reddit: {error}") from error
    except ValueError as error:
        raise PipelineError("Reddit вернул не JSON (возможно, страница проверки).") from error


def parse_listing(data: dict, min_upvotes: int, min_comments: int) -> list[RedditPost]:
    """Отбирает посты по голосам и комментариям; 18+, закреплённые и удалённые пропускает."""
    posts: list[RedditPost] = []
    for child in data.get("data", {}).get("children", []):
        item = child.get("data", {})
        text = (item.get("selftext") or "").strip()
        if item.get("over_18") or item.get("stickied") or text in ("[removed]", "[deleted]"):
            continue
        if item.get("ups", 0) < min_upvotes or item.get("num_comments", 0) < min_comments:
            continue
        title = html.unescape(item.get("title", "")).strip()
        if not title or not item.get("id"):
            continue
        posts.append(RedditPost(
            id=item["id"],
            subreddit=item.get("subreddit", ""),
            title=title,
            text=html.unescape(text),
            upvotes=item.get("ups", 0),
            comments=item.get("num_comments", 0),
            url="https://www.reddit.com" + item.get("permalink", ""),
        ))
    return sorted(posts, key=lambda p: p.upvotes, reverse=True)


def get_reddit_trends(subreddit: str = "AskReddit", time_filter: str = "day",
                      min_upvotes: int = 2000, min_comments: int = 100) -> list[RedditPost]:
    """Топ-посты сабреддита: заголовок и текст истории, самые популярные первыми."""
    subreddit = subreddit.removeprefix("r/").strip("/")
    if not re.fullmatch(r"[A-Za-z0-9_]{2,50}", subreddit):
        raise PipelineError(f"Неверное имя сабреддита: {subreddit!r}")
    if time_filter not in TIME_FILTERS:
        raise PipelineError(f"time_filter должен быть одним из: {', '.join(TIME_FILTERS)}")
    return parse_listing(_reddit_listing(subreddit, time_filter), min_upvotes, min_comments)


# --- Google Trends --------------------------------------------------------

def parse_rss(content: bytes) -> list[Trend]:
    try:
        root = ET.fromstring(content)
    except ET.ParseError as error:
        raise PipelineError(f"Google Trends вернул не RSS: {error}") from error
    trends = []
    for item in root.iter("item"):
        query = (item.findtext("title") or "").strip()
        if not query:
            continue
        news = [
            html.unescape(node.findtext("ht:news_item_title", "", RSS_NS)).strip()
            for node in item.findall("ht:news_item", RSS_NS)
        ]
        trends.append(Trend(query, item.findtext("ht:approx_traffic", "", RSS_NS), [n for n in news if n]))
    return trends


def get_google_trends(geo: str = "US") -> list[Trend]:
    """Сегодняшние быстрорастущие запросы в стране geo (US, GB, DE...)."""
    geo = geo.upper()
    if not re.fullmatch(r"[A-Z]{2}", geo):
        raise PipelineError(f"geo — двухбуквенный код страны, а не {geo!r}")
    try:
        response = requests.get(RSS_URL, params={"geo": geo}, headers=HEADERS, timeout=30)
        response.raise_for_status()
    except requests.RequestException as error:
        raise PipelineError(f"Не удалось получить Google Trends: {error}") from error
    return parse_rss(response.content)


# --- Какие темы уже использованы ------------------------------------------

def _history_file() -> Path:
    return config.OUTPUT_DIR / "used_topics.json"


def used_topics() -> set[str]:
    try:
        return set(json.loads(_history_file().read_text(encoding="utf-8")))
    except (OSError, ValueError, TypeError):
        return set()


def mark_used(key: str) -> None:
    path = _history_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(sorted(used_topics() | {key}), ensure_ascii=False, indent=1), encoding="utf-8")
