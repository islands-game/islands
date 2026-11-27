"""Пути к папкам и настройки по умолчанию."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ASSETS_DIR = ROOT / "assets"
BACKGROUNDS_DIR = ASSETS_DIR / "backgrounds"
MUSIC_DIR = ASSETS_DIR / "music"
FONTS_DIR = ASSETS_DIR / "fonts"
OUTPUT_DIR = ROOT / "output"
TEMP_DIR = ROOT / "temp"

VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".opus"}

# --- Озвучка (edge-tts) ---
VOICES = {
    "dmitry": "ru-RU-DmitryNeural",
    "svetlana": "ru-RU-SvetlanaNeural",
    "christopher": "en-US-ChristopherNeural",
    # многоязычные: читают и по-русски, и по-английски
    "andrew": "en-US-AndrewMultilingualNeural",
    "emma": "en-US-EmmaMultilingualNeural",
}
DEFAULT_VOICE = VOICES["dmitry"]
DEFAULT_RATE = "+8%"
# Если голос так и не ответил — берём запасной (сервис иногда не отдаёт русские голоса)
FALLBACK_VOICES = {
    VOICES["dmitry"]: VOICES["andrew"],
    VOICES["svetlana"]: VOICES["emma"],
}
TTS_RETRIES = 4

# --- Генерация сценария ---
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-flash-latest")
GEMINI_FALLBACK_MODEL = "gemini-flash-lite-latest"
GEMINI_TIMEOUT = 45  # секунд на одну модель
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.1")

# --- Распознавание речи (режим clip) ---
WHISPER_MODEL = "small"  # tiny / base / small / medium / large-v3


@dataclass
class SubtitleStyle:
    """Стиль субтитров. Цвета в формате ASS: &HAABBGGRR (синий-зелёный-красный)."""

    font_file: str = "Montserrat-ExtraBold.ttf"
    font_name: str = "Montserrat ExtraBold"
    fallback_font: str = "Arial"  # если файла шрифта нет в assets/fonts
    font_size: int = 124
    text_color: str = "&H00FFFFFF"  # белый
    active_color: str = "&H0000E6FF"  # ярко-жёлтый
    outline_color: str = "&H00000000"  # чёрная обводка
    outline: float = 7.0
    shadow: float = 2.0
    margin_h: int = 70
    uppercase: bool = True
    mode: str = "highlight"  # highlight / karaoke / word
    max_words: int = 3  # слов на экране одновременно
    max_chars: int = 16
    active_scale: int = 108  # увеличение активного слова, %


@dataclass
class RenderSettings:
    """Настройки сборки ролика."""

    width: int = 1080
    height: int = 1920
    fps: int = 30
    crf: int = 21
    preset: str = "veryfast"
    audio_bitrate: str = "192k"

    # Музыка: громкость в паузах и во время речи (volume ducking)
    music_volume: float = 0.30
    music_ducked_volume: float = 0.12
    duck_ramp: float = 0.25  # сек на плавное приглушение
    tail: float = 0.5  # пауза после последнего слова

    # Уникализация (случайные значения из диапазонов)
    uniquify: bool = True
    zoom_range: tuple[float, float] = (0.02, 0.03)
    speed: float = 1.01
    brightness_range: tuple[float, float] = (-0.02, 0.02)
    contrast_range: tuple[float, float] = (0.98, 1.04)
    saturation_range: tuple[float, float] = (0.97, 1.08)
