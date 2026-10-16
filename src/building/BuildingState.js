import { FARM, PEN, BARN, BARN_ITEMS } from '../config/food.js';

// Состояние построек с хозяйством (ферма, загон, амбар). Чистые данные, без графики — их же проверяет SaveManager.
const num = (v, min, max, d) => (Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : d);

export function newState(id) {
  if (id === 'farm') return { plots: FARM.plots.map(() => ({ s: 'empty', t: 0, water: false, gold: false, left: 0 })) };
  if (id === 'pen') return { slots: PEN.slots.map(() => ({ t: 0, stock: 0 })) };
  if (id === 'barn') return { items: Object.fromEntries(BARN_ITEMS.map(k => [k, 0])) };
  return null;
}

// Приводит сохранённое состояние к безопасному виду (любой мусор заменяется значениями по умолчанию)
export function cleanState(id, raw) {
  const st = newState(id);
  if (!st || !raw || typeof raw !== 'object') return st;
  if (id === 'farm' && Array.isArray(raw.plots)) {
    st.plots = st.plots.map((p, i) => {
      const r = raw.plots[i];
      if (!r || !['empty', 'grow', 'ready', 'spoiled'].includes(r.s)) return p;
      return { s: r.s, t: num(r.t, 0, 10000, 0), water: r.water === true, gold: r.gold === true, left: Math.floor(num(r.left, 0, 20, 0)) };
    });
  } else if (id === 'pen' && Array.isArray(raw.slots)) {
    st.slots = st.slots.map((s, i) => ({ t: num(raw.slots[i]?.t, 0, 10000, 0), stock: Math.floor(num(raw.slots[i]?.stock, 0, PEN.slots[i].max, 0)) }));
  } else if (id === 'barn' && raw.items && typeof raw.items === 'object') {
    for (const k of BARN_ITEMS) st.items[k] = Math.floor(num(raw.items[k], 0, BARN.cap, 0));
  }
  return st;
}
