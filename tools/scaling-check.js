// Проверка дорожающих цен. Запуск: node tools/scaling-check.js
// Печатает цены каждого шага и во сколько раз каждый шаг дороже предыдущего (должно быть больше 1).
import { UPGRADES, BAG } from '../src/config/upgrades.js';
import { hireFee, wage, beastUpkeep } from '../src/config/scaling.js';

const rows = [];
const add = (what, list) => {
  const nums = list.map(v => (typeof v === 'object' ? v.gold : v));
  rows.push({ что: what, цены: list.map(v => (typeof v === 'object' ? JSON.stringify(v) : v)).join(' → '), рост: nums.slice(1).map((v, i) => (v / nums[i]).toFixed(2)).join(', ') });
};

for (const [id, u] of Object.entries(UPGRADES)) add(`улучшение: ${id}`, u.cost);
add('рюкзак', BAG.cost);
add('наём гнома (1, 2, 3, 4 гнома уже есть)', [1, 2, 3, 4].map(n => hireFee(n)));
add('зарплата гнома, уровни 1–5', [1, 2, 3, 4, 5].map(l => wage(l)));
add('еда зверя в сутки, уровни 1, 4, 7, 10, 13, 15', [1, 4, 7, 10, 13, 15].map(l => beastUpkeep(l)));
console.table(rows);

// Каждый следующий шаг должен быть дороже или равен предыдущему
let bad = 0;
for (const r of rows) for (const x of r.рост.split(', ').filter(Boolean)) if (Number(x) < 1) { bad++; console.log('ПЛОХО:', r.что, r.рост); }
console.log(bad ? `Ошибок: ${bad}` : 'Все шаги растут.');
process.exit(bad ? 1 : 0);
