export const MAX_LEVEL = 10;

// Сколько опыта нужно, чтобы перейти с уровня level на следующий
export const xpNeeded = level => 50 + level * 25;

// Добавляет опыт герою. Возвращает true, если получен новый уровень.
export function addXp(player, amount) {
  if (player.level >= MAX_LEVEL) return false;
  player.xp += amount;
  let leveled = false;
  while (player.level < MAX_LEVEL && player.xp >= xpNeeded(player.level)) {
    player.xp -= xpNeeded(player.level);
    player.level++;
    leveled = true;
  }
  if (leveled) {
    player.recalcStats();
    player.hp = player.maxHp;
  }
  if (player.level >= MAX_LEVEL) player.xp = 0;
  return leveled;
}
