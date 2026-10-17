// Общий мир (docs/shared-world.md): гавань, где игроки видят друг друга. Только данные.
export const HUB = {
  island: 'hub',
  roomSize: 20,            // сколько игроков в одной комнате гавани
  maxRooms: 20,
  sendEvery: 0.25,         // как часто отправляем свою позицию (сек)
  timeout: 6,              // сколько секунд молчания — и игрок считается ушедшим
  bubbleSecs: 5,           // сколько висит фраза над головой
  phraseCooldown: 1.2,     // пауза между фразами (сек)
};

// Ник собирается из готовых слов, чтобы никто не мог написать плохое: прилагательное + существо + число.
// Слова на всех языках лежат в i18n (nick.a0.., nick.n0..), каждый видит ник на своём языке.
export const NICK_ADJ = 16;
export const NICK_NOUN = 16;

// Готовые фразы (чат без свободного текста). Текст — i18n phrase.<id>
export const PHRASES = [
  { id: 'hello', icon: '👋' }, { id: 'bye', icon: '🌙' }, { id: 'thanks', icon: '🙏' }, { id: 'sorry', icon: '😅' },
  { id: 'help', icon: '🆘' }, { id: 'follow', icon: '👉' }, { id: 'wait', icon: '✋' }, { id: 'team', icon: '🤝' },
  { id: 'trade', icon: '🔄' }, { id: 'fun', icon: '😄' }, { id: 'wow', icon: '🤩' }, { id: 'gg', icon: '🏆' },
];
