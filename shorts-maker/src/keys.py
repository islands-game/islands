"""Хранение ключей API на этом компьютере.

Файл лежит вне проекта (не попадает в git и OneDrive). В Windows значения
зашифрованы DPAPI: прочитать их может только твоя учётная запись.
Переменная окружения с тем же именем важнее сохранённого ключа.
"""
from __future__ import annotations

import base64
import json
import os
import re
from pathlib import Path

from src import PipelineError

NAMES = ("GEMINI_API_KEY", "REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET")


def path() -> Path:
    custom = os.environ.get("SHORTS_KEYS_FILE")
    if custom:
        return Path(custom)
    base = os.environ.get("LOCALAPPDATA") or Path.home() / ".config"
    return Path(base) / "shorts-maker" / "keys.json"


def _dpapi(data: bytes, protect: bool) -> bytes:
    import ctypes
    from ctypes import wintypes

    class Blob(ctypes.Structure):
        _fields_ = [("size", wintypes.DWORD), ("data", ctypes.POINTER(ctypes.c_char))]

    buffer = ctypes.create_string_buffer(data, len(data))
    source = Blob(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_char)))
    result = Blob()
    function = ctypes.windll.crypt32.CryptProtectData if protect else ctypes.windll.crypt32.CryptUnprotectData
    if not function(ctypes.byref(source), None, None, None, None, 0, ctypes.byref(result)):
        raise OSError("Windows не смогла зашифровать или расшифровать ключ")
    try:
        return ctypes.string_at(result.data, result.size)
    finally:
        ctypes.windll.kernel32.LocalFree(result.data)


def _encode(value: str) -> str:
    raw = value.encode()
    return base64.b64encode(_dpapi(raw, True) if os.name == "nt" else raw).decode()


def _decode(value: str) -> str:
    raw = base64.b64decode(value)
    return (_dpapi(raw, False) if os.name == "nt" else raw).decode()


def _read() -> dict:
    try:
        data = json.loads(path().read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _write(data: dict) -> None:
    target = path()
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_suffix(".part")
    partial.write_text(json.dumps(data), encoding="utf-8")
    if os.name != "nt":
        partial.chmod(0o600)
    partial.replace(target)


def _stored(name: str) -> str | None:
    try:
        return _decode(_read()[name]) or None
    except (KeyError, ValueError, TypeError, OSError):  # нет ключа или файл от другого пользователя
        return None


def get(name: str) -> str | None:
    return os.environ.get(name) or _stored(name)


def status() -> dict[str, str]:
    """Только откуда взят ключ ('system' / 'saved' / '') — сами значения наружу не отдаём."""
    return {name: "system" if os.environ.get(name) else "saved" if _stored(name) else "" for name in NAMES}


def save(values: dict[str, str]) -> None:
    data = _read()
    for name, value in values.items():
        if name not in NAMES:
            raise PipelineError(f"Неизвестный ключ: {name}")
        value = value.strip().strip("\"'")
        if not value:
            continue  # пустое поле не стирает сохранённое
        if not re.fullmatch(r"[\x21-\x7e]{4,300}", value):
            raise PipelineError(f"{name}: это не похоже на ключ (пробелы, русские буквы или слишком коротко).")
        data[name] = _encode(value)
    _write(data)


def delete(names: tuple[str, ...]) -> None:
    _write({k: v for k, v in _read().items() if k not in names})
