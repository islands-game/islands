// Локальные сохранения (localStorage). Хранятся только данные (JSON), код не выполняется.
// Версия 1: позиция, уровень, опыт. Версия 2: + ресурсы и приручённые существа.
// Версия 3: + постройки и шаг обучения. Версия 4: + задания. Версия 5: + время суток и рейды.
// Версия 6: + выбранный герой (hero). Старые сохранения читаются как «Воин огня».
// Версия 7: + список зверей рядом с героем (creatures.actives, у поддержки до 3). Старые читаются с одним зверем (active).
// Старые версии читаются без потерь.
import { CREATURES } from '../config/creatures.js';
import { BUILDINGS, MAX_BUILDINGS } from '../config/buildings.js';
import { TUTORIAL_DONE } from '../ui/Tutorial.js';
import { QUESTS } from '../config/quests.js';
import { RESOURCE_ORDER } from '../config/resources.js';
import { MAX_LEVEL } from '../progression/Progression.js';
import { DEFAULT_HERO, isHero } from '../config/heroes.js';

const KEY = 'islands.save';
const LANG_KEY = 'islands.lang';
export const SAVE_VERSION = 7;
const MAX_ACTIVE = 3;
const MAX_COORD = 40;

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
  // Звери рядом: список (v7) или один active (старые сохранения), без повторов и только приручённые
  const listed = Array.isArray(raw?.actives) ? raw.actives : (active ? [active] : []);
  const actives = [];
  for (const id of listed) {
    if (typeof id === 'string' && seen.has(id) && !actives.includes(id) && actives.length < MAX_ACTIVE) actives.push(id);
  }
  return { active: actives[0] ?? null, actives, collection };
}

// Проверка и приведение данных к безопасному виду. Старые сохранения (v1) тоже подходят.
function validate(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (num(raw.version, 1) > SAVE_VERSION) return null; // сохранение из будущей версии
  const p = raw.player ?? {};
  const inv = raw.inventory ?? {};
  return {
    version: SAVE_VERSION,
    hero: isHero(raw.hero) ? raw.hero : DEFAULT_HERO,
    player: {
      x: num(p.x, 0), y: num(p.y, 0), z: num(p.z, 6),
      hp: Math.max(1, num(p.hp, 100)),
      level: int(p.level, 1, MAX_LEVEL, 1),
      xp: Math.max(0, num(p.xp, 0)),
    },
    inventory: Object.fromEntries(RESOURCE_ORDER.map(k => [k, int(inv[k], 0, 9999, 0)])),
    creatures: validateCreatures(raw.creatures),
    buildings: validateBuildings(raw.buildings),
    // В старых сохранениях обучения не было — считаем его пройденным
    tutorial: int(raw.tutorial, 0, TUTORIAL_DONE, TUTORIAL_DONE),
    // Время суток и рейды появились в версии 5
    time: {
      day: Number.isFinite(raw.time?.day) ? Math.max(0, Math.min(0.999, raw.time.day)) : 0.12,
      count: int(raw.time?.count, 0, 99999, 0),
      raidedDay: int(raw.time?.raidedDay, -1, 99999, -1),
      firstDone: typeof raw.time?.firstDone === 'boolean' ? raw.time.firstDone : true,
    },
    // Задания появились в версии 4: в старых сохранениях начинаем с первого
    quests: {
      index: int(raw.quests?.index, 0, QUESTS.length, 0),
      progress: int(raw.quests?.progress, 0, 99999, 0),
    },
  };
}

function validateBuildings(raw) {
  const list = [];
  for (const b of Array.isArray(raw) ? raw : []) {
    if (list.length >= MAX_BUILDINGS) break;
    if (!b || typeof b.id !== 'string' || !Object.hasOwn(BUILDINGS, b.id)) continue;
    if (!Number.isFinite(b.x) || !Number.isFinite(b.z)) continue;
    list.push({
      id: b.id,
      x: Math.max(-MAX_COORD, Math.min(MAX_COORD, b.x)),
      z: Math.max(-MAX_COORD, Math.min(MAX_COORD, b.z)),
      rot: int(b.rot, 0, 3, 0),
    });
  }
  return list;
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
