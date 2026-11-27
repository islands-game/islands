"""Поиск FFmpeg, чтение информации о файле и запуск с прогресс-баром."""
from __future__ import annotations

import os
import re
import shutil
import subprocess
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from tqdm import tqdm

import config
from src import PipelineError


@lru_cache(maxsize=1)
def find_ffmpeg() -> str:
    """Порядок: переменная SHORTS_FFMPEG → PATH → бинарник из imageio-ffmpeg."""
    custom = os.environ.get("SHORTS_FFMPEG")
    if custom:
        if not Path(custom).is_file():
            raise PipelineError(f"SHORTS_FFMPEG указывает на несуществующий файл: {custom}")
        return custom
    system = shutil.which("ffmpeg")
    if system:
        return system
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except (ImportError, RuntimeError) as error:
        raise PipelineError(
            "FFmpeg не найден. Установи его (Windows: winget install Gyan.FFmpeg) "
            "или выполни pip install -r requirements.txt."
        ) from error


def ffmpeg_dir_for_ytdlp() -> str:
    """yt-dlp ищет файл с именем ffmpeg — для встроенного бинарника делаем копию."""
    exe = Path(find_ffmpeg())
    if exe.stem.lower() == "ffmpeg":
        return str(exe.parent)
    target = config.TEMP_DIR / "bin" / ("ffmpeg" + exe.suffix)
    if not target.exists() or target.stat().st_size != exe.stat().st_size:
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(exe, target)
    return str(target.parent)


def has_filter(name: str) -> bool:
    result = subprocess.run(
        [find_ffmpeg(), "-hide_banner", "-filters"],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    return re.search(rf"^\s*\S+\s+{re.escape(name)}\s", result.stdout, re.M) is not None


@dataclass
class MediaInfo:
    duration: float
    width: int = 0
    height: int = 0
    has_audio: bool = False
    has_video: bool = False


def probe(path: Path) -> MediaInfo:
    """Информация о файле через `ffmpeg -i` (ffprobe есть не во всех сборках)."""
    if not Path(path).is_file():
        raise PipelineError(f"Файл не найден: {path}")
    result = subprocess.run(
        [find_ffmpeg(), "-hide_banner", "-i", str(path)],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    log = result.stderr
    match = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", log)
    if not match:
        raise PipelineError(f"Не удалось прочитать медиафайл: {path}")
    hours, minutes, seconds = match.groups()
    info = MediaInfo(duration=int(hours) * 3600 + int(minutes) * 60 + float(seconds))
    video = re.search(r"Stream #.*?Video:.*?\b(\d{2,5})x(\d{2,5})\b", log)
    if video:
        info.has_video = True
        info.width, info.height = int(video.group(1)), int(video.group(2))
    info.has_audio = re.search(r"Stream #.*?Audio:", log) is not None
    return info


def run_ffmpeg(args: list[str], duration: float, description: str, cwd: Path | None = None) -> None:
    """Запускает FFmpeg и показывает прогресс по выходному времени."""
    command = [
        find_ffmpeg(), "-hide_banner", "-nostdin", "-y", "-loglevel", "error",
        "-progress", "pipe:1", "-nostats", *args,
    ]
    log_path = Path(cwd or config.TEMP_DIR) / "ffmpeg.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)

    with log_path.open("w", encoding="utf-8") as log:
        process = subprocess.Popen(
            command, cwd=cwd, stdout=subprocess.PIPE, stderr=log,
            text=True, encoding="utf-8", errors="replace",
        )
        total = round(max(duration, 0.1), 1)
        try:
            with tqdm(total=total, desc=description, unit="с",
                      bar_format="{desc}: {percentage:3.0f}%|{bar}| {n:.1f}/{total:.1f} с [{elapsed}]") as bar:
                for line in process.stdout:
                    key, _, value = line.strip().partition("=")
                    if key == "out_time_us" and value.isdigit():
                        bar.update(max(0.0, min(total, int(value) / 1_000_000) - bar.n))
                    elif key == "progress" and value == "end":
                        bar.update(total - bar.n)
            process.wait()
        except BaseException:
            process.kill()
            process.wait()
            raise

    if process.returncode != 0:
        tail = "\n".join(log_path.read_text(encoding="utf-8", errors="replace").splitlines()[-15:])
        raise PipelineError(f"FFmpeg завершился с ошибкой (полный лог: {log_path}):\n{tail}")
