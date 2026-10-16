import { RESOURCE_ORDER, CARRY } from '../config/resources.js';
import { FOOD_ORDER, FOOD_CARRY } from '../config/food.js';

// Рюкзак героя: { wood: 0, stone: 0, gold: 0 }. Носить можно ограниченное количество (CARRY).
export class Inventory {
  constructor() {
    this.reset();
  }

  reset() {
    this.items = Object.fromEntries(RESOURCE_ORDER.map(k => [k, 0]));
    this.food = Object.fromEntries(FOOD_ORDER.map(k => [k, 0]));   // еда в рюкзаке: всего не больше FOOD_CARRY
  }

  foodTotal() {
    return FOOD_ORDER.reduce((s, k) => s + this.food[k], 0);
  }

  foodRoom() {
    return Math.max(0, FOOD_CARRY - this.foodTotal());
  }

  // Кладёт еду в рюкзак сколько поместится, возвращает сколько положили
  addFood(type, n) {
    if (!(type in this.food)) return 0;
    const got = Math.max(0, Math.min(n, this.foodRoom()));
    this.food[type] += got;
    return got;
  }

  takeFood(type, n = 1) {
    if (!(type in this.food) || this.food[type] < n) return false;
    this.food[type] -= n;
    return true;
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
    return { ...this.items, food: { ...this.food } };
  }

  fromSave(data) {
    this.reset();
    for (const k of RESOURCE_ORDER) {
      const v = data?.[k];
      if (Number.isFinite(v)) this.items[k] = Math.max(0, Math.min(CARRY[k] ?? 9999, Math.floor(v)));
    }
    for (const k of FOOD_ORDER) {
      const v = data?.food?.[k];
      if (Number.isFinite(v)) this.food[k] = Math.max(0, Math.floor(v));
    }
    while (this.foodTotal() > FOOD_CARRY) {            // лишнее (на случай порченного сохранения) убираем
      const k = FOOD_ORDER.find(x => this.food[x] > 0);
      this.food[k]--;
    }
  }
}
