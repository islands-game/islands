// Улучшения построек, рюкзака и торговец. Только данные. Цены считаются по формуле из config/scaling.js: каждый шаг дороже предыдущего.
import { SCALING, costSeries, scaled } from './scaling.js';
// Каждая постройка улучшается до 3 уровня за золото (и немного дерева или камня). Золото только из боёв и порталов.

// cost[i] — цена перехода с уровня i+1 на i+2; остальные массивы — значение на уровне 1, 2, 3
export const UPGRADES = {
  house: { cost: costSeries({ gold: 30, stone: 6 }, SCALING.building, 2), heal: [1, 1.8, 2.8] },                  // во сколько раз быстрее лечит
  barn: { cost: costSeries({ gold: 40, wood: 10 }, SCALING.building, 2), defense: [200, 320, 480], cap: [120, 200, 300] },   // защита и вместимость
  farm: { cost: costSeries({ gold: 30, wood: 8 }, SCALING.building, 2), yield: [1, 1.5, 2] },                        // урожай с грядки
  pen: { cost: costSeries({ gold: 30, wood: 8 }, SCALING.building, 2), rate: [1, 1.5, 2], max: [1, 1.5, 2] },        // скорость и запас
  cave: { cost: costSeries({ gold: 50, stone: 10 }, SCALING.building, 2) },      // больше мест для гномов (config/gnomes.js, caveSlots)
  pier: { cost: costSeries({ gold: 25, wood: 20 }, SCALING.boat, 2) },       // плот -> лодка -> корабль (config/vessels.js)
  tower: { cost: costSeries({ gold: 35, stone: 8 }, SCALING.building, 2), damage: [9, 14, 22], range: [11, 13, 15], cooldown: [1.5, 1.3, 1.1] },
};
export const MAX_BUILDING_LEVEL = 3;

// Рюкзак: за золото можно носить больше. Уровень 0..3. step — сколько прибавляет каждый уровень.
export const BAG = { woodStone: 15, food: 6, cost: [1, 2, 3].map(n => scaled(40, SCALING.bag, n, 5)), max: 3 };

// Торговец-путешественник: покупает лишнее за золото. Цены меняются каждый день (по дате, как зверь дня).
// Больше dailyGold в сутки он не платит, чтобы золото всё равно оставалось в боях.
export const MERCHANT = {
  dailyGold: 25,
  base: { wood: 1, stone: 2, berries: 2, grain: 2, eggs: 3, meat: 4, fish: 3 },    // цена за штуку до множителя дня
  mulMin: 0.6, mulMax: 1.6,
};
