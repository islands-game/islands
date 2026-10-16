// Задания идут по порядку: одно активное, за выполнение — награда, потом следующее.
// Чтобы добавить задание: допиши запись сюда и название "quest.<id>" в src/config/i18n.js.
//
//  type    — что нужно сделать:
//              collect — собрать ресурс (target: wood | stone | gold | any)
//              kill    — победить врагов (target: id врага, например slime, или any)
//              tame    — освободить зверей из клеток порталов (target: any)
//              build   — построить постройки (target: any)
//              visit   — побывать на острове (target: home | earth | water | ice | air | fire)
//              level   — достичь уровня героя
//              arena   — выиграть матч на арене 5 на 5
//  amount  — сколько раз / какой уровень
//  reward  — xp (опыт) и items (ресурсы), например { xp: 40, items: { gold: 1 } }
export const QUESTS = [
  { id: 'wood10',    type: 'collect', target: 'wood',    amount: 10, reward: { xp: 40 } },
  { id: 'stone5',    type: 'collect', target: 'stone',   amount: 5,  reward: { xp: 30, items: { wood: 3 } } },
  { id: 'build3',    type: 'build',   target: 'any',     amount: 3,  reward: { xp: 40, items: { stone: 5 } } },
  { id: 'slime3',    type: 'kill',    target: 'slime',   amount: 3,  reward: { xp: 50, items: { gold: 2 } } },
  { id: 'level3',    type: 'level',   target: 'any',     amount: 3,  reward: { xp: 40, items: { gold: 2 } } },
  // Порталы стихий: на каждом острове король охраняет клетку со зверем дня
  { id: 'visitEarth', type: 'visit',  target: 'earth',   amount: 1,  reward: { xp: 60, items: { stone: 3 } } },
  { id: 'stoneKing', type: 'kill',    target: 'stone_king', amount: 1, reward: { xp: 200, items: { gold: 4 } } },
  { id: 'tame1',     type: 'tame',    target: 'any',     amount: 1,  reward: { xp: 120, items: { gold: 2 } } },
  { id: 'visitWater', type: 'visit',  target: 'water',   amount: 1,  reward: { xp: 100, items: { gold: 2 } } },
  { id: 'tideKing',  type: 'kill',    target: 'tide_king', amount: 1, reward: { xp: 300, items: { gold: 6 } } },
  { id: 'visitIce',  type: 'visit',   target: 'ice',     amount: 1,  reward: { xp: 80, items: { gold: 2 } } },
  { id: 'frost5',    type: 'kill',    target: 'frost_slime', amount: 5, reward: { xp: 120, items: { gold: 3 } } },
  { id: 'bossIce',   type: 'kill',    target: 'frost_giant', amount: 1, reward: { xp: 350, items: { gold: 8, wood: 10 } } },
  { id: 'level6',    type: 'level',   target: 'any',     amount: 6,  reward: { xp: 100, items: { stone: 10 } } },
  { id: 'visitAir',  type: 'visit',   target: 'air',     amount: 1,  reward: { xp: 120, items: { gold: 3 } } },
  { id: 'stormKing', type: 'kill',    target: 'storm_king', amount: 1, reward: { xp: 350, items: { gold: 8 } } },
  { id: 'tame3',     type: 'tame',    target: 'any',     amount: 3,  reward: { xp: 250, items: { gold: 5 } } },
  { id: 'visitFire', type: 'visit',   target: 'fire',    amount: 1,  reward: { xp: 150, items: { gold: 3 } } },
  { id: 'lava3',     type: 'kill',    target: 'lava_slime', amount: 3, reward: { xp: 250, items: { gold: 5 } } },
  { id: 'boss',      type: 'kill',    target: 'lava_king', amount: 1, reward: { xp: 500, items: { gold: 10, stone: 10 } } },
  { id: 'treant3',   type: 'kill',    target: 'tree_monster', amount: 3, reward: { xp: 200, items: { wood: 10 } } },
  { id: 'arena',     type: 'arena',   target: 'any', amount: 1, reward: { xp: 400, items: { gold: 10, stone: 10 } } },
];
