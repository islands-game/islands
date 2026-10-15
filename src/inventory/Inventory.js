import { RESOURCE_ORDER } from '../config/resources.js';

// Хранилище ресурсов: { wood: 0, stone: 0, crystal: 0 }
export class Inventory {
  constructor() {
    this.reset();
  }

  reset() {
    this.items = Object.fromEntries(RESOURCE_ORDER.map(k => [k, 0]));
  }

  add(type, n) {
    if (type in this.items) this.items[type] = Math.min(9999, this.items[type] + n);
  }

  // cost — например { crystal: 3 }
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
      if (Number.isFinite(v)) this.items[k] = Math.max(0, Math.min(9999, Math.floor(v)));
    }
  }
}
