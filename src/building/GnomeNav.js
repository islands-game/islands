// Поиск пути для гномов по сетке 1×1 метр вокруг домашнего острова (A*). Нужен, чтобы гномы обходили загоны, дома, амбары, деревья и камни,
// а не упирались в стену по прямой. Препятствия берутся из мира (прямоугольники построек и круги деревьев, камней, опор).
const N = 68, OFF = 34;                      // клетки от -34 до +34 по x и z
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

export class GnomeNav {
  constructor(game) {
    this.game = game;
    this.blocked = null;
    this.stamp = '';
    this.builtAt = -99;
  }

  // Сетка пересобирается, когда построили или снесли постройку, и раз в 8 секунд (деревья и камни вырастают заново)
  grid(now) {
    const w = this.game.world, g = this.game;
    const stamp = `${g.build.placed.length}:${w.rects.length}`;
    if (this.blocked && stamp === this.stamp && now - this.builtAt < 8) return this.blocked;
    const blocked = new Uint8Array(N * N);
    const rects = w.rects.filter(r => !r.team);
    const circles = w.colliders.filter(c => c.active && !c.placeOnly && !c.arena);
    for (let iz = 0; iz < N; iz++) {
      for (let ix = 0; ix < N; ix++) {
        const x = ix - OFF + 0.5, z = iz - OFF + 0.5;
        let b = w.groundAt(x, z) === null || w.islandIdAt(x, z) !== 'home';
        if (!b) for (const r of rects) { if (Math.abs(x - r.x) < r.hw + 0.55 && Math.abs(z - r.z) < r.hd + 0.55) { b = true; break; } }
        if (!b) for (const c of circles) { if (Math.hypot(x - c.x, z - c.z) < c.r + 0.5) { b = true; break; } }
        blocked[iz * N + ix] = b ? 1 : 0;
      }
    }
    this.blocked = blocked; this.stamp = stamp; this.builtAt = now;
    return blocked;
  }

  cell(p) {
    return { ix: Math.max(0, Math.min(N - 1, Math.floor(p.x + OFF))), iz: Math.max(0, Math.min(N - 1, Math.floor(p.z + OFF))) };
  }

  // Ближайшая свободная клетка к клетке c (если сама занята)
  nearestFree(blocked, c) {
    if (!blocked[c.iz * N + c.ix]) return c;
    for (let r = 1; r < 8; r++) {
      let best = null, bd = Infinity;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        const ix = c.ix + dx, iz = c.iz + dz;
        if (ix < 0 || iz < 0 || ix >= N || iz >= N || blocked[iz * N + ix]) continue;
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = { ix, iz }; }
      }
      if (best) return best;
    }
    return null;
  }

  los(blocked, a, b) {
    const d = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.ceil(d / 0.4);
    for (let i = 1; i < steps; i++) {
      const k = i / steps, c = this.cell({ x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k });
      if (blocked[c.iz * N + c.ix]) return false;
    }
    return true;
  }

  // Путь от from к to: список точек {x, z} (последняя — сама цель). [] — идти прямо. null — пути нет.
  path(from, to, now) {
    const blocked = this.grid(now);
    if (this.los(blocked, from, to)) return [];
    const s = this.nearestFree(blocked, this.cell(from)), e = this.nearestFree(blocked, this.cell(to));
    if (!s || !e) return null;
    const gScore = new Float32Array(N * N).fill(Infinity), came = new Int32Array(N * N).fill(-1), closed = new Uint8Array(N * N);
    const idx = c => c.iz * N + c.ix, goal = idx(e);
    const h = (ix, iz) => { const dx = Math.abs(ix - e.ix), dz = Math.abs(iz - e.iz); return dx + dz + (1.414 - 2) * Math.min(dx, dz); };
    const heap = [];                                            // двоичная куча пар [f, индекс]
    const push = (f, i) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { let l = 2 * k + 1, r = l + 1, m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    gScore[idx(s)] = 0; push(h(s.ix, s.iz), idx(s));
    while (heap.length) {
      const [, cur] = pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (cur === goal) break;
      const cx = cur % N, cz = (cur / N) | 0;
      for (const [dx, dz, cost] of DIRS) {
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const ni = nz * N + nx;
        if (blocked[ni] || closed[ni]) continue;
        if (dx && dz && (blocked[cz * N + nx] || blocked[nz * N + cx])) continue;      // по диагонали между двумя препятствиями не лезем
        const g = gScore[cur] + cost;
        if (g < gScore[ni]) { gScore[ni] = g; came[ni] = cur; push(g + h(nx, nz), ni); }
      }
    }
    if (came[goal] === -1 && goal !== idx(s)) return null;
    const cells = [];
    for (let c = goal; c !== -1; c = came[c]) cells.push({ x: (c % N) - OFF + 0.5, z: ((c / N) | 0) - OFF + 0.5 });
    cells.reverse();
    // Выпрямляем: оставляем только точки, между которыми есть прямая видимость
    const out = [];
    let anchor = from;
    for (let i = 0; i < cells.length; i++) {
      const next = cells[i + 1] ?? to;
      if (!this.los(blocked, anchor, next)) { out.push(cells[i]); anchor = cells[i]; }
    }
    out.push({ x: to.x, z: to.z });
    return out;
  }
}
