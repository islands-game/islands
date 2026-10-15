// Короткое обучение. Каждый шаг — подсказка и условие, при котором он считается выполненным.
// game.stats: { kills, collected, built } — счётчики действий с начала игры.
export const TUTORIAL_STEPS = [
  { key: 'tut.move',    done: g => Math.hypot(g.player.pos.x, g.player.pos.z - 6) > 5 },
  { key: 'tut.collect', done: g => g.stats.collected > 0 },
  { key: 'tut.tame',    done: g => g.creatures.collection.length > 0 },
  { key: 'tut.fight',   done: g => g.stats.kills > 0 },
  { key: 'tut.build',   done: g => g.stats.built > 0 },
];

export const TUTORIAL_DONE = TUTORIAL_STEPS.length;
