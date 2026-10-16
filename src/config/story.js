// Сюжетное обучение «Путь выжившего»: цепочка заданий, каждое вытекает из предыдущего. План: docs/story-quests.md.
// Герой терпит кораблекрушение, оказывается на необитаемом острове, слышит зов о помощи и спасает первого зверя.
// Чтобы добавить задание: допиши запись сюда и тексты "quest.<id>" во все три языка в i18n.js.
//
//  chapter — глава (название "chapter.<номер>")
//  type    — walk (пройти метров), collect (собрать ресурс, target: wood | stone | any), reach (подойти к цели стрелки),
//            visit (побывать на острове), kill (победить врага, target: id), tame (освободить зверя), has (построена постройка, target: id),
//            harvest (собрать урожай), fed (покормить зверя), level (достичь уровня)
//  amount  — сколько
//  reward  — gold (золото: исключение из правил золота, решение владельца 17.10.2026), xp, items
//  guide   — куда показывает стрелка: { kind: 'point', x, z } | { kind: 'node', res } | { kind: 'portal', island } |
//            { kind: 'enemy', id } | { kind: 'cage', element } | { kind: 'building', id, spot: { x, z } } | { kind: 'beast' }
//  voice   — реплика героя в начале задания (ключ "story.<voice>")
export const STORY = [
  // --- Глава 1. Кораблекрушение ---
  { id: 's_look', chapter: 1, type: 'walk', amount: 15, reward: { xp: 5 }, guide: { kind: 'point', x: 0, z: 10 } },
  { id: 's_wood', chapter: 1, type: 'collect', target: 'wood', amount: 10, reward: { gold: 5, xp: 15 }, guide: { kind: 'node', res: 'wood' } },
  { id: 's_stone', chapter: 1, type: 'collect', target: 'stone', amount: 5, reward: { gold: 5, xp: 15 }, guide: { kind: 'node', res: 'stone' } },
  { id: 's_help', chapter: 1, type: 'reach', amount: 1, radius: 4.5, voice: 'help', reward: { xp: 10 }, guide: { kind: 'portal', island: 'earth' } },
  { id: 's_visit', chapter: 1, type: 'visit', target: 'earth', amount: 1, reward: { gold: 5, xp: 20 }, guide: { kind: 'portal', island: 'earth' } },
  { id: 's_rock3', chapter: 1, type: 'kill', target: 'rock_slime', amount: 3, reward: { gold: 5, xp: 25 }, guide: { kind: 'enemy', id: 'rock_slime' } },
  { id: 's_king', chapter: 1, type: 'kill', target: 'stone_king', amount: 1, reward: { gold: 10, xp: 100 }, guide: { kind: 'enemy', id: 'stone_king' } },
  // --- Глава 2. Первый друг ---
  { id: 's_free', chapter: 2, type: 'tame', amount: 1, reward: { gold: 10, xp: 60 }, guide: { kind: 'cage', element: 'earth' } },
  { id: 's_farm', chapter: 2, type: 'has', target: 'farm', amount: 1, reward: { xp: 20 }, guide: { kind: 'building', id: 'farm', spot: { x: -9, z: -3 } } },
  { id: 's_pen', chapter: 2, type: 'has', target: 'pen', amount: 1, reward: { xp: 20 }, guide: { kind: 'building', id: 'pen', spot: { x: 9, z: -4 } } },
  { id: 's_harvest', chapter: 2, type: 'harvest', amount: 4, reward: { gold: 5, xp: 25 }, guide: { kind: 'building', id: 'farm', spot: { x: -9, z: -3 } } },
  { id: 's_feed', chapter: 2, type: 'fed', amount: 1, reward: { gold: 10, xp: 30 }, guide: { kind: 'beast' } },
];

// Начало новой игры: пляж у обломков корабля (южный берег домашнего острова)
export const BEACH_START = { x: 0, z: 26.5, facing: Math.PI };
export const WRECK = { x: -6.5, z: 29 };
