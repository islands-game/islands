"""Сборка .ass с пословной подсветкой.

Режимы:
  highlight — на экране 2–3 слова, произносимое окрашено и чуть увеличено;
  karaoke   — классические теги {\\k}: слова закрашиваются по мере произнесения;
  word      — по одному слову с эффектом «выпрыгивания».
"""
from __future__ import annotations

from pathlib import Path

import config
from config import SubtitleStyle
from src import PipelineError
from src.tts import Word


def font_for(style: SubtitleStyle) -> tuple[str, int]:
    """Имя шрифта и флаг жирности. Без файла шрифта берём системный жирный."""
    if (config.FONTS_DIR / style.font_file).is_file():
        return style.font_name, 0
    return style.fallback_font, -1


def _timestamp(seconds: float) -> str:
    centis = max(0, round(seconds * 100))
    hours, rest = divmod(centis, 360_000)
    minutes, rest = divmod(rest, 6_000)
    secs, centis = divmod(rest, 100)
    return f"{hours}:{minutes:02d}:{secs:02d}.{centis:02d}"


def _clean(text: str, upper: bool) -> str:
    # фигурные скобки и обратный слеш — служебные символы ASS
    text = text.replace("{", "(").replace("}", ")").replace("\\", "/").replace("\n", " ").strip()
    return text.upper() if upper else text


def group_words(words: list[Word], style: SubtitleStyle) -> list[list[Word]]:
    """Делит слова на короткие «кадры»: по длине, паузам и концу предложения."""
    groups: list[list[Word]] = []
    current: list[Word] = []
    for word in words:
        if current:
            length = sum(len(w.text) for w in current) + len(current) + len(word.text)
            if (
                len(current) >= style.max_words
                or length > style.max_chars
                or word.start - current[-1].end > 0.6
                or current[-1].text.rstrip("\"»)").endswith((".", "!", "?", "…"))
            ):
                groups.append(current)
                current = []
        current.append(word)
    if current:
        groups.append(current)
    return groups


def _events(words: list[Word], style: SubtitleStyle) -> list[tuple[float, float, str]]:
    if style.mode == "word":
        groups = [[word] for word in words]
    else:
        groups = group_words(words, style)

    events: list[tuple[float, float, str]] = []
    for index, group in enumerate(groups):
        next_start = groups[index + 1][0].start if index + 1 < len(groups) else None
        end = group[-1].end + 0.25
        if next_start is not None:
            # короткие паузы закрываем, чтобы текст не мигал
            end = next_start if next_start - group[-1].end < 0.4 else min(end, next_start)
        texts = [_clean(word.text, style.uppercase) for word in group]

        if style.mode == "word":
            pop = r"{\c" + style.active_color + r"&\fscx80\fscy80\t(0,90,\fscx112\fscy112)\t(90,160,\fscx100\fscy100)}"
            events.append((group[0].start, end, pop + texts[0]))
        elif style.mode == "karaoke":
            parts, cursor = [], group[0].start
            for i, (word, text) in enumerate(zip(group, texts)):
                boundary = group[i + 1].start if i + 1 < len(group) else word.end
                parts.append(f"{{\\k{max(1, round((boundary - cursor) * 100))}}}{text}")
                cursor = boundary
            events.append((group[0].start, end, " ".join(parts)))
        else:
            for i, word in enumerate(group):
                stop = group[i + 1].start if i + 1 < len(group) else end
                scale = style.active_scale
                parts = [
                    f"{{\\c{style.active_color}&\\fscx{scale}\\fscy{scale}}}{text}{{\\r}}" if j == i else text
                    for j, text in enumerate(texts)
                ]
                events.append((word.start, stop, " ".join(parts)))
    return events


def build_ass(words: list[Word], path: Path, style: SubtitleStyle, width: int, height: int) -> Path:
    if not words:
        raise PipelineError("Нет слов для субтитров.")
    if style.mode not in {"highlight", "karaoke", "word"}:
        raise PipelineError(f"Неизвестный режим субтитров: {style.mode}")

    name, bold = font_for(style)
    scale = width / 1080
    # в karaoke Primary = уже произнесённое, Secondary = ещё нет
    primary = style.active_color if style.mode == "karaoke" else style.text_color
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Main,{name},{round(style.font_size * scale)},{primary},{style.text_color},{style.outline_color},&H80000000,{bold},0,0,0,100,100,0,0,1,{style.outline * scale:.1f},{style.shadow * scale:.1f},5,{round(style.margin_h * scale)},{round(style.margin_h * scale)},0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = [
        f"Dialogue: 0,{_timestamp(start)},{_timestamp(end)},Main,,0,0,0,,{text}"
        for start, end, text in _events(words, style)
        if end - start >= 0.01
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(header + "\n".join(lines) + "\n", encoding="utf-8-sig")
    return path
