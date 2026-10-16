import { ITEMS, SLOTS, SLOT_INFO, BAG_SIZE, isItem } from '../config/items.js';
import { events } from '../core/Events.js';
import { t } from '../config/i18n.js';

const ONES = () => ({ dmg: 1, hp: 1, effect: 1, speed: 1, cd: 1 });

// Предметы героя: сумка (до 12) и 5 надетых. Влияют на острова; на арене предметы не действуют (там у всех честные характеристики).
export class Items {
  constructor(game) {
    this.game = game;
    this.bag = [];            // id предметов в сумке
    this.equipped = {};       // { ячейка: id }
  }

  reset() {
    this.bag = [];
    this.equipped = {};
    this.game.player.itemMul = ONES();
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
    const m = ONES();
    for (const slot of SLOTS) {
      const it = ITEMS[this.equipped[slot]];
      if (!it || !this.slotOpen(slot)) continue;
      if (it.stat === 'cd') m.cd -= it.bonus; else m[it.stat] += it.bonus;
    }
    return m;
  }

  // Применить предметы к герою (при смене предметов и при росте уровня), здоровье сохраняет долю
  apply() {
    const p = this.game.player;
    const ratio = p.maxHp > 0 ? p.hp / p.maxHp : 1;
    p.itemMul = this.totals();
    p.recalcStats();
    if (!p.dead) p.hp = Math.max(1, Math.min(p.maxHp, Math.round(p.maxHp * ratio)));
    events.emit('items');
  }

  toSave() {
    return { bag: [...this.bag], equipped: { ...this.equipped } };
  }

  // Данные уже проверены SaveManager (только существующие предметы, нужная ячейка)
  fromSave(data) {
    this.bag = (data?.bag ?? []).filter(isItem).slice(0, BAG_SIZE);
    this.equipped = {};
    for (const slot of SLOTS) {
      const id = data?.equipped?.[slot];
      if (isItem(id) && ITEMS[id].slot === slot) this.equipped[slot] = id;
    }
    this.apply();
  }
}
