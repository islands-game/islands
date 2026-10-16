// Рыбалка. Только числа. Герой забрасывает удочку с берега или пирса, ждёт поклёвку и вовремя тянет («Действие»).
export const FISHING = {
  castDist: [3.5, 5],       // на каком расстоянии перед героем падает поплавок (пробуем ближнее, потом дальнее)
  waitMin: 2.5, waitMax: 6, // сколько секунд ждать поклёвку
  biteWindow: 1.4,          // сколько секунд даётся, чтобы подсечь
  moveCancel: 2.2,          // отошёл дальше — удочка убирается
  hotRadius: 2.8,           // место клёва (пузыри): рядом с ним улов лучше и клюёт быстрее
  hotPerIsland: 4,          // сколько мест клёва у каждого острова
  hotWaitMul: 0.6,          // у места клёва ждать на 40% меньше
};

// Что клюёт: weights — шансы до модификаторов, mods — на сколько умножаются шансы редкой рыбы и сундучка
export const FISH_WEIGHTS = { common: 70, rare: 22, chest: 8 };
export const FISH_MODS = {
  night: { rare: 1.5 },     // ночью чаще редкая рыба
  hot: { rare: 2, chest: 2 },
  pier: { rare: 1.4, chest: 1.4 },
  island: { rare: 1.2 },    // у островов стихий рыба интереснее
};

// Награда. fish — сколько рыбы 🐟 (еда для зверей), wood/stone — диапазон, xp — опыт героя, itemChance — шанс предмета из сундучка
export const FISH_REWARD = {
  common: { fish: 1, xp: 4 },
  rare: { fish: 3, xp: 14 },
  chest: { wood: [2, 4], stone: [1, 3], xp: 8, itemChance: 0.25 },
};

// Выбор улова. opts: { night, hot, pier, island } — какие условия сейчас. rnd — для проверки.
export function rollFish(opts = {}, rnd = Math.random) {
  const w = { ...FISH_WEIGHTS };
  for (const [flag, mod] of Object.entries(FISH_MODS)) {
    if (!opts[flag]) continue;
    for (const [kind, k] of Object.entries(mod)) w[kind] *= k;
  }
  let r = rnd() * (w.common + w.rare + w.chest);
  if ((r -= w.common) < 0) return 'common';
  if ((r -= w.rare) < 0) return 'rare';
  return 'chest';
}
