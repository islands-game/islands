// Локальные сохранения (localStorage). Хранятся только данные (JSON), код не выполняется.
// Версия 1: позиция, уровень, опыт. Версия 2: + ресурсы и приручённые существа.
import { CREATURES } from '../config/creatures.js';
import { RESOURCE_ORDER } from '../config/resources.js';
import { MAX_LEVEL } from '../progression/Progression.js';

const KEY = 'islands.save';
const LANG_KEY = 'islands.lang';
export const SAVE_VERSION = 2;

const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);
const int = (v, min, max, fallback) => Math.max(min, Math.min(max, Math.floor(num(v, fallback))));

function validateCreatures(raw) {
  const seen = new Set();
  const collection = [];
  for (const r of Array.isArray(raw?.collection) ? raw.collection : []) {
    if (!r || typeof r.id !== 'string' || !Object.hasOwn(CREATURES, r.id) || seen.has(r.id)) continue;
    seen.add(r.id);
    collection.push({ id: r.id, level: int(r.level, 1, MAX_LEVEL, 1), xp: Math.max(0, num(r.xp, 0)) });
  }
  const active = typeof raw?.active === 'string' && seen.has(raw.active) ? raw.active : null;
  return { active, collection };
}

// Проверка и приведение данных к безопасному виду. Старые сохранения (v1) тоже подходят.
function validate(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (num(raw.version, 1) > SAVE_VERSION) return null; // сохранение из будущей версии
  const p = raw.player ?? {};
  const inv = raw.inventory ?? {};
  return {
    version: SAVE_VERSION,
    player: {
      x: num(p.x, 0), y: num(p.y, 0), z: num(p.z, 6),
      hp: Math.max(1, num(p.hp, 100)),
      level: int(p.level, 1, MAX_LEVEL, 1),
      xp: Math.max(0, num(p.xp, 0)),
    },
    inventory: Object.fromEntries(RESOURCE_ORDER.map(k => [k, int(inv[k], 0, 9999, 0)])),
    creatures: validateCreatures(raw.creatures),
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
