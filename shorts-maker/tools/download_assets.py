"""Скачивает тестовый фон (геймплей NodeCore, CC BY 3.0) и шрифт Montserrat (OFL).

  python tools/download_assets.py              скачать (спросит подтверждение)
  python tools/download_assets.py --generate   без интернета: нарисовать фон FFmpeg'ом
"""
from __future__ import annotations

import argparse
import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import requests  # noqa: E402
from tqdm import tqdm  # noqa: E402

import config  # noqa: E402
from src import PipelineError  # noqa: E402
from src.ffmpeg_utils import run_ffmpeg  # noqa: E402

HEADERS = {"User-Agent": "shorts-maker/1.0"}
FONT_URL = "https://github.com/JulietaUla/Montserrat/raw/master/fonts/ttf/Montserrat-ExtraBold.ttf"
FONT_LICENSE_URL = "https://github.com/JulietaUla/Montserrat/raw/master/OFL.txt"
BACKGROUND_TITLE = "File:NodeCore- Fire Basics.webm"  # ~58 МБ, 160 с, 1280x720
BACKGROUND_FILE = "gameplay_nodecore.webm"


def download(url: str, target: Path) -> None:
    if target.is_file() and target.stat().st_size > 0:
        print(f"Уже есть: {target.name}")
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_name(target.name + ".part")
    with requests.get(url, headers=HEADERS, stream=True, timeout=60) as response:
        response.raise_for_status()
        total = int(response.headers.get("content-length", 0)) or None
        with partial.open("wb") as file, tqdm(total=total, unit="B", unit_scale=True, desc=target.name) as bar:
            for chunk in response.iter_content(1 << 16):
                file.write(chunk)
                bar.update(len(chunk))
    partial.replace(target)


def background_info() -> tuple[str, str, str, int]:
    """Прямая ссылка, автор, лицензия и размер — из API Wikimedia Commons."""
    response = requests.get(
        "https://commons.wikimedia.org/w/api.php",
        headers=HEADERS, timeout=30,
        params={"action": "query", "format": "json", "titles": BACKGROUND_TITLE,
                "prop": "imageinfo", "iiprop": "url|size|extmetadata"},
    )
    response.raise_for_status()
    info = next(iter(response.json()["query"]["pages"].values()))["imageinfo"][0]
    meta = info.get("extmetadata", {})
    author = html.unescape(re.sub(r"<[^>]+>", "", meta.get("Artist", {}).get("value", "неизвестен"))).strip()
    license_name = meta.get("LicenseShortName", {}).get("value", "см. страницу файла")
    return info["url"].split("?")[0], author, license_name, info["size"]


def generate_background() -> None:
    """Плавный анимированный градиент — полностью свой, без чьих-либо прав."""
    target = config.BACKGROUNDS_DIR / "generated_gradient.mp4"
    run_ffmpeg(
        ["-f", "lavfi", "-i",
         "gradients=s=540x960:c0=0x0f2027:c1=0x2c5364:c2=0x6a3093:c3=0x11998e:n=4:speed=0.03:r=30:d=30",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", str(target)],
        30, "Генерация фона",
    )
    print(f"Фон создан: {target}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--generate", action="store_true", help="сгенерировать фон без скачивания")
    parser.add_argument("-y", "--yes", action="store_true", help="не спрашивать подтверждение")
    args = parser.parse_args()
    try:
        if args.generate:
            generate_background()
            return 0
        url, author, license_name, size = background_info()
        print("Будет скачано:")
        print(f"  фон:   {BACKGROUND_FILE} ({size / 1e6:.0f} МБ), {license_name}, автор: {author}, Wikimedia Commons")
        print("  шрифт: Montserrat-ExtraBold.ttf (0.5 МБ), SIL OFL, github.com/JulietaUla/Montserrat")
        if not args.yes and input("Скачать? [y/N] ").strip().lower() not in {"y", "yes", "д", "да"}:
            print("Отменено.")
            return 1

        download(FONT_URL, config.FONTS_DIR / "Montserrat-ExtraBold.ttf")
        download(FONT_LICENSE_URL, config.FONTS_DIR / "Montserrat-OFL.txt")
        try:
            download(url, config.BACKGROUNDS_DIR / BACKGROUND_FILE)
        except requests.HTTPError as error:
            print(f"Фон не скачался: {error}\n"
                  "Wikimedia иногда ограничивает частоту запросов — повтори позже "
                  "или создай свой фон: python tools/download_assets.py --generate", file=sys.stderr)
            return 1
        (config.BACKGROUNDS_DIR / "CREDITS.txt").write_text(
            f"{BACKGROUND_FILE}: «{BACKGROUND_TITLE.removeprefix('File:')}», автор {author}, "
            f"лицензия {license_name}, Wikimedia Commons.\n"
            "Лицензия CC BY требует указывать автора в описании ролика.\n",
            encoding="utf-8",
        )
        print("Готово. Автор фона записан в assets/backgrounds/CREDITS.txt")
        return 0
    except (requests.RequestException, KeyError, StopIteration, PipelineError, OSError) as error:
        print(f"Ошибка: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
