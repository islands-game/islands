import { ITEMS, SLOTS, SLOT_INFO, BAG_SIZE, ROMAN, NEUTRAL, DROP, TIERS, isItem } from '../config/items.js';
import { ELEMENT_ORDER } from '../config/heroes.js';
import { COMBOS, WAVE_EVERY, SHIELD_EVERY, isCombo } from '../config/items.js';
import { computeEffects, noFx } from './ItemEffects.js';
import { events } from '../core/Events.js';
import { t } from '../config/i18n.js';

// Название: «⚔ Оружие · Огонь · II»
export function itemName(it) {
  const el = it.element === NEUTRAL ? t('items.plain') : t('el.' + it.element);
  return `${SLOT_INFO[it.slot].icon} ${t('items.slot.' + it.slot)} · ${el} · ${ROMAN[it.tier]}`;
}

// Что даёт: «+16% урон» / «−9% перезарядка умений»
export function itemBonus(it) {
  const v = `${Math.round(it.bonus * 100)}%`;
  return it.stat === 'cd' ? `−${v} ${t('items.stat.cd')}` : `+${v} ${t('items.stat.' + it.stat)}`;
}

// Выбрать предмет для выпадения по таблице spec (config/items.js: ENEMY_DROP). null — ничего не выпало.
export function rollItem(spec, rnd = Math.random) {
  if (!spec) return null;
  if (spec.chance !== undefined && rnd() >= spec.chance) return null;
  const [lo, hi] = spec.tiers;
  const any = () => ELEMENT_ORDER[Math.floor(rnd() * ELEMENT_ORDER.length)];
  let el;
  if (spec.element) {
    el = rnd() < DROP.offElement ? any() : spec.element;
  } else {
    el = rnd() < DROP.neutralChance ? NEUTRAL : any();
  }
  if (el === NEUTRAL && lo > 1) el = any();           // простые предметы бывают только I ступени
  const pool = [];
  for (const slot of SLOTS) {
    for (let tier = lo; tier <= Math.min(hi, el === NEUTRAL ? 1 : TIERS); tier++) pool.push(ITEMS[`${slot}_${el}_${tier}`]);
  }
  const weights = pool.map(it => it.price ** DROP.priceBias);    // дороже — реже (priceBias < 0)
  let r = rnd() * weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i].id; }
  return pool[pool.length - 1].id;
}

const ONES = () => ({ dmg: 1, hp: 1, effect: 1, speed: 1, cd: 1 });

// Предметы героя: сумка (до 12) и 5 надетых. Влияют на острова; на арене предметы не действуют (там у всех честные характеристики).
export class Items {
  constructor(game) {
    this.game = game;
    this.bag = [];            // id предметов в сумке
    this.equipped = {};       // { ячейка: id }
    this.book = [];           // открытые тайные сочетания (Книга открытий)
    this.info = computeEffects({}, () => true);
    this.timers = { aura: 0, wave: 0, shield: 0, light: 0 };
  }

  reset() {
    this.bag = [];
    this.equipped = {};
    this.book = [];
    this.info = computeEffects({}, () => true);
    this.game.player.itemMul = ONES();
    this.game.player.itemFx = noFx();
    events.emit('items');
  }

  // Ячейка открыта, когда уровень героя достиг нужного
  slotOpen(slot) {
    return this.game.player.level >= SLOT_INFO[slot].unlock;
  }

  get full() {
    return this.bag.length >= BAG_SIZE;
  }

  // Положить предмет в сумку. false — нет места или такого предмета нет
  add(id) {
    if (!isItem(id) || this.full) return false;
    this.bag.push(id);
    events.emit('items');
    return true;
  }

  // Надеть предмет из сумки (index — место в сумке); если ячейка занята, предметы меняются местами
  equip(index) {
    const id = this.bag[index];
    if (!isItem(id)) return false;
    const slot = ITEMS[id].slot;
    if (!this.slotOpen(slot)) {
      this.game.ui.toast(`${t('items.locked')} ${SLOT_INFO[slot].unlock}`);
      return false;
    }
    const old = this.equipped[slot];
    if (old) this.bag[index] = old; else this.bag.splice(index, 1);
    this.equipped[slot] = id;
    this.apply();
    events.emit('equip');
    return true;
  }

  unequip(slot) {
    const id = this.equipped[slot];
    if (!id) return false;
    if (this.full) { this.game.ui.toast(t('items.bagFull')); return false; }
    delete this.equipped[slot];
    this.bag.push(id);
    this.apply();
    return true;
  }

  // Выбросить предмет из сумки
  drop(index) {
    if (index < 0 || index >= this.bag.length) return false;
    this.bag.splice(index, 1);
    events.emit('items');
    return true;
  }

  // Множители от надетых предметов (только открытые ячейки): dmg, hp, effect, speed — растут, cd — падает
  totals() {
    return computeEffects(this.equipped, s => this.slotOpen(s)).mul;
  }

  // Применить предметы к герою (при смене предметов и при росте уровня), здоровье сохраняет долю
  apply() {
    const p = this.game.player;
    const ratio = p.maxHp > 0 ? p.hp / p.maxHp : 1;
    const r = computeEffects(this.equipped, s => this.slotOpen(s));
    this.info = r;
    p.itemMul = r.mul;
    p.itemFx = r.fx;
    p.recalcStats();
    if (!p.dead) p.hp = Math.max(1, Math.min(p.maxHp, Math.round(p.maxHp * ratio)));
    for (const id of r.combos) {
      if (this.book.includes(id)) continue;
      this.book.push(id);                               // новое тайное сочетание: поздравляем игрока
      events.emit('discover', id);
    }
    events.emit('items');
  }

  // Эффекты, которые работают во времени: замедление вокруг, волна лечения, щит, молния. Только на островах.
  update(dt) {
    const g = this.game, p = g.player, fx = p.itemFx;
    if (!g.playing || g.arena.active || p.dead || p.inside) return;
    const T = this.timers;
    let ctx = null;
    const c = () => ctx ?? (ctx = g.skills.context());
    if (fx.aura > 0 && (T.aura -= dt) <= 0) {
      T.aura = 0.5;
      for (const f of c().foes(fx.auraR)) f.slow(fx.aura, 1);
    }
    if (fx.waveHeal > 0 && (T.wave -= dt) <= 0) {
      T.wave = WAVE_EVERY;
      if (p.hp < p.maxHp) { c().ring(p.pos, 0x2f8cff, 5, 0.6); c().allies(8)[0].heal(p.maxHp * fx.waveHeal); }
    }
    if (fx.shieldRegen > 0 && (T.shield -= dt) <= 0) {
      T.shield = SHIELD_EVERY;
      if (p.shield <= 0) { p.addShield(p.maxHp * fx.shieldRegen, SHIELD_EVERY); c().ring(p.pos, 0x9a7040, 3, 0.4); }
    }
    if (fx.lightning > 0 && (T.light -= dt) <= 0) {
      T.light = fx.lightning;
      const foes = c().foes(8);
      if (foes.length) {
        const f = foes[Math.floor(Math.random() * foes.length)];
        f.hit(Math.round(p.atk * 3));
        c().ring(f.pos, 0xfff27a, 3.5, 0.35);
        events.emit('slam');
      }
    }
  }

  toSave() {
    return { bag: [...this.bag], equipped: { ...this.equipped }, book: [...this.book] };
  }

  // Данные уже проверены SaveManager (только существующие предметы, нужная ячейка)
  fromSave(data) {
    this.bag = (data?.bag ?? []).filter(isItem).slice(0, BAG_SIZE);
    this.equipped = {};
    this.book = [...new Set((data?.book ?? []).filter(isCombo))];
    for (const slot of SLOTS) {
      const id = data?.equipped?.[slot];
      if (isItem(id) && ITEMS[id].slot === slot) this.equipped[slot] = id;
    }
    this.apply();
  }
}
