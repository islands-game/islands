// Сюжетное обучение «Путь выжившего»: цепочка заданий, каждое вытекает из предыдущего. План: docs/story-quests.md.
// Герой терпит кораблекрушение, оказывается на необитаемом острове, слышит зов о помощи и спасает первого зверя.
// Чтобы добавить задание: допиши запись сюда и тексты "quest.<id>" во все три языка в i18n.js.
//
//  chapter — глава (название "chapter.<номер>")
//  type    — walk (пройти метров), collect (собрать ресурс, target: wood | stone | any), reach (подойти к цели стрелки),
//            visit (побывать на острове), kill (победить врага, target: id), tame (освободить зверя), has (построена постройка, target: id; amount — сколько штук),
//            harvest (собрать урожай), fed (покормить зверя), level (достичь уровня), carry (иметь в рюкзаке столько ресурса),
//            deposit (сложить в амбар штук), raidWin (отбить нападение слизней; callRaid — игра сама зовёт нападение),
//            hired (сколько гномов нанято), gnomeFood (купить еду у гнома), payDay (зарплата выплачена), sell (продать торговцу штук),
//            buyItem (купить предмет), equip (надеть предмет), upgrade (улучшить постройку), bagUpgrade (расширить рюкзак),
//            fish (поймать рыбу), gatherer (гномов-собирателей), beasts (сколько зверей), beastLevel (уровень лучшего зверя),
//            arena (выиграть матч на арене), arenaPlay (сыграть матч на арене), hasAll (построены все виды построек), celebrate (финал: звание)
//  amount  — сколько
//  reward  — gold (золото: исключение из правил золота, решение владельца 17.10.2026), xp, items
//  guide   — куда показывает стрелка: { kind: 'point', x, z } | { kind: 'node', res } | { kind: 'portal', island } |
//            { kind: 'enemy', id } | { kind: 'cage', element } | { kind: 'building', id, spot: { x, z } } | { kind: 'beast' } |
//            { kind: 'gnome' } | { kind: 'merchant' } | { kind: 'bed' } | { kind: 'missing' } (первая недостающая постройка) | null (стрелки нет)
//  voice   — реплика героя в начале задания (ключ "story.<voice>")
// Весь опыт за задания умножается на этот коэффициент: герой растёт в основном от боёв, а цепочка заканчивается к 10 уровню.
// Подкручивай здесь (проверка: node tools/story-check.js).
export const STORY_XP_SCALE = 0.15;

// Какие постройки надо построить в финале (хотя бы по одной каждого вида)
export const ALL_BUILDINGS = ['wood_platform', 'wall', 'bridge', 'house', 'pen', 'farm', 'barn', 'cave', 'tower', 'trap', 'pier'];

const ALL_BUILDINGS_COUNT = ALL_BUILDINGS.length;

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
  // --- Глава 3. Запасы ---
  { id: 's_wood30', chapter: 3, type: 'carry', target: 'wood', amount: 30, reward: { gold: 8, xp: 10 }, guide: { kind: 'node', res: 'wood' } },
  { id: 's_stone15', chapter: 3, type: 'carry', target: 'stone', amount: 15, reward: { gold: 7, xp: 10 }, guide: { kind: 'node', res: 'stone' } },
  { id: 's_barn', chapter: 3, type: 'has', target: 'barn', amount: 1, reward: { xp: 25 }, guide: { kind: 'building', id: 'barn', spot: { x: 0, z: -8 } } },
  { id: 's_deposit', chapter: 3, type: 'deposit', amount: 20, reward: { gold: 5, xp: 15 }, guide: { kind: 'building', id: 'barn', spot: { x: 0, z: -8 } } },
  // --- Глава 4. Оборона ---
  { id: 's_trap', chapter: 4, type: 'has', target: 'trap', amount: 2, reward: { gold: 10, xp: 20 }, guide: { kind: 'building', id: 'trap', spot: { x: 14, z: 12 } } },
  { id: 's_tower', chapter: 4, type: 'has', target: 'tower', amount: 1, reward: { gold: 25, xp: 30 }, guide: { kind: 'building', id: 'tower', spot: { x: 6, z: 14 } } },
  { id: 's_raid', chapter: 4, type: 'raidWin', amount: 1, callRaid: true, voice: 'raid', reward: { gold: 10, xp: 40 }, guide: { kind: 'enemy', id: 'slime' } },
  // --- Глава 5. Хозяйство ---
  { id: 's_hire', chapter: 5, type: 'hired', amount: 1, reward: { xp: 15 }, guide: { kind: 'gnome' } },
  { id: 's_cave', chapter: 5, type: 'has', target: 'cave', amount: 1, reward: { gold: 30, xp: 25 }, guide: { kind: 'building', id: 'cave', spot: { x: -10, z: -12 } } },
  { id: 's_hire2', chapter: 5, type: 'hired', amount: 2, reward: { gold: 30, xp: 20 }, guide: { kind: 'building', id: 'cave', spot: { x: -10, z: -12 } } },
  { id: 's_gnomeq', chapter: 5, type: 'gnomeFood', amount: 1, reward: { gold: 5, xp: 20 }, guide: { kind: 'gnome' } },
  { id: 's_payday', chapter: 5, type: 'payDay', amount: 1, reward: { gold: 5, xp: 20 }, guide: { kind: 'bed' } },
  // --- Глава 6. Торговля ---
  { id: 's_sell', chapter: 6, type: 'sell', amount: 5, reward: { gold: 5, xp: 15 }, guide: { kind: 'merchant' } },
  { id: 's_buy', chapter: 6, type: 'buyItem', amount: 1, reward: { gold: 25, xp: 25 }, guide: { kind: 'merchant' } },
  { id: 's_equip', chapter: 6, type: 'equip', amount: 1, reward: { gold: 5, xp: 15 }, guide: null },
  // --- Глава 7. Улучшения ---
  { id: 's_upgrade', chapter: 7, type: 'upgrade', amount: 1, reward: { gold: 40, xp: 30 }, guide: { kind: 'building', id: 'barn', spot: { x: 0, z: -8 } } },
  { id: 's_bag', chapter: 7, type: 'bagUpgrade', amount: 1, reward: { gold: 40, xp: 30 }, guide: { kind: 'building', id: 'barn', spot: { x: 0, z: -8 } } },
  // --- Глава 8. Море и рыба ---
  { id: 's_pier', chapter: 8, type: 'has', target: 'pier', amount: 1, reward: { xp: 15 }, guide: { kind: 'building', id: 'pier', spot: { x: 6, z: 28 } } },
  { id: 's_fish3', chapter: 8, type: 'fish', amount: 3, reward: { gold: 5, xp: 15 }, guide: { kind: 'building', id: 'pier', spot: { x: 6, z: 28 } } },
  { id: 's_gatherer', chapter: 8, type: 'gatherer', amount: 1, reward: { gold: 5, xp: 20 }, guide: { kind: 'building', id: 'cave', spot: { x: -10, z: -12 } } },
  // --- Глава 9. Стая ---
  { id: 's_tide', chapter: 9, type: 'kill', target: 'tide_king', amount: 1, reward: { gold: 15, xp: 100 }, guide: { kind: 'enemy', id: 'tide_king' } },
  { id: 's_free2', chapter: 9, type: 'beasts', amount: 2, reward: { gold: 10, xp: 60 }, guide: { kind: 'cage', element: 'water' } },
  { id: 's_evolve', chapter: 9, type: 'beastLevel', amount: 5, reward: { gold: 10, xp: 40 }, guide: { kind: 'beast' } },
  // --- Глава 10. Арена ---
  { id: 's_arena_go', chapter: 10, type: 'visit', target: 'arena', amount: 1, reward: { gold: 5, xp: 10 }, guide: { kind: 'portal', island: 'arena' } },
  { id: 's_arena_play', chapter: 10, type: 'arenaPlay', amount: 1, reward: { gold: 10, xp: 30 }, guide: null },
  { id: 's_arena_win', chapter: 10, type: 'arena', amount: 1, reward: { gold: 15, xp: 40 }, guide: null },
  // --- Финал ---
  { id: 's_allbuild', chapter: 11, type: 'hasAll', amount: ALL_BUILDINGS_COUNT, reward: { gold: 20, xp: 40 }, guide: { kind: 'missing' } },
  { id: 's_level10', chapter: 11, type: 'level', amount: 10, reward: { gold: 10 }, guide: null },
  { id: 's_master', chapter: 11, type: 'celebrate', amount: 1, reward: { gold: 15 }, guide: null },
];

// Начало новой игры: пляж у обломков корабля (южный берег домашнего острова)
export const BEACH_START = { x: 0, z: 26.5, facing: Math.PI };
export const WRECK = { x: -6.5, z: 29 };
