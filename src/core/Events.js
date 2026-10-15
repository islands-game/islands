// Простая "почта" между модулями: один модуль говорит emit('hit'), другие слушают on('hit', ...).
// Так звук и интерфейс подключаются к игре, не зная друг о друге.
const handlers = new Map();

export const events = {
  on(name, fn) {
    if (!handlers.has(name)) handlers.set(name, []);
    handlers.get(name).push(fn);
  },
  emit(name, ...args) {
    for (const fn of handlers.get(name) ?? []) fn(...args);
  },
};
