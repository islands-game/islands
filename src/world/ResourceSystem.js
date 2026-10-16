import { RESOURCES } from '../config/resources.js';

const COLLECT_RANGE = 1.9; // расстояние от края объекта

// Сбор ресурсов: находит ближайший объект, забирает ресурс, возвращает его через время.
export class ResourceSystem {
  constructor(world, inventory) {
    this.world = world;
    this.inventory = inventory;
    this.time = 0;
  }

  update(dt) {
    this.time += dt;
    for (const n of this.world.nodes) {
      if (!n.active && this.time >= n.respawnAt) {
        // Если на месте ресурса построили постройку (старое сохранение), он не растёт, а ждёт
        if (this.blocked?.(n)) { n.respawnAt = this.time + 10; continue; }
        this.setActive(n, true);
      }
    }
  }

  setActive(node, on) {
    node.active = on;
    node.obj.visible = on;
    node.collider.active = on;
  }

  nearest(pos) {
    let best = null, bestD = COLLECT_RANGE;
    for (const n of this.world.nodes) {
      if (!n.active || n.locked) continue; // locked — дерево сейчас ожило и ходит монстром
      const d = Math.hypot(pos.x - n.x, pos.z - n.z) - n.collider.r;
      if (d < bestD) { bestD = d; best = n; }
    }
    return best ? { node: best, dist: bestD } : null;
  }

  collect(node) {
    const def = RESOURCES[node.type];
    const [min, max] = def.amount;
    const amount = min + Math.floor(Math.random() * (max - min + 1));
    const got = this.inventory.add(node.type, amount);
    if (got === 0) return { type: node.type, amount: 0, xp: 0, full: true };    // рюкзак полон: ресурс остаётся на месте
    this.setActive(node, false);
    node.respawnAt = this.time + def.respawn;
    return { type: node.type, amount: got, xp: def.xp };
  }

  reset() {
    this.time = 0;
    for (const n of this.world.nodes) this.setActive(n, true);
  }
}
