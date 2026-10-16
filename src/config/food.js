// Еда, ферма, загон, амбар и питание зверей. Только данные.
// Еда нужна зверям: каждый зверь ест раз в сутки. Нет еды — зверь слабеет, а потом убегает.

// Виды еды. source — где добывается: farm (грядки) или pen (животные в загоне)
export const FOODS = {
  berries: { icon: '🍓', source: 'farm' },
  grain: { icon: '🌾', source: 'farm' },
  eggs: { icon: '🥚', source: 'pen' },
  meat: { icon: '🍖', source: 'pen' },
};
export const FOOD_ORDER = ['berries', 'grain', 'eggs', 'meat'];
export const FOOD_CARRY = 12;            // сколько еды (всего) герой носит с собой

// Любимая еда каждого вида зверя: даёт бонус к опыту
export const FAVORITE = { bear: 'berries', fox: 'eggs', wolf: 'meat', dragon: 'meat', owl: 'grain' };

// Питание: раз в сутки (игровые сутки, 4 минуты) каждый зверь ест perDay еды (+1 за каждые 4 уровня).
export const BEAST_FOOD = {
  fedPower: 0.10,          // сытый зверь сильнее на 10%
  hungryPower: -0.15,      // голодный слабее на 15%
  fleeAfterDays: 2,        // два дня без еды подряд — зверь убегает
  favoriteXp: 25,          // опыт за любимую еду
  otherXp: 5,              // опыт за обычную
};

// Ферма: четыре грядки (две с ягодами, две с зерном). Растёт growTime секунд, потом урожай ждёт spoilAfter секунд и портится.
// Если грядку полить, пока урожай не вырос наполовину, он станет «золотым» (вдвое больше).
export const FARM = {
  plots: [
    { x: -1.6, z: -1.6, crop: 'berries' }, { x: 1.6, z: -1.6, crop: 'berries' },
    { x: -1.6, z: 1.6, crop: 'grain' }, { x: 1.6, z: 1.6, crop: 'grain' },
  ],
  growTime: 90, spoilAfter: 240, yield: [2, 3], goldenMul: 2, waterBefore: 0.5,
};

// Загон: животные дают еду сами. every — раз в сколько секунд, max — сколько копится.
export const PEN = {
  slots: [{ food: 'eggs', every: 100, max: 4 }, { food: 'meat', every: 150, max: 3 }],
};

// Амбар: хранит дерево, камень и еду. cap — сколько каждого.
export const BARN = { cap: 120 };
export const BARN_ITEMS = ['wood', 'stone', ...FOOD_ORDER];
