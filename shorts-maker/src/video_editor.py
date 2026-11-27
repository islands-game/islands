"""Сборка ролика одним проходом чистого FFmpeg (без MoviePy — так быстрее)."""
from __future__ import annotations

import random
import shutil
from dataclasses import dataclass
from pathlib import Path

from tqdm import tqdm

import config
from config import RenderSettings, SubtitleStyle
from src import PipelineError
from src.ffmpeg_utils import has_filter, probe, run_ffmpeg
from src.subtitles import build_ass
from src.tts import Word


@dataclass
class Uniqueness:
    """Случайные микро-изменения для конкретного ролика."""

    zoom: float = 0.0
    shift_x: float = 0.5  # положение кропа внутри запаса от зума (0..1)
    shift_y: float = 0.5
    brightness: float = 0.0
    contrast: float = 1.0
    saturation: float = 1.0
    speed: float = 1.0

    @classmethod
    def create(cls, settings: RenderSettings, rng: random.Random) -> "Uniqueness":
        if not settings.uniquify:
            return cls()
        return cls(
            zoom=rng.uniform(*settings.zoom_range),
            shift_x=rng.uniform(0.2, 0.8),
            shift_y=rng.uniform(0.2, 0.8),
            brightness=rng.uniform(*settings.brightness_range),
            contrast=rng.uniform(*settings.contrast_range),
            saturation=rng.uniform(*settings.saturation_range),
            speed=settings.speed,
        )


def pick_file(folder: Path, extensions: set[str], rng: random.Random) -> Path | None:
    files = sorted(p for p in folder.glob("*") if p.suffix.lower() in extensions)
    return rng.choice(files) if files else None


def speech_intervals(words: list[Word], ramp: float, limit: int = 60) -> list[tuple[float, float]]:
    """Склеивает слова в отрезки речи; паузы короче порога не раздувают музыку."""
    gap = max(0.8, ramp * 2)
    while True:
        merged: list[list[float]] = []
        for word in words:
            if merged and word.start - merged[-1][1] <= gap:
                merged[-1][1] = max(merged[-1][1], word.end)
            else:
                merged.append([word.start, word.end])
        if len(merged) <= limit:
            return [(a, b) for a, b in merged]
        gap *= 1.5


def _balanced_sum(terms: list[str]) -> str:
    # сбалансированное дерево, чтобы не упереться в глубину парсера выражений
    if len(terms) == 1:
        return terms[0]
    half = len(terms) // 2
    return f"({_balanced_sum(terms[:half])}+{_balanced_sum(terms[half:])})"


def duck_expression(words: list[Word], settings: RenderSettings) -> str:
    """Громкость музыки во времени: тихо под голосом, громче в паузах."""
    high, low, ramp = settings.music_volume, settings.music_ducked_volume, settings.duck_ramp
    if not words:
        return f"{high}"
    terms = [
        f"clip(min((t-{a - ramp:.3f})/{ramp},({b + ramp:.3f}-t)/{ramp}),0,1)"
        for a, b in speech_intervals(words, ramp)
    ]
    return f"{high}-{high - low:.4f}*clip({_balanced_sum(terms)},0,1)"


def video_chain(settings: RenderSettings, unique: Uniqueness, subtitles_filter: str) -> str:
    """Заполняет кадр 9:16 (кроп по центру), цвет, субтитры, микросдвиг скорости."""
    width, height = settings.width, settings.height
    scaled_w = round(width * (1 + unique.zoom) / 2) * 2
    scaled_h = round(height * (1 + unique.zoom) / 2) * 2
    filters = [
        f"scale={scaled_w}:{scaled_h}:force_original_aspect_ratio=increase:flags=bicubic",
        f"crop={width}:{height}:(iw-ow)/2+({unique.shift_x:.3f}-0.5)*{scaled_w - width}"
        f":(ih-oh)/2+({unique.shift_y:.3f}-0.5)*{scaled_h - height}",
        "setsar=1",
    ]
    if settings.uniquify:
        filters.append(
            f"eq=brightness={unique.brightness:.4f}:contrast={unique.contrast:.4f}"
            f":saturation={unique.saturation:.4f}"
        )
    filters.append(f"fps={settings.fps}")
    # субтитры накладываются до ускорения, поэтому остаются синхронны с голосом
    filters.append(subtitles_filter)
    if unique.speed != 1.0:
        filters += [f"setpts=PTS/{unique.speed}", f"fps={settings.fps}"]
    filters.append("format=yuv420p")
    return ",".join(filters)


def prepare_job(job_dir: Path, words: list[Word], style: SubtitleStyle, settings: RenderSettings) -> str:
    """Кладёт subs.ass и шрифты в рабочую папку и возвращает фильтр субтитров.

    FFmpeg запускается из этой папки с относительными путями: так не нужно
    экранировать «C:», пробелы и кириллицу внутри фильтра.
    """
    if not has_filter("subtitles"):
        raise PipelineError("Эта сборка FFmpeg без libass — субтитры вшить нельзя. Нужна полная сборка.")
    fonts = job_dir / "fonts"
    fonts.mkdir(parents=True, exist_ok=True)
    for font in config.FONTS_DIR.glob("*"):
        if font.suffix.lower() in {".ttf", ".otf"}:
            shutil.copy2(font, fonts / font.name)
    build_ass(words, job_dir / "subs.ass", style, settings.width, settings.height)
    return "subtitles=subs.ass:fontsdir=fonts"


def encoder_args(settings: RenderSettings) -> list[str]:
    return [
        "-c:v", "libx264", "-preset", settings.preset, "-crf", str(settings.crf),
        "-pix_fmt", "yuv420p", "-r", str(settings.fps),
        "-c:a", "aac", "-b:a", settings.audio_bitrate, "-ar", "48000",
        "-movflags", "+faststart", "-map_metadata", "-1",
    ]


def render_video(
    voice: Path,
    words: list[Word],
    output: Path,
    job_dir: Path,
    settings: RenderSettings,
    style: SubtitleStyle,
    background: Path | None = None,
    music: Path | None = None,
    use_music: bool = True,
    seed: int | None = None,
) -> Path:
    """Фон + голос + музыка + субтитры → готовый MP4."""
    rng = random.Random(seed)
    background = background or pick_file(config.BACKGROUNDS_DIR, config.VIDEO_EXTENSIONS, rng)
    if background is None:
        raise PipelineError(
            f"Нет фонового видео в {config.BACKGROUNDS_DIR}.\n"
            "Положи туда файл или запусти: python tools/download_assets.py"
        )
    if use_music and music is None:
        music = pick_file(config.MUSIC_DIR, config.AUDIO_EXTENSIONS, rng)
        if music is None:
            tqdm.write("Музыки в assets/music нет — собираю только с голосом.")

    background = Path(background).resolve()
    info = probe(background)
    if not info.has_video:
        raise PipelineError(f"В файле фона нет видео: {background}")
    if music is not None:
        music = Path(music).resolve()
        if not probe(music).has_audio:
            raise PipelineError(f"В файле музыки нет звука: {music}")

    unique = Uniqueness.create(settings, rng)
    total = probe(voice).duration + settings.tail
    final_duration = total / unique.speed
    subtitles_filter = prepare_job(job_dir, words, style, settings)

    inputs: list[str] = []
    if info.duration > total + 1:
        inputs += ["-ss", f"{rng.uniform(0, info.duration - total - 0.5):.2f}"]  # случайный отрезок
    else:
        inputs += ["-stream_loop", "-1"]  # короткий фон зацикливаем
    inputs += ["-t", f"{total + 0.5:.3f}", "-i", str(background), "-i", str(Path(voice).resolve())]

    speed = f",atempo={unique.speed}" if unique.speed != 1.0 else ""
    graph = [f"[0:v]{video_chain(settings, unique, subtitles_filter)}[v]"]
    voice_chain = f"[1:a]aresample=48000,aformat=channel_layouts=stereo,apad=whole_dur={total:.3f}"

    if music is None:
        graph.append(f"{voice_chain}{speed}[a]")
    else:
        inputs += ["-stream_loop", "-1", "-i", str(music)]
        fade_start = max(0.0, total - 1.0)
        graph += [
            f"{voice_chain}[voice]",
            f"[2:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:{total:.3f},"
            f"volume='{duck_expression(words, settings)}':eval=frame,"
            f"afade=t=out:st={fade_start:.3f}:d=1[music]",
            f"[voice][music]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95:level=false{speed}[a]",
        ]

    (job_dir / "graph.txt").write_text(";\n".join(graph), encoding="utf-8")
    output = Path(output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    run_ffmpeg(
        [*inputs, "-filter_complex", ";".join(graph), "-map", "[v]", "-map", "[a]",
         "-t", f"{final_duration:.3f}", *encoder_args(settings), str(output)],
        final_duration, "Рендер", cwd=job_dir,
    )
    return output
