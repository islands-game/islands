// Локальные сохранения (localStorage). Хранятся только данные (JSON), код не выполняется.
const KEY = 'islands.save';
const LANG_KEY = 'islands.lang';
export const SAVE_VERSION = 1;

const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);

// Проверка и приведение данных к безопасному виду
function validate(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw.player ?? {};
  return {
    version: SAVE_VERSION,
    player: {
      x: num(p.x, 0), y: num(p.y, 0), z: num(p.z, 6),
      hp: Math.max(1, num(p.hp, 100)),
      level: Math.max(1, Math.floor(num(p.level, 1))),
      xp: Math.max(0, num(p.xp, 0)),
    },
  };
}

export const SaveManager = {
  load() {
    try {
      const text = localStorage.getItem(KEY);
      return text ? validate(JSON.parse(text)) : null;
    } catch { return null; }
  },
  save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ version: SAVE_VERSION, ...data }));
    } catch { /* хранилище недоступно — игра продолжает работать */ }
  },
  clear() {
    try { localStorage.removeItem(KEY); } catch { /* ничего */ }
  },
  loadLang() {
    try { return localStorage.getItem(LANG_KEY); } catch { return null; }
  },
  saveLang(lang) {
    try { localStorage.setItem(LANG_KEY, lang); } catch { /* ничего */ }
  },
};
