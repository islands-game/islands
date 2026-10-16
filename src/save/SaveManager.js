// Локальные сохранения (localStorage). Хранятся только данные (JSON), код не выполняется.
// Версия 1: позиция, уровень, опыт. Версия 2: + ресурсы и приручённые существа.
// Версия 3: + постройки и шаг обучения. Версия 4: + задания. Версия 5: + время суток и рейды.
// Версия 6: + выбранный герой (hero). Старые сохранения читаются как «Воин огня».
// Версия 7: + список зверей рядом с героем (creatures.actives, у поддержки до 3). Старые читаются с одним зверем (active).
// Версия 8: звери из порталов (виды × стихии, creatures.*), освобождённые звери по дням (realms.freed), новый порядок заданий.
// Старые существа превращаются в новых зверей (LEGACY_CREATURES).
// Версия 15: уровни героя до 30, зверей до 15, новая кривая опыта (config/levels.js). Старые сохранения читаются без потерь:
// у зверей эволюции теперь на 5 и 10 уровне, опыт героя и зверей сохраняется как есть.
// Версия 14: золотая жила дня (realms.veins: когда добыли на каждом острове).
// Версия 13: гномы (gnomes: места, уровни, зарплата, поручение дня).
// Версия 12: уровни построек и стартового дома (lvl, houseLevel), уровень рюкзака (inventory.bag), торговец (merchant: день и сколько золота заплатил).
// Версия 11: прочность построек (hp), защита амбара (def), страховка амбара (state.ins). Старые версии читаются без потерь.
// Версия 10: еда в рюкзаке (inventory.food), состояние построек (ферма, загон, амбар) и сытость зверей (fed, hunger).
// Версия 9: золото вместо кристаллов (старые кристаллы становятся золотом), лимит рюкзака. Старые версии читаются без потерь.
import { isCreature, LEGACY_CREATURES } from '../config/creatures.js';
import { REALM_ORDER } from '../config/realms.js';
import { FOOD_ORDER, FOOD_CARRY } from '../config/food.js';
import { cleanState } from '../building/BuildingState.js';
import { BUILDINGS, MAX_BUILDINGS } from '../config/buildings.js';
import { TUTORIAL_DONE } from '../ui/Tutorial.js';
import { QUESTS } from '../config/quests.js';
import { RESOURCE_ORDER, CARRY } from '../config/resources.js';
import { MAX_LEVEL, BEAST_MAX_LEVEL } from '../progression/Progression.js';
import { DEFAULT_HERO, isHero } from '../config/heroes.js';
import { events } from '../core/Events.js';

const KEY = 'islands.save';
const LANG_KEY = 'islands.lang';
export const SAVE_VERSION = 15;
const MAX_ACTIVE = 3;
const MAX_COORD = 40;

const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);
const int = (v, min, max, fallback) => Math.max(min, Math.min(max, Math.floor(num(v, fallback))));

// Старый id существа (v1–v7) -> новый зверь
const creatureId = id => (typeof id === 'string' && Object.hasOwn(LEGACY_CREATURES, id) ? LEGACY_CREATURES[id] : id);

function validateCreatures(raw) {
  const seen = new Set();
  const collection = [];
  for (const r of Array.isArray(raw?.collection) ? raw.collection : []) {
    const id = creatureId(r?.id);
    if (!r || !isCreature(id) || seen.has(id)) continue;
    seen.add(id);
    collection.push({ id, level: int(r.level, 1, BEAST_MAX_LEVEL, 1), xp: Math.max(0, num(r.xp, 0)), fed: r.fed !== false, hunger: int(r.hunger, 0, 2, 0) });
  }
  const activeId = creatureId(raw?.active);
  const active = typeof activeId === 'string' && seen.has(activeId) ? activeId : null;
  // Звери рядом: список (v7) или один active (старые сохранения), без повторов и только приручённые
  const listed = (Array.isArray(raw?.actives) ? raw.actives : (active ? [active] : [])).map(creatureId);
  const actives = [];
  for (const id of listed) {
    if (typeof id === 'string' && seen.has(id) && !actives.includes(id) && actives.length < MAX_ACTIVE) actives.push(id);
  }
  return { active: actives[0] ?? null, actives, collection };
}

// Порядок заданий до версии 8: по нему переносим прогресс в новый порядок
const OLD_QUEST_ORDER = ['wood10', 'stone5', 'tame1', 'slime3', 'build3', 'level3', 'visitIce', 'frost5', 'tame3', 'level6', 'visitFire', 'lava3', 'boss', 'treant3', 'arena', 'bossIce'];

function validateQuests(raw, version) {
  const index = int(raw?.index, 0, QUESTS.length, 0);
  const progress = int(raw?.progress, 0, 99999, 0);
  if (version >= 8) return { index, progress };
  // Старое сохранение: первое задание нового списка, которое игрок ещё не делал
  const done = new Set(OLD_QUEST_ORDER.slice(0, Math.min(index, OLD_QUEST_ORDER.length)));
  const next = QUESTS.findIndex(q => !done.has(q.id));
  const nowId = OLD_QUEST_ORDER[index];
  return { index: next < 0 ? QUESTS.length : next, progress: QUESTS[next]?.id === nowId ? progress : 0 };
}

// Когда освобождали зверей стихий: { стихия: 'ГГГГ-ММ-ДД' }
function validateRealms(raw) {
  const freed = {}, veins = {};
  for (const el of REALM_ORDER) {
    const d = raw?.freed?.[el];
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) freed[el] = d;
    const v = raw?.veins?.[el];
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) veins[el] = v;
  }
  return { freed, veins };
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
    // Версия 9: кристаллы стали золотом; рюкзак ограничен (CARRY)
    inventory: { ...Object.fromEntries(RESOURCE_ORDER.map(k => [k, int(k === 'gold' ? (inv.gold ?? inv.crystal) : inv[k], 0, (CARRY[k] ?? 9999) + (k === 'gold' ? 0 : 45), 0)])), food: validateFood(inv.food), bag: int(inv.bag, 0, 3, 0) },
    houseLevel: int(raw.houseLevel, 1, 3, 1),
    gnomes: raw.gnomes && typeof raw.gnomes === 'object' ? raw.gnomes : null,       // подробная проверка — в Gnomes.fromSave
    merchant: { day: /^\d{4}-\d{2}-\d{2}$/.test(raw.merchant?.day ?? '') ? raw.merchant.day : null, earned: int(raw.merchant?.earned, 0, 500, 0) },
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
    quests: validateQuests(raw.quests, num(raw.version, 1)),
    realms: validateRealms(raw.realms),
  };
}

// Еда в рюкзаке: целые числа, всего не больше FOOD_CARRY
function validateFood(raw) {
  const cap = FOOD_CARRY + 18;                       // не больше, чем вмещает рюкзак высшего уровня
  const food = Object.fromEntries(FOOD_ORDER.map(k => [k, int(raw?.[k], 0, cap, 0)]));
  let total = FOOD_ORDER.reduce((s, k) => s + food[k], 0);
  for (const k of FOOD_ORDER) while (total > cap && food[k] > 0) { food[k]--; total--; }
  return food;
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
      state: cleanState(b.id, b.state),     // ферма, загон, амбар хранят своё состояние (у остальных постройки null)
      lvl: int(b.lvl, 1, 3, 1),
      hp: Number.isFinite(b.hp) ? Math.max(1, Math.min(2000, b.hp)) : undefined,
      def: Number.isFinite(b.def) ? Math.max(0, Math.min(2000, b.def)) : undefined,
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
    events.emit('saved');                  // облако (net/Cloud.js) отправит сохранение, когда придёт время
  },
  // Облачное сохранение: проходит ту же проверку, что и местное (чужой JSON не доверяем)
  import(raw) {
    const data = validate(raw);
    if (!data) return false;
    try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch { return false; }
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
