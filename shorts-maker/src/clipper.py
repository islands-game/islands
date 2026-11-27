"""Режим clip: скачать длинное видео → распознать речь → вырезать вертикальный фрагмент."""
from __future__ import annotations

import random
import re
import wave
from pathlib import Path

from tqdm import tqdm

import config
from config import RenderSettings, SubtitleStyle
from src import PipelineError
from src.ffmpeg_utils import ffmpeg_dir_for_ytdlp, probe, run_ffmpeg
from src.tts import Word
from src.video_editor import Uniqueness, encoder_args, prepare_job, video_chain


def parse_time(value: str) -> float:
    """Принимает 90, 1:30 или 00:01:30.5."""
    parts = value.strip().replace(",", ".").split(":")
    if len(parts) > 3 or not all(re.fullmatch(r"\d+(\.\d+)?", p) for p in parts):
        raise PipelineError(f"Не понимаю таймкод: {value!r}. Примеры: 90, 1:30, 00:01:30")
    seconds = 0.0
    for part in parts:
        seconds = seconds * 60 + float(part)
    return seconds


def download(source: str, job_dir: Path) -> Path:
    """Скачивает видео по ссылке; локальный файл возвращается как есть."""
    if not re.match(r"https?://", source, re.I):
        path = Path(source).expanduser().resolve()
        if not path.is_file():
            raise PipelineError(f"Это не ссылка и не файл: {source}")
        return path
    try:
        import yt_dlp
    except ImportError as error:
        raise PipelineError("Не установлен yt-dlp: pip install -r requirements.txt") from error

    bar: tqdm | None = None

    def hook(state: dict) -> None:
        nonlocal bar
        if state["status"] == "downloading":
            if bar is None:
                bar = tqdm(desc="Скачивание", unit="B", unit_scale=True,
                           total=state.get("total_bytes") or state.get("total_bytes_estimate"))
            bar.update(max(0, state.get("downloaded_bytes", 0) - bar.n))
        elif state["status"] == "finished" and bar is not None:
            bar.close()
            bar = None

    options = {
        "format": "bv*[height<=1080]+ba/b[height<=1080]/b",
        "merge_output_format": "mp4",
        "outtmpl": str(job_dir / "source.%(ext)s"),
        "ffmpeg_location": ffmpeg_dir_for_ytdlp(),
        "noplaylist": True,
        "quiet": True,
        "noprogress": True,
        "progress_hooks": [hook],
        "js_runtimes": {"deno": {}, "node": {}},  # нужно для YouTube
    }
    try:
        with yt_dlp.YoutubeDL(options) as loader:
            loader.download([source])
    except yt_dlp.utils.DownloadError as error:
        raise PipelineError(f"Не удалось скачать видео: {error}") from error

    files = [p for p in job_dir.glob("source.*") if p.suffix.lower() in config.VIDEO_EXTENSIONS]
    if not files:
        raise PipelineError("yt-dlp завершился, но видеофайл не найден.")
    return max(files, key=lambda p: p.stat().st_size)


def transcribe(audio: Path, model_name: str, language: str | None, duration: float) -> list[Word]:
    """Локальное распознавание через faster-whisper (модель скачивается один раз)."""
    try:
        import numpy as np
        from faster_whisper import WhisperModel
    except ImportError as error:
        raise PipelineError("Не установлен faster-whisper: pip install -r requirements.txt") from error

    tqdm.write(f"Загружаю модель Whisper «{model_name}» (первый раз — скачивание)...")
    try:
        model = WhisperModel(model_name, device="auto", compute_type="int8")
    except Exception as error:
        raise PipelineError(f"Не удалось загрузить модель Whisper: {error}") from error

    # WAV (16 кГц, моно, 16 бит) читаем сами: декодер faster-whisper несовместим с новым PyAV
    with wave.open(str(audio), "rb") as file:
        samples = np.frombuffer(file.readframes(file.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0

    segments, _ = model.transcribe(samples, language=language, word_timestamps=True, vad_filter=True)
    words: list[Word] = []
    with tqdm(total=round(duration, 1), desc="Распознавание", unit="с") as bar:
        for segment in segments:
            for item in segment.words or []:
                text = item.word.strip()
                if text:
                    words.append(Word(text, item.start, item.end))
            bar.update(max(0.0, round(min(segment.end, duration) - bar.n, 1)))
    return words


def make_clip(
    source: str,
    start: str,
    end: str,
    output: Path,
    job_dir: Path,
    settings: RenderSettings,
    style: SubtitleStyle,
    model_name: str = config.WHISPER_MODEL,
    language: str | None = None,
    subtitles: bool = True,
    seed: int | None = None,
) -> Path:
    begin, finish = parse_time(start), parse_time(end)
    if finish <= begin:
        raise PipelineError("Конец фрагмента должен быть позже начала.")

    job_dir.mkdir(parents=True, exist_ok=True)
    video = download(source, job_dir)
    info = probe(video)
    if not info.has_video or not info.has_audio:
        raise PipelineError("В исходном файле должны быть и видео, и звук.")
    if begin >= info.duration:
        raise PipelineError(f"Начало за пределами видео (длина {info.duration:.0f} с).")
    duration = min(finish, info.duration) - begin

    unique = Uniqueness.create(settings, random.Random(seed))
    words: list[Word] = []
    if subtitles:
        audio = job_dir / "segment.wav"
        run_ffmpeg(
            ["-ss", f"{begin:.3f}", "-t", f"{duration:.3f}", "-i", str(video),
             "-vn", "-ac", "1", "-ar", "16000", str(audio)],
            duration, "Извлечение звука", cwd=job_dir,
        )
        words = transcribe(audio, model_name, language, duration)
        if not words:
            tqdm.write("Речь не распознана — собираю без субтитров.")

    subtitles_filter = prepare_job(job_dir, words, style, settings) if words else "null"
    final_duration = duration / unique.speed
    audio_filter = "aresample=48000,aformat=channel_layouts=stereo"
    if unique.speed != 1.0:
        audio_filter += f",atempo={unique.speed}"

    output = Path(output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    run_ffmpeg(
        ["-ss", f"{begin:.3f}", "-t", f"{duration:.3f}", "-i", str(video),
         "-filter_complex",
         f"[0:v]{video_chain(settings, unique, subtitles_filter)}[v];[0:a]{audio_filter}[a]",
         "-map", "[v]", "-map", "[a]", "-t", f"{final_duration:.3f}",
         *encoder_args(settings), str(output)],
        final_duration, "Рендер", cwd=job_dir,
    )
    return output
