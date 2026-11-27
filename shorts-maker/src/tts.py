"""Озвучка через edge-tts и таймкоды слов."""
from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from pathlib import Path

import edge_tts
from tqdm import tqdm

import config
from src import PipelineError


@dataclass
class Word:
    text: str
    start: float  # секунды
    end: float


async def _stream(text: str, voice: str, rate: str, audio_path: Path) -> list[Word]:
    # edge-tts 7.x по умолчанию отдаёт границы предложений — просим именно слова
    communicate = edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary")
    words: list[Word] = []
    with audio_path.open("wb") as audio, tqdm(desc="Озвучка", unit="сл") as bar:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                start = chunk["offset"] / 10_000_000  # единицы по 100 нс
                words.append(Word(chunk["text"], start, start + chunk["duration"] / 10_000_000))
                bar.update(1)
    return words


def restore_punctuation(text: str, words: list[Word]) -> list[Word]:
    """edge-tts отдаёт слова без знаков препинания — берём их из исходного текста."""
    lower = text.lower()
    position = 0
    spans: list[tuple[int, int] | None] = []
    for word in words:
        index = lower.find(word.text.lower(), position)
        if index < 0 or index - position > 80:
            spans.append(None)
            continue
        position = index + len(word.text)
        spans.append((index, position))

    for word, span in zip(words, spans):
        if span is None:
            continue
        end = span[1]
        while end < len(text) and text[end] in ".,!?…:;%»\")":
            end += 1
        word.text = text[span[0]:end]
    return words


def synthesize(text: str, voice: str, rate: str, audio_path: Path, fallback: bool = True) -> list[Word]:
    """Создаёт MP3 с озвучкой и возвращает слова с таймкодами.

    Сервис Microsoft бывает нестабилен: повторяем запрос, а если голос так и
    не ответил, переключаемся на запасной из config.FALLBACK_VOICES.
    """
    if not text.strip():
        raise PipelineError("Пустой текст — нечего озвучивать.")
    audio_path.parent.mkdir(parents=True, exist_ok=True)

    voices = [voice]
    if fallback and voice in config.FALLBACK_VOICES:
        voices.append(config.FALLBACK_VOICES[voice])

    last_error: Exception | None = None
    for number, current in enumerate(voices):
        if number:
            tqdm.write(f"ВНИМАНИЕ: голос {voice} не отвечает, озвучиваю запасным {current}.")
        for attempt in range(1, config.TTS_RETRIES + 1):
            try:
                words = asyncio.run(_stream(text, current, rate, audio_path))
                if not words or audio_path.stat().st_size == 0:
                    raise PipelineError("edge-tts не вернул аудио или таймкоды слов.")
                return restore_punctuation(text, words)
            except ValueError as error:  # неверный голос или формат rate
                raise PipelineError(f"Проверь параметры голоса: {error}") from error
            except Exception as error:  # сетевые ошибки сервиса — повторяем
                last_error = error
                if attempt < config.TTS_RETRIES:
                    tqdm.write(f"Озвучка: ошибка ({error}), повтор {attempt + 1}/{config.TTS_RETRIES}...")
                    time.sleep(attempt)
    raise PipelineError(
        f"Озвучка не удалась: {last_error}\n"
        "Проверь интернет, имя голоса и совпадение языка текста с голосом."
    ) from last_error
