"""Локальный веб-интерфейс: `python main.py ui`.

Сервер слушает только 127.0.0.1, работает на стандартной библиотеке. Рендер
запускается отдельным процессом main.py — так его можно отменить.
"""
from __future__ import annotations

import json
import os
import re
import secrets
import shutil
import signal
import subprocess
import sys
import threading
import time
import uuid
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

import config
from src import PipelineError, keys

PAGE = config.ROOT / "ui" / "index.html"
TOKEN = secrets.token_urlsafe(24)  # чужая страница в браузере не сможет слать нам команды
MAX_BODY = 200_000
FOLDERS = {"backgrounds": config.BACKGROUNDS_DIR, "music": config.MUSIC_DIR, "output": config.OUTPUT_DIR}


def _names(folder: Path, extensions: set[str]) -> list[str]:
    return sorted(p.name for p in folder.glob("*") if p.suffix.lower() in extensions)


def _choice(data: dict, key: str, allowed: tuple, default):
    value = data.get(key, default)
    if value not in allowed:
        raise PipelineError(f"Недопустимое значение «{key}»: {value!r}")
    return value


def _text(data: dict, key: str, limit: int = 2000) -> str:
    value = data.get(key, "")
    if not isinstance(value, str):
        raise PipelineError(f"Поле «{key}» должно быть строкой.")
    if len(value) > limit:
        raise PipelineError(f"Поле «{key}» длиннее {limit} символов.")
    return value.strip()


def _asset(data: dict, key: str, folder: Path, extensions: set[str]) -> Path | None:
    name = _text(data, key, 300)
    if not name:
        return None
    if name not in _names(folder, extensions):
        raise PipelineError(f"Нет такого файла: {name}")
    return folder / name


class Job:
    """Один запуск main.py: разбирает его вывод в проценты и сообщения."""

    def __init__(self, arguments: list[str], output: Path, topic_key: str = "", cleanup: Path | None = None):
        self.output, self.topic_key, self.cleanup = output, topic_key, cleanup
        self.state = "running"  # running / done / error / cancelled
        self.stage, self.percent = "Запуск", None
        self.log: list[str] = []
        self.old_jobs = set(config.TEMP_DIR.glob("job_*"))  # чтобы после отмены убрать только своё
        env ={**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUNBUFFERED": "1",
               "HF_HUB_DISABLE_SYMLINKS_WARNING": "1"}
        self.process = subprocess.Popen(
            [sys.executable, "-B", str(config.ROOT / "main.py"), *arguments],
            cwd=config.ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            start_new_session=os.name != "nt",
        )
        threading.Thread(target=self._read, daemon=True).start()

    def _line(self, raw: bytes) -> None:
        line = raw.decode("utf-8", errors="replace").strip()
        if not line:
            return
        progress = re.match(r"^([^:|]+):\s*(?:(\d+)%\||\d)", line)
        if progress and ("|" in line or "[" in line):  # строка tqdm
            self.stage = progress.group(1)
            self.percent = int(progress.group(2)) if progress.group(2) else None
        else:
            self.log = [*self.log, line][-30:]

    def _read(self) -> None:
        buffer = b""
        while chunk := self.process.stdout.read1(4096):
            *lines, buffer = re.split(rb"[\r\n]", buffer + chunk)
            for line in lines:
                self._line(line)
        self._line(buffer)
        code = self.process.wait()
        if self.cleanup:
            self.cleanup.unlink(missing_ok=True)
        if self.state == "cancelled":
            self.output.unlink(missing_ok=True)  # недописанный MP4 не открывается
            for folder in set(config.TEMP_DIR.glob("job_*")) - self.old_jobs:
                shutil.rmtree(folder, ignore_errors=True)
            return
        if code == 0 and self.output.is_file():
            if self.topic_key:
                from src.trend_finder import mark_used

                mark_used(self.topic_key)
            self.state = "done"
        else:
            self.output.unlink(missing_ok=True)  # рабочая папка с логом остаётся для разбора
            self.state = "error"

    def cancel(self) -> None:
        if self.state != "running":
            return
        self.state = "cancelled"
        if os.name == "nt":  # вместе с дочерним FFmpeg
            subprocess.run(["taskkill", "/T", "/F", "/PID", str(self.process.pid)], capture_output=True)
        else:
            os.killpg(self.process.pid, signal.SIGTERM)

    def status(self) -> dict:
        return {"state": self.state, "stage": self.stage, "percent": self.percent, "log": self.log,
                "file": self.output.name if self.state == "done" else None}


class App:
    job: Job | None = None
    lock = threading.Lock()

    def state(self) -> dict:
        # файл, который ещё пишется, не показываем: плеер не сможет его открыть
        writing = self.job.output if self.job and self.job.state == "running" else None
        videos = sorted((p for p in config.OUTPUT_DIR.glob("*.mp4") if p != writing),
                        key=lambda p: p.stat().st_mtime, reverse=True)
        return {
            "voices": config.VOICES,
            "backgrounds": _names(config.BACKGROUNDS_DIR, config.VIDEO_EXTENSIONS),
            "music": _names(config.MUSIC_DIR, config.AUDIO_EXTENSIONS),
            "videos": [{"name": p.name, "size": p.stat().st_size,
                        "time": time.strftime("%d.%m %H:%M", time.localtime(p.stat().st_mtime))}
                       for p in videos[:30]],
            "keys": keys.status(),
            "job": self.job.status() if self.job else None,
        }

    def start(self, data: dict) -> dict:
        kind = _choice(data, "kind", ("make", "clip"), "make")
        output = config.OUTPUT_DIR / f"{kind}_{time.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:4]}.mp4"
        common = [
            f"--output={output}",
            f"--fps={_choice(data, 'fps', (30, 60), 30)}",
            f"--subs={_choice(data, 'subs', ('highlight', 'karaoke', 'word'), 'highlight')}",
        ]
        if not data.get("uniquify", True):
            common.append("--no-uniquify")

        with self.lock:
            if self.job and self.job.state == "running":
                raise PipelineError("Уже идёт сборка. Дождись конца или отмени.")
            cleanup, topic_key = None, ""
            if kind == "make":
                text = _text(data, "text", 8000)
                if not text:
                    raise PipelineError("Напиши текст для озвучки.")
                voice = _choice(data, "voice", tuple(config.VOICES), "dmitry")
                rate = data.get("rate", 8)
                if not isinstance(rate, int) or not -50 <= rate <= 100:
                    raise PipelineError("Скорость речи — от -50 до 100 процентов.")
                cleanup = config.TEMP_DIR / f"ui_{uuid.uuid4().hex}.txt"
                arguments = ["make", f"--file={cleanup}", f"--voice={voice}", f"--rate={rate:+d}%", *common]
                background = _asset(data, "background", config.BACKGROUNDS_DIR, config.VIDEO_EXTENSIONS)
                music = _asset(data, "music", config.MUSIC_DIR, config.AUDIO_EXTENSIONS)
                if background:
                    arguments.append(f"--background={background}")
                if data.get("noMusic"):
                    arguments.append("--no-music")
                elif music:
                    arguments.append(f"--music={music}")
                topic_key = _text(data, "topicKey", 300)
                # пишем файл, только когда все поля уже проверены
                config.TEMP_DIR.mkdir(parents=True, exist_ok=True)
                cleanup.write_text(text, encoding="utf-8")
            else:
                source = _text(data, "source").strip('"')
                start, end = _text(data, "start", 20), _text(data, "end", 20)
                if not source or not start or not end:
                    raise PipelineError("Укажи ссылку или файл, начало и конец фрагмента.")
                from src.clipper import parse_time

                if parse_time(end) <= parse_time(start):
                    raise PipelineError("Конец фрагмента должен быть позже начала.")
                model = _choice(data, "model", ("tiny", "base", "small", "medium"), "small")
                language = _choice(data, "language", ("", "ru", "en", "ka"), "")
                arguments = ["clip", f"--start={start}", f"--end={end}", f"--model={model}", *common]
                if language:
                    arguments.append(f"--language={language}")
                if not data.get("subtitles", True):
                    arguments.append("--no-subs")
                arguments += ["--", source]  # после -- источник не примут за опцию
            self.job = Job(arguments, output, topic_key, cleanup)
        return self.job.status()

    def trends(self, data: dict) -> dict:
        from src import trend_finder as finder

        used = finder.used_topics()
        if _choice(data, "source", ("google", "reddit"), "google") == "google":
            geo = _text(data, "geo", 2) or "US"
            items = [
                {"key": f"google:{geo.upper()}:{t.query.lower()}", "title": t.query, "info": t.traffic,
                 "material": f"Растущий поисковый запрос: {t.query}\n" + "\n".join(f"Новость: {n}" for n in t.news),
                 "details": " · ".join(t.news[:2])}
                for t in finder.get_google_trends(geo)
            ]
        else:
            posts = finder.get_reddit_trends(_text(data, "subreddit", 60) or "AskReddit")
            items = [
                {"key": f"reddit:{p.id}", "title": p.title, "info": f"▲ {p.upvotes} · {p.comments} комм.",
                 "material": f"{p.title}\n\n{p.text}".strip()[:8000], "details": p.text[:200]}
                for p in posts
            ]
        for item in items:
            item["used"] = item["key"] in used
        return {"items": items[:20]}

    def script(self, data: dict) -> dict:
        from src.script_gen import adapt_story, generate_script

        provider = _choice(data, "llm", ("gemini", "ollama"), "gemini")
        language = _choice(data, "language", ("русский", "english", "ქართული"), "русский")
        material = _text(data, "material", 8000)
        if material:
            return {"text": adapt_story(material, provider, language, 45)}
        topic = _text(data, "topic", 300)
        if not topic:
            raise PipelineError("Напиши тему.")
        return {"text": generate_script(topic, provider, language, 100)}

    def save_keys(self, data: dict) -> dict:
        keys.save({name: _text(data, name, 300) for name in keys.NAMES if name in data})
        return {"keys": keys.status()}

    def delete_keys(self, data: dict) -> dict:
        service = _choice(data, "service", ("gemini", "reddit"), "gemini")
        keys.delete(tuple(n for n in keys.NAMES if n.startswith(service.upper())))
        return {"keys": keys.status()}

    def check_key(self, data: dict) -> dict:
        if _choice(data, "service", ("gemini", "reddit"), "gemini") == "gemini":
            from src.script_gen import check_gemini

            check_gemini()
        else:
            from src.trend_finder import check_reddit

            check_reddit()
        return {}

    def open_folder(self, data: dict) -> dict:
        folder = FOLDERS[_choice(data, "folder", tuple(FOLDERS), "output")]
        folder.mkdir(parents=True, exist_ok=True)
        if os.name == "nt":
            os.startfile(folder)  # noqa: S606 — только папки из FOLDERS
        else:
            subprocess.Popen(["open" if sys.platform == "darwin" else "xdg-open", str(folder)])
        return {}

    def cancel(self, data: dict) -> dict:
        if self.job:
            self.job.cancel()
        return {}


class Handler(BaseHTTPRequestHandler):
    app = App()

    def log_message(self, *args) -> None:  # не засоряем консоль
        pass

    def _local_host(self) -> bool:
        port = self.server.server_address[1]
        return self.headers.get("Host") in (f"127.0.0.1:{port}", f"localhost:{port}")

    def _send(self, body: bytes, content_type: str, status: int = 200) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, data: dict, status: int = 200) -> None:
        self._send(json.dumps(data, ensure_ascii=False).encode(), "application/json; charset=utf-8", status)

    def _video(self, name: str) -> None:
        path = config.OUTPUT_DIR / name
        if not re.fullmatch(r"[^/\\:]+\.mp4", name) or not path.is_file():
            return self._json({"error": "нет файла"}, HTTPStatus.NOT_FOUND)
        size = path.stat().st_size
        start, end, status = 0, size - 1, 200
        wanted = re.fullmatch(r"bytes=(\d*)-(\d*)", self.headers.get("Range", ""))
        if wanted and any(wanted.groups()):  # нужно для перемотки в плеере
            first, last = wanted.groups()
            if first:
                start, end = int(first), min(int(last or size - 1), size - 1)
            else:
                start = max(0, size - int(last))
            if start > end:
                return self._json({"error": "range"}, HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
            status = 206
        self.send_response(status)
        self.send_header("Content-Type", "video/mp4")
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(end - start + 1))
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        with path.open("rb") as file:
            file.seek(start)
            left = end - start + 1
            while left > 0 and (chunk := file.read(min(left, 1 << 16))):
                self.wfile.write(chunk)
                left -= len(chunk)

    def do_GET(self) -> None:
        if not self._local_host():
            return self._json({"error": "forbidden"}, HTTPStatus.FORBIDDEN)
        path = unquote(urlsplit(self.path).path)
        try:
            if path == "/":
                page = PAGE.read_text(encoding="utf-8").replace("__TOKEN__", TOKEN)
                self._send(page.encode(), "text/html; charset=utf-8")
            elif path == "/api/state":
                self._json(self.app.state())
            elif path.startswith("/video/"):
                self._video(path.removeprefix("/video/"))
            else:
                self._json({"error": "не найдено"}, HTTPStatus.NOT_FOUND)
        except (BrokenPipeError, ConnectionError):
            pass  # браузер закрыл соединение при перемотке

    def do_POST(self) -> None:
        if not self._local_host() or self.headers.get("X-Token") != TOKEN:
            return self._json({"error": "Обнови страницу (F5)."}, HTTPStatus.FORBIDDEN)
        actions = {"/api/start": self.app.start, "/api/cancel": self.app.cancel, "/api/trends": self.app.trends,
                   "/api/script": self.app.script, "/api/open": self.app.open_folder,
                   "/api/keys/save": self.app.save_keys, "/api/keys/delete": self.app.delete_keys,
                   "/api/keys/check": self.app.check_key}
        action = actions.get(self.path)
        if not action:
            return self._json({"error": "не найдено"}, HTTPStatus.NOT_FOUND)
        try:
            length = int(self.headers.get("Content-Length", 0))
            if not 0 <= length <= MAX_BODY:
                raise PipelineError("Слишком большой запрос.")
            data = json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(data, dict):
                raise PipelineError("Неверный запрос.")
            self._json(action(data))
        except PipelineError as error:
            self._json({"error": str(error)}, HTTPStatus.BAD_REQUEST)
        except Exception as error:  # интерфейс должен показать причину, а не «упасть»
            self._json({"error": f"{type(error).__name__}: {error}"}, HTTPStatus.INTERNAL_SERVER_ERROR)


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = os.name != "nt"  # на Windows это позволило бы двум копиям занять порт


def serve(port: int = 8765, open_browser: bool = True) -> int:
    url = f"http://127.0.0.1:{port}/"
    try:
        server = Server(("127.0.0.1", port), Handler)
    except OSError as error:
        raise PipelineError(
            f"Порт {port} занят — возможно, интерфейс уже открыт: {url}\nИли запусти с --port 8766. ({error})"
        ) from error
    print(f"Интерфейс: {url}\nЧтобы выключить, закрой это окно или нажми Ctrl+C.", flush=True)
    if open_browser:
        threading.Timer(0.5, webbrowser.open, [url]).start()
    try:
        server.serve_forever()
    finally:
        if Handler.app.job:
            Handler.app.job.cancel()
        server.server_close()
    return 0
