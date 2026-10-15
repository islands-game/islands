// Задания идут по порядку: одно активное, за выполнение — награда, потом следующее.
// Чтобы добавить задание: допиши запись сюда и название "quest.<id>" в src/config/i18n.js.
//
//  type    — что нужно сделать:
//              collect — собрать ресурс (target: wood | stone | crystal | any)
//              kill    — победить врагов (target: id врага, например slime, или any)
//              tame    — приручить существ (target: any)
//              build   — построить постройки (target: any)
//              visit   — побывать на острове (target: home | ice | fire)
//              level   — достичь уровня героя
//  amount  — сколько раз / какой уровень
//  reward  — xp (опыт) и items (ресурсы), например { xp: 40, items: { crystal: 1 } }
export const QUESTS = [
  { id: 'wood10',    type: 'collect', target: 'wood',    amount: 10, reward: { xp: 40 } },
  { id: 'stone5',    type: 'collect', target: 'stone',   amount: 5,  reward: { xp: 30, items: { wood: 3 } } },
  { id: 'tame1',     type: 'tame',    target: 'any',     amount: 1,  reward: { xp: 60 } },
  { id: 'slime3',    type: 'kill',    target: 'slime',   amount: 3,  reward: { xp: 50, items: { crystal: 2 } } },
  { id: 'build3',    type: 'build',   target: 'any',     amount: 3,  reward: { xp: 40, items: { stone: 5 } } },
  { id: 'level3',    type: 'level',   target: 'any',     amount: 3,  reward: { xp: 40, items: { crystal: 2 } } },
  { id: 'visitIce',  type: 'visit',   target: 'ice',     amount: 1,  reward: { xp: 80, items: { crystal: 2 } } },
  { id: 'frost5',    type: 'kill',    target: 'frost_slime', amount: 5, reward: { xp: 120, items: { crystal: 3 } } },
  { id: 'tame3',     type: 'tame',    target: 'any',     amount: 3,  reward: { xp: 150 } },
  { id: 'level6',    type: 'level',   target: 'any',     amount: 6,  reward: { xp: 100, items: { stone: 10 } } },
  { id: 'visitFire', type: 'visit',   target: 'fire',    amount: 1,  reward: { xp: 150, items: { crystal: 3 } } },
  { id: 'lava3',     type: 'kill',    target: 'lava_slime', amount: 3, reward: { xp: 250, items: { crystal: 5 } } },
  { id: 'boss',      type: 'kill',    target: 'lava_king', amount: 1, reward: { xp: 500, items: { crystal: 10, stone: 10 } } },
  { id: 'treant3',   type: 'kill',    target: 'tree_monster', amount: 3, reward: { xp: 200, items: { wood: 10 } } },
];
