# shorts-maker — вертикальные видео 9:16 из текста

Консольная программа: текст → озвучка → субтитры с подсветкой слов → монтаж на FFmpeg → MP4 1080×1920.
Платных API нет. Это отдельный инструмент, он не часть игры ISLANDS.

## Установка

Нужен **Python 3.12–3.14**. Команды — для PowerShell из папки `shorts-maker`.

```powershell
py -m venv "$env:LOCALAPPDATA\shorts-maker\venv"
```
```powershell
& "$env:LOCALAPPDATA\shorts-maker\venv\Scripts\Activate.ps1"
```
```powershell
pip install -r requirements.txt
```

Окружение лежит вне проекта, чтобы OneDrive не синхронизировал тысячи файлов.
Если PowerShell не даёт запустить `Activate.ps1`, вызывай напрямую
`& "$env:LOCALAPPDATA\shorts-maker\venv\Scripts\python.exe" main.py ...`.

Linux/macOS: `python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`.

### FFmpeg

Проверить, есть ли в системе:

```powershell
ffmpeg -version
```

Если нет — ничего страшного: используется FFmpeg из пакета `imageio-ffmpeg` (ставится вместе с зависимостями).
Системный можно поставить так (после этого открой новый терминал):

```powershell
winget install Gyan.FFmpeg
```

Нужна сборка с фильтром `subtitles` (libass). Свой путь задаётся переменной `SHORTS_FFMPEG`.

### Проверка окружения

```powershell
python main.py check
```

### Фон и шрифт

```powershell
python tools/download_assets.py
```

Скачает после подтверждения:
- геймплей [NodeCore- Fire Basics](https://commons.wikimedia.org/wiki/File:NodeCore-_Fire_Basics.webm) (~59 МБ), автор Warr1024, **CC BY 3.0 — указывай автора в описании ролика**;
- шрифт Montserrat ExtraBold (лицензия SIL OFL).

В этом фоне местами есть свои английские подписи. Лучше положить в `assets/backgrounds/` собственные записи
(например, геймплей своей игры). Без интернета: `python tools/download_assets.py --generate` нарисует градиент.
Музыку (mp3, wav, m4a…), на которую у тебя есть права, клади в `assets/music/`.

## Интерфейс (самый простой способ)

Дважды щёлкни **`Открыть shorts-maker.bat`** (или `python main.py ui`) — откроется страница в браузере.
Чёрное окно не закрывай, пока пользуешься: это и есть программа.

- **Из текста** — напиши текст, выбери голос и фон, нажми «Создать видео».
- **Темы** — найди тему, нажми «Взять», проверь получившийся текст и собери ролик.
- **Нарезка** — ссылка или путь к файлу, начало и конец.

Страница доступна только с этого компьютера (`127.0.0.1`). Ключ Gemini из поля на странице не сохраняется.

## Видео из текста

```powershell
python main.py make --text "Привет! Это мой первый ролик."
```
```powershell
python main.py make --file script.txt --voice svetlana --fps 60 --subs karaoke
```
```powershell
python main.py make --text "Hello from the pipeline" --voice christopher --no-music
```

Результат — `output/make_*.mp4`, рядом `.txt` с текстом.

| Опция | Что делает |
|---|---|
| `--voice` | `dmitry`, `svetlana`, `christopher`, `andrew`, `emma` или полное имя голоса edge-tts |
| `--rate` | скорость речи: `--rate=+15%`, `--rate=-5%` |
| `--subs` | `highlight` (по умолчанию), `karaoke` (`{\k}`), `word` (по слову) |
| `--background`, `--music` | конкретные файлы вместо случайных |
| `--no-music`, `--no-uniquify`, `--fps 60`, `--seed N` | без музыки / без изменений картинки / частота / повторяемость |
| `--keep-temp` | оставить `subs.ass` и лог FFmpeg в `temp/` |

### Сценарий от нейросети

Gemini (бесплатный ключ из Google AI Studio, есть лимиты):

```powershell
$env:GEMINI_API_KEY = "твой_ключ"
```
```powershell
python main.py make --topic "почему коты мурлыкают" --llm gemini
```

Локально через [Ollama](https://ollama.com) (нужна скачанная модель, по умолчанию `llama3.1`, меняется переменной `OLLAMA_MODEL`):

```powershell
python main.py make --topic "почему коты мурлыкают" --llm ollama
```

Ключ не записывай в файлы проекта. Модель Gemini меняется переменной `GEMINI_MODEL`.
Проверяй факты в тексте перед публикацией.

## Вирусные темы (`auto`)

Находит тему, просит нейросеть написать сценарий примерно на 45 секунд с хуком в начале и собирает видео.

Сначала посмотри, что нашлось (ключ не нужен):

```powershell
python main.py auto --source google --geo US --list
```
```powershell
python main.py auto --source reddit --subreddit AITAH --list
```

Сделать ролик (нужен `GEMINI_API_KEY` или `--llm ollama`):

```powershell
python main.py auto --source reddit --subreddit AITAH
```

| Опция | Что делает |
|---|---|
| `--time` | период топа Reddit: `hour`, `day` (по умолчанию), `week`… |
| `--min-upvotes`, `--min-comments` | пороги отбора (2000 и 100) |
| `--language`, `--seconds` | язык сценария (русский) и длина (45) |
| `--script-only` | только сценарий, чтобы проверить его до рендера |

Для `--language english` добавь `--voice christopher`. Остальные опции как у `make`.

- Использованные темы записываются в `output/used_topics.json`. Ссылка на источник — в `*.source.txt`.
- Посты 18+, закреплённые и удалённые пропускаются. Это не полная проверка: **прочитай сценарий и посмотри
  ролик перед публикацией**.
- Истории с Reddit написаны другими людьми, а правила Reddit ограничивают их использование. Прочитай правила
  перед публикацией и не раскрывай личные данные.
- По одному поисковому запросу Google нейросеть знает только заголовки новостей и может ошибиться в фактах.
- Темы Google берутся из RSS-ленты Google Trends. `pytrends` не используется: он больше не поддерживается,
  и при проверке 27.11.2026 Google отвечал ему `404`.

### Доступ к Reddit

Публичный JSON без регистрации часто отвечает `403`. Тогда нужен доступ к официальному API: приложение типа
`script` на https://www.reddit.com/prefs/apps (Reddit может запросить одобрение заявки; в приложении есть
возрастные ограничения). Ключи задаются переменными, в файлы проекта их не записывай:

```powershell
$env:REDDIT_CLIENT_ID = "..."
```
```powershell
$env:REDDIT_CLIENT_SECRET = "..."
```

## Нарезка длинных видео (`clip`)

```powershell
python main.py clip "https://www.youtube.com/watch?v=ID" --start 1:30 --end 2:15 --language ru
```
```powershell
python main.py clip "D:\video\stream.mp4" --start 90 --end 150 --model base
```

- При первом запуске faster-whisper скачает модель: `tiny` ~75 МБ, `base` ~145 МБ, `small` ~480 МБ (по умолчанию).
- Кадр обрезается по центру до 9:16. `--no-subs` — без субтитров.
- Для YouTube yt-dlp нужен Node.js или Deno. Если скачивание сломалось, обнови: `pip install -U "yt-dlp[default]"`.
- Бери только свои видео или те, на которые есть разрешение. Правила площадок тоже действуют.

## Настройки

Всё в `config.py`: голоса, шрифт, цвета и размер субтитров (`SubtitleStyle`), громкость музыки
(30% в паузах, 12% во время речи), диапазоны зума и цветокоррекции (`RenderSettings`).

«Уникализация» (зум 2–3%, лёгкая цветокоррекция, скорость 1.01x) **не гарантирует** защиту от теневого бана:
площадки узнают повторный контент и после таких изменений.

## Если не работает

- **«No audio was received»** — сервис edge-tts временно не отдаёт голос. Программа повторяет запрос, а для
  Дмитрия и Светланы затем сама берёт многоязычный голос (Andrew / Emma) и пишет об этом. edge-tts —
  неофициальный клиент, он может перестать работать после изменений на стороне Microsoft.
- Текст отправляется в Microsoft (озвучка) и, с `--llm gemini`, в Google. Не вставляй личные данные.
- Ошибка FFmpeg — полный лог в `temp/job_*/ffmpeg.log` (при ошибке папка не удаляется).

## Структура

```
main.py              CLI
config.py            пути и настройки
src/tts.py           edge-tts и таймкоды слов
src/subtitles.py     сборка .ass
src/video_editor.py  монтаж на FFmpeg
src/clipper.py       yt-dlp + faster-whisper
src/webui.py         локальный веб-интерфейс (страница ui/index.html)
src/script_gen.py    Gemini / Ollama / очистка текста
src/trend_finder.py  темы из Reddit и Google Trends
src/ffmpeg_utils.py  поиск и запуск FFmpeg, прогресс
tools/download_assets.py  фон и шрифт
```
