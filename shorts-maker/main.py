"""CLI: вертикальные видео из текста (make) и нарезка длинных видео (clip).

Примеры — в README.md, справка: python main.py make --help
"""
from __future__ import annotations

import argparse
import os
import shutil
import sys
import time
import uuid
from pathlib import Path

import config
from config import RenderSettings, SubtitleStyle


def _common_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("-o", "--output", type=Path, help="имя результата (по умолчанию в output/)")
    parser.add_argument("--fps", type=int, choices=(30, 60), default=30)
    parser.add_argument("--subs", choices=("highlight", "karaoke", "word"), default="highlight",
                        help="стиль субтитров")
    parser.add_argument("--no-uniquify", action="store_true", help="без зума, цветокоррекции и ускорения")
    parser.add_argument("--seed", type=int, help="повторяемый случайный выбор")
    parser.add_argument("--keep-temp", action="store_true", help="не удалять рабочие файлы")


def _voice_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--voice", default=config.DEFAULT_VOICE,
                        help=f"имя голоса edge-tts или {', '.join(config.VOICES)}")
    parser.add_argument("--rate", default=config.DEFAULT_RATE, help="скорость речи, например +10%% или -5%%")
    parser.add_argument("--background", type=Path, help="конкретный фон вместо случайного")
    parser.add_argument("--music", type=Path, help="конкретная музыка вместо случайной")
    parser.add_argument("--no-music", action="store_true")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="main.py", description="Бесплатный генератор вертикальных видео 9:16.")
    commands = parser.add_subparsers(dest="command", required=True)

    make = commands.add_parser("make", help="видео из текста")
    source = make.add_mutually_exclusive_group(required=True)
    source.add_argument("--text", help="готовый текст диктора")
    source.add_argument("--file", type=Path, help="файл с текстом (UTF-8)")
    source.add_argument("--topic", help="тема — текст напишет нейросеть")
    make.add_argument("--llm", choices=("gemini", "ollama"), default="gemini", help="кто пишет текст по --topic")
    make.add_argument("--language", default="русский", help="язык сценария для --topic")
    make.add_argument("--words", type=int, default=90, help="примерная длина сценария")
    _voice_options(make)
    _common_options(make)

    auto = commands.add_parser("auto", help="найти вирусную тему и сделать видео")
    auto.add_argument("--source", choices=("reddit", "google"), default="reddit")
    auto.add_argument("--subreddit", default="AskReddit")
    auto.add_argument("--time", dest="time_filter", default="day",
                      choices=("hour", "day", "week", "month", "year", "all"))
    auto.add_argument("--min-upvotes", type=int, default=2000)
    auto.add_argument("--min-comments", type=int, default=100)
    auto.add_argument("--geo", default="US", help="страна для Google Trends")
    auto.add_argument("--llm", choices=("gemini", "ollama"), default="gemini")
    auto.add_argument("--language", default="русский", help="язык сценария")
    auto.add_argument("--seconds", type=int, default=45, help="желаемая длина ролика")
    auto.add_argument("--list", action="store_true", help="только показать найденные темы")
    auto.add_argument("--script-only", action="store_true", help="написать сценарий без видео")
    _voice_options(auto)
    _common_options(auto)

    clip = commands.add_parser("clip", help="вырезать фрагмент из длинного видео")
    clip.add_argument("source", help="ссылка или путь к файлу")
    clip.add_argument("--start", required=True, help="начало: 90, 1:30, 00:01:30")
    clip.add_argument("--end", required=True, help="конец фрагмента")
    clip.add_argument("--model", default=config.WHISPER_MODEL, help="модель faster-whisper")
    clip.add_argument("--language", help="язык речи (ru, en); по умолчанию определяется сам")
    clip.add_argument("--no-subs", action="store_true")
    _common_options(clip)

    commands.add_parser("check", help="проверить окружение")
    return parser


def check_environment() -> int:
    from src.ffmpeg_utils import find_ffmpeg, has_filter

    print(f"Python:    {sys.version.split()[0]}")
    ffmpeg = find_ffmpeg()
    print(f"FFmpeg:    {ffmpeg}")
    problems = 0
    if not has_filter("subtitles"):
        print("  ОШИБКА: нет фильтра subtitles (libass)")
        problems += 1
    for module in ("edge_tts", "tqdm", "requests", "yt_dlp", "faster_whisper"):
        try:
            __import__(module)
            print(f"{module:15} OK")
        except Exception as error:  # сломанные DLL дают не только ImportError
            print(f"{module:15} НЕ РАБОТАЕТ: {error}")
            problems += 1
    for label, folder, extensions in (
        ("Фоны", config.BACKGROUNDS_DIR, config.VIDEO_EXTENSIONS),
        ("Музыка", config.MUSIC_DIR, config.AUDIO_EXTENSIONS),
        ("Шрифты", config.FONTS_DIR, {".ttf", ".otf"}),
    ):
        count = sum(1 for p in folder.glob("*") if p.suffix.lower() in extensions)
        print(f"{label}: {count} шт. ({folder})")
    return 1 if problems else 0


def produce_video(text: str, args: argparse.Namespace, output: Path, job_dir: Path,
                  settings: RenderSettings, style: SubtitleStyle) -> Path:
    """Общий конец make и auto: озвучка → субтитры → FFmpeg."""
    from src.tts import synthesize
    from src.video_editor import render_video

    voice_name = config.VOICES.get(args.voice.lower(), args.voice)
    voice_path = job_dir / "voice.mp3"
    words = synthesize(text, voice_name, args.rate, voice_path)
    result = render_video(
        voice_path, words, output, job_dir, settings, style,
        background=args.background, music=args.music,
        use_music=not args.no_music, seed=args.seed,
    )
    # сценарий рядом с видео — пригодится для описания ролика
    result.with_suffix(".txt").write_text(text, encoding="utf-8")
    return result


def find_topic(args: argparse.Namespace) -> tuple[str, str, str] | None:
    """Возвращает (ключ, материал, источник) для лучшей новой темы; None при --list."""
    from src import PipelineError
    from src.trend_finder import get_google_trends, get_reddit_trends, used_topics

    if args.source == "reddit":
        posts = get_reddit_trends(args.subreddit, args.time_filter, args.min_upvotes, args.min_comments)
        topics = [
            (f"reddit:{p.id}", f"{p.title}\n\n{p.text}".strip(), p.url,
             f"{p.upvotes:>7} ▲ {p.comments:>6} комм.  {p.title}")
            for p in posts
        ]
    else:
        topics = [
            (f"google:{args.geo.upper()}:{t.query.lower()}",
             f"Растущий поисковый запрос: {t.query}\n" + "\n".join(f"Новость: {n}" for n in t.news),
             f"Google Trends {args.geo.upper()}: {t.query}",
             f"{t.traffic:>8}  {t.query}")
            for t in get_google_trends(args.geo)
        ]
        # без новостей модели не о чем рассказывать, кроме выдумок
        topics.sort(key=lambda item: "Новость:" not in item[1])

    if not topics:
        raise PipelineError("Подходящих тем не найдено. Попробуй уменьшить --min-upvotes или --min-comments.")
    if args.list:
        for number, item in enumerate(topics[:20], 1):
            print(f"{number:2}. {item[3]}")
        return None

    used = used_topics()
    for key, material, origin, label in topics:
        if key not in used:
            print(f"Тема: {label.strip()}")
            return key, material, origin
    raise PipelineError("Все найденные темы уже использованы (output/used_topics.json).")


def run_auto(args: argparse.Namespace, output: Path, job_dir: Path,
             settings: RenderSettings, style: SubtitleStyle) -> Path | None:
    from src.script_gen import adapt_story
    from src.trend_finder import mark_used

    topic = find_topic(args)
    if topic is None:
        return None
    key, material, origin = topic
    text = adapt_story(material, args.llm, args.language, args.seconds)
    print(f"\n--- Сценарий ---\n{text}\n----------------\n")

    if args.script_only:
        result = output.with_suffix(".txt")
        result.parent.mkdir(parents=True, exist_ok=True)
        result.write_text(text, encoding="utf-8")
    else:
        result = produce_video(text, args, output, job_dir, settings, style)
        mark_used(key)
    result.with_suffix(".source.txt").write_text(origin + "\n", encoding="utf-8")
    return result


def run(args: argparse.Namespace) -> int:
    from src import PipelineError

    if args.command == "check":
        return check_environment()
    if args.command == "auto" and not args.list and args.llm == "gemini" and not os.environ.get("GEMINI_API_KEY"):
        raise PipelineError(
            "Для auto нужен GEMINI_API_KEY (или --llm ollama). Посмотреть темы без ключа: добавь --list."
        )

    settings = RenderSettings(fps=args.fps, uniquify=not args.no_uniquify)
    style = SubtitleStyle(mode=args.subs)
    stamp = f"{time.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:4]}"
    job_dir = config.TEMP_DIR / f"job_{stamp}"
    output =args.output or config.OUTPUT_DIR / f"{args.command}_{stamp}.mp4"
    if output.suffix.lower() != ".mp4":
        output = output.with_name(output.name + ".mp4")

    if args.command == "auto":
        result = run_auto(args, output, job_dir, settings, style)
        if result is None:  # --list: только показали темы
            return 0
    elif args.command == "make":
        from src.script_gen import clean_text, generate_script

        if args.topic:
            text = generate_script(args.topic, args.llm, args.language, args.words)
            print(f"\n--- Сценарий ---\n{text}\n----------------\n")
        elif args.file:
            try:
                text = clean_text(args.file.read_text(encoding="utf-8-sig"))
            except (OSError, UnicodeDecodeError) as error:
                raise PipelineError(f"Не удалось прочитать {args.file} (нужна кодировка UTF-8): {error}") from error
        else:
            text = clean_text(args.text)

        result = produce_video(text, args, output, job_dir, settings, style)
    else:
        from src.clipper import make_clip

        result = make_clip(
            args.source, args.start, args.end, output, job_dir, settings, style,
            model_name=args.model, language=args.language,
            subtitles=not args.no_subs, seed=args.seed,
        )

    if not args.keep_temp:
        shutil.rmtree(job_dir, ignore_errors=True)  # при ошибке папка остаётся для разбора
    print(f"\nГотово: {result}")
    return 0


def main() -> int:
    # консоль Windows и перенаправление в файл не должны падать на кириллице
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(errors="replace")
    args = build_parser().parse_args()
    try:
        from src import PipelineError
        try:
            return run(args)
        except PipelineError as error:
            print(f"\nОшибка: {error}", file=sys.stderr)
            return 1
    except ModuleNotFoundError as error:
        print(f"Не установлен модуль «{error.name}». Выполни: pip install -r requirements.txt", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\nОстановлено.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    sys.exit(main())
