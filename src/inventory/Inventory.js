import { RESOURCE_ORDER, CARRY } from '../config/resources.js';

// Рюкзак героя: { wood: 0, stone: 0, gold: 0 }. Носить можно ограниченное количество (CARRY).
export class Inventory {
  constructor() {
    this.reset();
  }

  reset() {
    this.items = Object.fromEntries(RESOURCE_ORDER.map(k => [k, 0]));
  }

  // Сколько ещё поместится в рюкзак
  room(type) {
    return Math.max(0, (CARRY[type] ?? 9999) - (this.items[type] ?? 0));
  }

  capacity(type) {
    return CARRY[type] ?? 9999;
  }

  // Кладёт в рюкзак сколько поместится. Возвращает, сколько положили.
  add(type, n) {
    if (!(type in this.items)) return 0;
    const got = Math.max(0, Math.min(n, this.room(type)));
    this.items[type] += got;
    return got;
  }

  // cost — например { gold: 3 }
  has(cost) {
    return Object.entries(cost).every(([k, v]) => (this.items[k] ?? 0) >= v);
  }

  spend(cost) {
    if (!this.has(cost)) return false;
    for (const [k, v] of Object.entries(cost)) this.items[k] -= v;
    return true;
  }

  toSave() {
    return { ...this.items };
  }

  fromSave(data) {
    this.reset();
    for (const k of RESOURCE_ORDER) {
      const v = data?.[k];
      if (Number.isFinite(v)) this.items[k] = Math.max(0, Math.min(CARRY[k] ?? 9999, Math.floor(v)));
    }
  }
}
