// Командная арена 5 на 5 (вдохновлена MOBA). Всё, что можно настраивать, собрано здесь.
// Координаты "локальные": (0, 0) — центр арены. Синяя команда (герой-игрок) внизу (z > 0), красная — вверху (z < 0).
export const ARENA = {
  center: { x: 300, z: 0 },
  radius: 58,
  lanes: { left: -28, mid: 0, right: 28 },   // x линий
  baseZ: 46,                                  // кристаллы стоят на z = +46 (синий) и -46 (красный)
  spawnZ: 41,                                 // где появляются герои и крипы
  startDelay: 10,                             // секунд до начала матча
  winXp: 300, winItems: { crystal: 15 },      // награда в основной игре
  loseXp: 80,

  // Башни: на каждой линии у каждой команды две. Внутренняя неуязвима, пока не разрушена внешняя.
  towers: [
    { tier: 1, z: 13, hp: 700 },
    { tier: 2, z: 30, hp: 900 },
  ],
  tower: { atk: 45, range: 10, cooldown: 1.1 },
  crystal: { hp: 1500 },                       // главный кристалл; уязвим, когда разрушена хотя бы одна внутренняя башня

  // Крипы (отряды, идущие по линиям)
  waveEvery: 25,
  minion: { hp: 150, atk: 14, speed: 3.2, range: 2.2, cooldown: 1.1, count: 3 },
  ranged: { hp: 100, atk: 18, speed: 3.2, range: 6, cooldown: 1.3 },

  // Герои. Характеристики одинаковы для всех и не зависят от уровня (честная игра)
  respawnBase: 8, respawnPerDeath: 2, respawnMax: 20,
  baseRegen: 30,                               // лечение у своей базы (хп в секунду)
  heroes: {
    warrior: { name: 'warrior', hp: 600, atk: 32, range: 2.8, speed: 5.6, cooldown: 0.8, color: 0xd9d9d9 },
    archer:  { name: 'archer',  hp: 420, atk: 28, range: 8,   speed: 5.6, cooldown: 0.8, color: 0xe6d8b0 },
    mage:    { name: 'mage',    hp: 380, atk: 24, range: 7,   speed: 5.4, cooldown: 0.9, color: 0xc9b3ff },
  },
  // Способности героя-игрока: 1 — удар по области, 2 — лечение
  spells: {
    slam: { cooldown: 8, radius: 4.5, damage: 70 },
    heal: { cooldown: 20, amount: 150 },
  },
  // Состав команд (первый синий герой — игрок). lane: left | mid | right | jungle
  blueBots: [
    { hero: 'warrior', lane: 'left' }, { hero: 'archer', lane: 'mid' },
    { hero: 'mage', lane: 'right' }, { hero: 'warrior', lane: 'jungle' },
  ],
  redBots: [
    { hero: 'warrior', lane: 'left' }, { hero: 'archer', lane: 'left' },
    { hero: 'mage', lane: 'mid' }, { hero: 'archer', lane: 'right' }, { hero: 'warrior', lane: 'jungle' },
  ],
  playerHero: 'warrior',

  // Лес: лагеря лесных монстров. Победивший монстра забирает его себе, пока тот не погибнет
  camps: [
    { x: -14, z: 22 }, { x: 14, z: 22 }, { x: -14, z: -22 }, { x: 14, z: -22 },
  ],
  monster: { hp: 220, atk: 16, speed: 3.4, range: 2.3, cooldown: 1.2, perCamp: 3, respawn: 60 },
  followerHealRatio: 0.6,                      // с каким здоровьем монстр переходит на сторону победителя

  // Короли появляются по очереди в центре карты (0, 0): сначала Лавовый, потом Ледяной и так далее.
  // Команда, победившая короля, получает его на свою сторону, пока его не убьют.
  kings: [
    { id: 'lava_king',   hp: 2000, atk: 50, slam: { cooldown: 8, windup: 1.2, radius: 6, damage: 80 }, scale: 2.4, color: 0xff4a1a },
    { id: 'frost_giant', hp: 1800, atk: 45, slam: { cooldown: 8, windup: 1.4, radius: 6.5, damage: 70 }, scale: 2.2, color: 0x8fe3ff },
  ],
  kingFirstAt: 150,                            // секунд от начала матча
  kingGap: 90,                                 // пауза после гибели короля до появления следующего
};

// Путь по линии (для синих сверху вниз, для красных зеркально): точки от своей базы к чужой
export function lanePath(lane, team) {
  const x = ARENA.lanes[lane];
  const sign = team === 'blue' ? 1 : -1;
  const zs = [ARENA.spawnZ, 24, 0, -24, -ARENA.spawnZ];
  return zs.map(z => ({ x, z: z * sign }));
}
