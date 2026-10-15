// Ресурсы. Чтобы добавить новый — допиши сюда и добавь объект в мир (World.addNode).
// amount — сколько даёт за один сбор, respawn — через сколько секунд появится снова, xp — опыт за сбор.
export const RESOURCES = {
  wood:    { icon: '🌲', amount: [2, 3], respawn: 25, xp: 3 },
  stone:   { icon: '⛰', amount: [2, 3], respawn: 30, xp: 3 },
  crystal: { icon: '💎', amount: [1, 2], respawn: 40, xp: 6 },
};

export const RESOURCE_ORDER = ['wood', 'stone', 'crystal'];
