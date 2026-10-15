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
      if (!n.active && this.time >= n.respawnAt) this.setActive(n, true);
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
      if (!n.active) continue;
      const d = Math.hypot(pos.x - n.x, pos.z - n.z) - n.collider.r;
      if (d < bestD) { bestD = d; best = n; }
    }
    return best ? { node: best, dist: bestD } : null;
  }

  collect(node) {
    const def = RESOURCES[node.type];
    const [min, max] = def.amount;
    const amount = min + Math.floor(Math.random() * (max - min + 1));
    this.inventory.add(node.type, amount);
    this.setActive(node, false);
    node.respawnAt = this.time + def.respawn;
    return { type: node.type, amount, xp: def.xp };
  }

  reset() {
    this.time = 0;
    for (const n of this.world.nodes) this.setActive(n, true);
  }
}
