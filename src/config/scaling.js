// Дорожающие цены: каждый следующий шаг (улучшение, найм, уровень) стоит дороже предыдущего.
// Одна формула на всё: цена шага n = базовая цена × k^(n−1). Здесь только коэффициенты k, их можно подкручивать.
// Проверка таблицы цен: node tools/scaling-check.js
export const SCALING = {
  building: 2.6,      // улучшение постройки (дом, амбар, ферма, загон, пещера, башня): ×2,6 за уровень
  bag: 2.2,           // расширение рюкзака
  gnomeHire: 1.6,     // наём следующего гнома (чем больше гномов, тем дороже новый)
  gnomeWage: 1.35,    // зарплата гнома за каждый его уровень
  beastFood: 1.18,    // еда зверя в сутки за каждый его уровень (округляется: 1, 1, 1, 2, 2, 2, 3, 3, 4...)
  boat: 2.2,          // улучшение лодок и кораблей (используется в этапе с морем)
};

const GOLD_STEP = 5;                                   // золото округляется до 5

// Цена шага n (1, 2, 3...) при базовой цене base
export function scaled(base, k, n, step = 1) {
  const x = base * k ** (n - 1);
  return Math.max(step, Math.round(x / step) * step);
}

// Серия цен улучшений: base = { gold: 30, stone: 6 } -> [{ gold: 30, stone: 6 }, { gold: 80, stone: 16 }, ...]
export function costSeries(base, k, steps) {
  return Array.from({ length: steps }, (_, i) =>
    Object.fromEntries(Object.entries(base).map(([res, v]) => [res, scaled(v, k, i + 1, res === 'gold' ? GOLD_STEP : 1)])));
}

// Плата за наём гнома, когда сейчас нанято others других гномов (30, 50, 75, 125...)
export const hireFee = (others, base = 30) => scaled(base, SCALING.gnomeHire, Math.max(1, others), GOLD_STEP);

// Зарплата гнома уровня level в сутки (6, 8, 11, 15, 20)
export const wage = (level, base = 6) => Math.round(base * SCALING.gnomeWage ** (level - 1));

// Сколько еды в сутки нужно зверю уровня level
export const beastUpkeep = level => Math.max(1, Math.round(SCALING.beastFood ** (level - 1)));
