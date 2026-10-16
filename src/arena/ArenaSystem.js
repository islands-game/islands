import * as THREE from 'three';
import { ARENA, lanePath } from '../config/arena.js';
import { Unit } from './ArenaUnit.js';
import { HEROES, SKILLS, ELEMENTS, arenaStats } from '../config/heroes.js';
import { castSkill } from '../combat/Skills.js';
import { performHeroAttack } from '../combat/Attacks.js';
import { ELEMENT_FX } from '../config/creatures.js';
import { events } from '../core/Events.js';
import { t } from '../config/i18n.js';

const C = ARENA.center;
const HERO_SCALE = 1.3;   // герои чуть крупнее, чтобы их было видно на маленьком экране
const SIGN = { blue: 1, red: -1 };
const OTHER = { blue: 'red', red: 'blue' };
const LANES = ['left', 'mid', 'right'];
const world = (lx, lz) => ({ x: C.x + lx, z: C.z + lz });
const dist = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
const edge = (a, b) => dist(a, b) - b.radius;                // расстояние до края цели

// Матч 5 на 5: башни, кристаллы, крипы, герои-боты, лес с монстрами и короли.
// Всё в этом файле работает только пока игрок на арене. Игровая логика — на уровне данных из config/arena.js.
export class ArenaSystem {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.world = game.world;
    this.player = game.player;
    this.ui = game.ui;
    this.units = [];
    this.active = false;
    this.phase = 'idle';   // countdown | playing | ended
    this.saved = null;     // состояние игрока в основной игре
    this.facade = this.makeFacade();
  }

  // ---------- вход и выход ----------

  enter() {
    if (this.active) return;
    const g = this.game, p = this.player;
    this.active = true;
    this.saved = { hp: p.hp, maxHp: p.maxHp, def: p.def, day: this.world.day, shield: p.shield };
    this.world.day = 0.25;                       // на арене всегда день
    this.world.applyLighting();
    this.world.timeFrozen = true;
    this.savedCam = g.cameraCtl.pose;
    g.cameraCtl.tactical = true;
    // На телефоне камера ближе и наклонена сильнее, а юниты крупнее — иначе героя не видно
    const landscape = innerHeight <= 520;
    this.unitScale = g.input.isTouch ? (landscape ? 1.7 : 1.5) : 1;
    g.cameraCtl.tacticalDistance = g.input.isTouch ? (landscape ? 19 : 24) : 24;
    g.cameraCtl.tacticalPitch = g.input.isTouch ? 0.85 : 1.0;
    p.mesh.scale.setScalar(HERO_SCALE * this.unitScale);
    document.body.classList.add('arena');
    p.team = 'blue';
    // Спутник участвует в матче с одинаковыми для всех характеристиками
    g.creatures.combat = this.facade;
    g.creatures.setArenaMode(true);
    this.startMatch();
  }

  exit() {
    if (!this.active) return;
    const g = this.game, p = this.player;
    this.clearMatch();
    this.active = false;
    this.phase = 'idle';
    p.team = null;
    p.frozen = false;
    p.mesh.visible = true;
    p.recalcStats();
    p.hp = Math.min(this.saved.hp, p.maxHp);
    p.shield = 0;
    this.world.timeFrozen = false;
    this.world.day = this.saved.day;
    this.world.applyLighting();
    g.cameraCtl.tactical = false;
    p.mesh.scale.setScalar(1);
    g.cameraCtl.snap(this.savedCam ?? { yaw: 0, pitch: 0.35, distance: 9 }, p.pos);
    document.body.classList.remove('arena');
    g.creatures.combat = g.combat;
    g.creatures.setArenaMode(false);
    this.ui.setArena(false);
    this.saved = null;
  }

  // Данные для сохранения, пока игрок на арене (сохраняем состояние основной игры)
  returnSave() {
    return { hp: this.saved?.hp ?? 100 };
  }

  restart() {
    this.clearMatch();
    this.startMatch();
  }

  // ---------- создание матча ----------

  startMatch() {
    const p = this.player;
    this.units = [];
    this.time = 0;
    this.phase = 'countdown';
    this.timer = ARENA.startDelay;
    this.waveTimer = 5;
    this.kingTimer = ARENA.kingFirstAt;
    this.kingIndex = 0;
    this.king = null;
    this.kills = { blue: 0, red: 0 };
    this.goldEarned = 0;
    this.winner = null;
    this.playerAtkCd = 0;
    this.spellCd = [0, 0, 0];
    this.respawnLeft = 0;
    this.camps = ARENA.camps.map(c => ({ ...c, monsters: [], respawnAt: 0 }));

    this.buildTerrain();
    // Башни и кристаллы
    for (const team of ['blue', 'red']) {
      for (const lane of LANES) {
        for (const tw of ARENA.towers) {
          const pos = world(ARENA.lanes[lane], SIGN[team] * tw.z);
          const u = this.add('tower', team, { ...ARENA.tower, hp: tw.hp, tier: tw.tier, radius: 1.3 }, pos.x, pos.z);
          u.lane = lane;
          u.tier = tw.tier;
          this.addCollider(u, 1.5);
        }
      }
      const cp = world(0, SIGN[team] * ARENA.baseZ);
      const crystal = this.add('crystal', team, { hp: ARENA.crystal.hp, radius: 2.4 }, cp.x, cp.z);
      this.addCollider(crystal, 2.6);
    }
    // Лесные монстры
    for (const camp of this.camps) this.fillCamp(camp);
    // Герои
    this.makeHeroes();
    this.placePlayerAtSpawn();
    this.game.ui.setArena(true);
    this.game.ui.toast(t('arenaGet'));
    this.game.ui.showHint('arenaHint');
  }

  add(kind, team, stats, x, z) {
    // Герои, крипы и лесные монстры на телефоне крупнее
    const k = ['hero', 'minion', 'monster'].includes(kind) ? this.unitScale : 1;
    const u = new Unit(this, kind, team, { ...stats, scale: (stats.scale ?? 1) * k }, x, z);
    this.units.push(u);
    return u;
  }

  addCollider(u, r) {
    u.collider = { x: u.pos.x, z: u.pos.z, r, pr: r, active: true, arena: true };
    this.world.colliders.push(u.collider);
  }

  makeHeroes() {
    const make = (team, spec, i, isPlayer) => {
      const base = arenaStats(spec.hero);
      const s = { ...base, radius: 0.5, scale: HERO_SCALE, heroId: spec.hero };
      s.dmgTaken = base.dmgTaken;
      if (isPlayer) s.external = this.player;
      const sp = this.spawnPoint(team, i);
      const u = this.add('hero', team, s, sp.x, sp.z);
      u.heroType = spec.hero;
      u.heroId = spec.hero;
      u.element = HEROES[spec.hero].element;
      u.skillIds = HEROES[spec.hero].skills;
      u.skillCd = [3 + Math.random() * 4, 3 + Math.random() * 4, 3 + Math.random() * 4];
      u.lane = spec.lane;
      u.isPlayer = isPlayer;
      if (isPlayer) u.bar.setColor(0x7dff5a);     // у героя-игрока полоска зелёная
      u.deaths = 0;
      u.lastHurt = -99;
      u.retreat = false;
      u.respawnAt = 0;
      return u;
    };
    this.playerUnit = make('blue', { hero: this.player.heroId, lane: 'mid' }, 0, true);
    ARENA.blueBots.forEach((b, i) => make('blue', b, i + 1, false));
    ARENA.redBots.forEach((b, i) => make('red', b, i, false));
    const p = this.player, hs = arenaStats(p.heroId);
    p.maxHp = hs.hp;
    p.hp = hs.hp;
    p.def = 0;
    p.shield = 0;
    p.frozen = false;
    p.mesh.visible = true;
  }

  spawnPoint(team, i) {
    return world(((i % 5) - 2) * 3, SIGN[team] * (ARENA.spawnZ + 4));
  }

  placePlayerAtSpawn() {
    const sp = this.spawnPoint('blue', 0);
    this.player.pos.set(sp.x, 0, sp.z);
    const cam = this.game.cameraCtl;
    cam.snap({ yaw: 0, pitch: cam.tacticalPitch, distance: cam.tacticalDistance }, this.player.pos);
  }

  fillCamp(camp) {
    for (let i = 0; i < ARENA.monster.perCamp; i++) {
      const a = (i / ARENA.monster.perCamp) * Math.PI * 2;
      const pos = world(camp.x + Math.cos(a) * 1.6, camp.z + Math.sin(a) * 1.6);
      const m = this.add('monster', 'neutral', { ...ARENA.monster, radius: 0.7, scale: 1 }, pos.x, pos.z);
      m.home = { x: pos.x, z: pos.z };
      m.camp = camp;
      camp.monsters.push(m);
    }
  }

  clearMatch() {
    for (const u of this.units) u.dispose();
    this.units = [];
    this.world.colliders = this.world.colliders.filter(c => !c.arena);
    this.world.rects = this.world.rects.filter(r => !r.arena);
    for (const gt of this.gates ?? []) { this.scene.remove(gt.mesh); gt.mesh.geometry.dispose(); gt.mesh.material.dispose(); }
    this.gates = [];
  }

  // Рельеф: каменные хребты поперёк карты на уровне башен. Через них можно пройти только по линии,
  // а на линии стоят ворота — они открываются, когда башня разрушена. Свои ворота свои проходят.
  buildTerrain() {
    this.gates = [];
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x6b6f78, flatShading: true });
    const half = 62, th = 0.7, lh = 3;
    const laneX = Object.values(ARENA.lanes);
    const gateHalf = 4.5;      // ширина ворот 9 — крупные юниты проходят свободно
    const sideGaps = ARENA.camps.map(c => c.x).filter((x, i, a) => a.indexOf(x) === i);   // боковые проходы в лес
    const trees = [];   // точки для сосен и камней на хребтах (рисуются одним InstancedMesh)
    const addWall = (x0, x1, z) => {
      if (x1 - x0 < 0.5) return;
      for (let x = x0 + 1; x < x1 - 0.5; x += 2.6) trees.push({ x: C.x + x, z: C.z + z + ((trees.length % 3) - 1) * 0.35, k: trees.length });
      const rect = { x: C.x + (x0 + x1) / 2, z: C.z + z, hw: (x1 - x0) / 2, hd: th, arena: true };
      this.world.rects.push(rect);
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, lh, th * 2), rockMat);
      const w = { x: rect.x, z: rect.z };
      m.position.set(w.x, lh / 2, w.z);
      m.userData.arenaWall = true;
      this.scene.add(m);
      this.gates.push({ mesh: m, wall: true, rect });
    };
    for (const side of [1, -1]) {
      for (const tw of ARENA.towers) {
        const z = side * tw.z;
        // Проёмы: ворота линий и (на первом ярусе) боковые проходы к лесу. Через боковой проход можно только в лес до второй башни.
        const gaps = laneX.map(lx => [lx - gateHalf, lx + gateHalf]);
        if (tw.tier === 1) for (const sx of sideGaps) gaps.push([sx - 3.5, sx + 3.5]);
        gaps.sort((a, b) => a[0] - b[0]);
        let from = -half;
        for (const [g0, g1] of gaps) { addWall(from, g0, z); from = g1; }
        addWall(from, half, z);
        const team = side > 0 ? 'blue' : 'red';
        for (const [lane, lx] of Object.entries(ARENA.lanes)) {
          const rect = { x: C.x + lx, z: C.z + z, hw: gateHalf, hd: th, team, arena: true };
          this.world.rects.push(rect);
          const mat = new THREE.MeshLambertMaterial({ color: side > 0 ? 0x4a78c9 : 0xc94a4a, transparent: true, opacity: 0.55, flatShading: true });
          const m = new THREE.Mesh(new THREE.BoxGeometry(gateHalf * 2, lh, th * 2), mat);
          const w = world(lx, z);
          m.position.set(w.x, lh / 2, w.z);
          this.scene.add(m);
          this.gates.push({ mesh: m, rect, team, lane, tier: tw.tier });
        }
      }
    }
    this.addRidgeDecor(trees.filter(t => Math.hypot(t.x - C.x, t.z - C.z) < ARENA.radius - 3), lh);
  }

  // Сосны и камни на хребтах: две общие геометрии, по одному вызову отрисовки на каждую
  addRidgeDecor(points, wallTop) {
    const pine = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 2.6, 6), new THREE.MeshLambertMaterial({ color: 0x1f5a2c, flatShading: true }), points.length);
    const rock = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.7, 0), new THREE.MeshLambertMaterial({ color: 0x8a8f99, flatShading: true }), points.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3();
    points.forEach((p, i) => {
      const big = 0.8 + (p.k % 4) * 0.12;
      s.set(big, big, big);
      pos.set(p.x, wallTop + 1.1 * big, p.z);
      pine.setMatrixAt(i, m.compose(pos, q, s));
      s.set(1, 0.8, 1.2);
      pos.set(p.x + 1.3, wallTop + 0.3, p.z);
      rock.setMatrixAt(i, m.compose(pos, q, s));
    });
    for (const im of [pine, rock]) {
      im.instanceMatrix.needsUpdate = true;
      im.frustumCulled = false;
      this.scene.add(im);
      this.gates.push({ mesh: im, wall: true });
    }
  }

  openGate(tower) {
    for (const gt of this.gates ?? []) {
      if (gt.wall || gt.team !== tower.team || gt.lane !== tower.lane || gt.tier !== tower.tier) continue;
      this.world.rects = this.world.rects.filter(r => r !== gt.rect);
      gt.mesh.visible = false;
    }
  }

  // ---------- общие правила боя ----------

  isEnemy(a, b) {
    if (a.team === b.team) return false;
    if (a.team === 'neutral') return true;
    if (b.team === 'neutral') return a.kind === 'hero' || !!a.owner;  // нейтралов бьют герои и спутники
    return true;
  }

  targetable(b) {
    return !b.dead && !b.shielded;
  }

  // Лучшая цель для a в радиусе range (от края цели). bias — предпочтения по типам: меньше = важнее
  findTarget(a, range, bias) {
    let best = null, bestScore = Infinity;
    for (const b of this.units) {
      if (b === a || !this.targetable(b) || !this.isEnemy(a, b)) continue;
      const d = edge(a, b);
      if (d > range) continue;
      const score = d + (bias[b.kind] ?? 0);
      if (score < bestScore) { bestScore = score; best = b; }
    }
    return best;
  }

  // Ближайший враг к точке (для спутника игрока): нейтралы тоже считаются
  nearestEnemyTo(pos, range, team) {
    let best = null, bestD = range;
    for (const b of this.units) {
      if (b.team === team || !this.targetable(b)) continue;
      const d = Math.hypot(b.pos.x - pos.x, b.pos.z - pos.z);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  makeFacade() {
    const sys = this;
    return {
      nearestEnemy: (pos, range) => sys.nearestEnemyTo(pos, range, 'blue'),
      enemyNear: (pos, range) => !!sys.nearestEnemyTo(pos, range, 'blue'),
      ring: (...a) => sys.game.combat.ring(...a),
      creatureHit(c, target, dmg) {
        const hit = () => { if (target.dead) return; target.takeDamage(dmg, sys.playerUnit); sys.beastElement(c, target, dmg); };
        if (c.def.basicRange > 3) sys.game.combat.projectile(c.pos, target, c.def.color, hit);
        else hit();
      },
      breath(c, target, dmg, aoe, color = 0xff5a1a) {
        sys.game.combat.projectile(c.pos, target, color, () => {
          sys.game.combat.ring(target.pos, color, aoe * 1.6, 0.4);
          for (const b of sys.units.slice()) {
            if (!sys.targetable(b) || !sys.isEnemy(sys.playerUnit, b) || b.kind === 'tower' || b.kind === 'crystal') continue;
            if (Math.hypot(b.pos.x - target.pos.x, b.pos.z - target.pos.z) - b.radius > aoe) continue;
            b.takeDamage(Math.round(dmg), sys.playerUnit);
            sys.beastElement(c, b, dmg);
          }
        }, 0.35, 0.5);
      },
      fireball(c, target, dmg, color = 0xff5a1a) {
        sys.game.combat.projectile(c.pos, target, color, () => {
          if (target.dead) return;
          sys.game.combat.ring(target.pos, color, 2.5, 0.35);
          target.takeDamage(Math.round(dmg), sys.playerUnit);
        }, 0.35, 0.45);
      },
    };
  }

  // Стихия зверя игрока на арене: огонь поджигает, лёд замедляет, вода лечит героя
  beastElement(c, target, dmg) {
    const fx = ELEMENT_FX[c.def.element];
    if (!fx || target.dead) return;
    if (fx.burn) this.burnUnit(target, this.playerUnit, dmg * fx.burn, 3);
    if (fx.slow) this.slowUnit(target, fx.slow, 1.5);
    if (fx.drain) this.playerUnit.heal(dmg * fx.drain);
  }

  // Атака: ближняя бьёт сразу, дальняя пускает снаряд
  attack(a, b) {
    if (a.atkCd > 0 || !this.targetable(b)) return false;
    a.atkCd = a.cooldown;
    a.facing = Math.atan2(b.pos.x - a.pos.x, b.pos.z - a.pos.z);
    const dmg = a.atk;
    if (a.heroId) {                                   // герой: механика оружия (бумеранг, веер, молния…)
      const ctx = this.skillCtx(a);
      performHeroAttack(ctx, a.heroId, ctx.adapt(b), dmg);
      if (a.isPlayer) events.emit('swing');
      return true;
    }
    const apply = () => {
      if (b.dead) return;
      const dealt = b.takeDamage(dmg, a);
      if (dealt > 0 && (a.isPlayer || b.isPlayer)) this.number(b, dealt, b.isPlayer ? '#ff6b6b' : '#ffffff');
    };
    if (a.range > 3.2) this.game.combat.projectile(a.pos, b, a.team === 'blue' ? 0x7ab8ff : a.team === 'red' ? 0xff7a7a : 0xffd27a, apply, 0.28);
    else apply();
    if (a.isPlayer) events.emit('swing');
    return true;
  }

  number(unit, amount, color) {
    const p = unit.pos.clone();
    p.y += 2.2;
    this.ui.floatText(p, `-${Math.round(amount)}`, color);
  }

  // Движение в точку (остановиться на stop от неё). Возвращает true, если двигался
  moveTo(u, tx, tz, dt, stop = 0.1, speedMul = 1) {
    const dx = tx - u.pos.x, dz = tz - u.pos.z, d = Math.hypot(dx, dz);
    if (d <= stop + 0.08) return false;   // запас, чтобы юнит не застревал у самой границы
    const step = Math.min(u.speed * speedMul * this.speedFactor(u) * dt, d - stop);
    const ox = u.pos.x, oz = u.pos.z;
    u.pos.x += (dx / d) * step;
    u.pos.z += (dz / d) * step;
    this.world.resolveCollisions(u.pos, u.radius, u.team);
    if (this.world.groundAt(u.pos.x, u.pos.z) === null) { u.pos.x = ox; u.pos.z = oz; }
    u.facing = Math.atan2(dx, dz);
    return true;
  }

  // ---------- смерти ----------

  killUnit(u, killer) {
    if (u.dead) return;
    const kteam = killer?.team ?? null;
    // Лесной монстр и король, побеждённые героем (или его спутником), переходят на его сторону
    if ((u.kind === 'monster' || u.kind === 'king') && u.team === 'neutral') {
      const owner = killer?.kind === 'hero' ? killer : killer?.owner;
      if (owner) return this.convert(u, owner);
    }
    u.dead = true;
    u.hp = 0;
    if (u.collider) u.collider.active = false;
    if (u.kind === 'hero') this.onHeroDeath(u, killer);
    else if (u.kind === 'tower') { this.openGate(u); this.fall(u); }
    else if (u.kind === 'crystal') { this.fall(u); this.endMatch(kteam ?? OTHER[u.team]); }
    else if (u.kind === 'king') this.onKingDeath(u);
    else if (u.kind === 'monster') this.onMonsterDeath(u);
    // Золото игроку: за убитых им (или его зверем) врагов и за башни, разрушенные его командой
    if (killer === this.playerUnit && u.team !== 'blue') {
      if (u.kind === 'hero') this.awardGold(ARENA.gold.hero, u);
      else if (u.kind === 'minion') this.awardGold(ARENA.gold.minion, u);
      else if (u.kind === 'monster') this.awardGold(ARENA.gold.monster, u);
    }
    if (u.kind === 'tower' && u.team === 'red' && killer?.team === 'blue') this.awardGold(ARENA.gold.tower, u);
    if (u.kind !== 'hero') {
      // Остальные исчезают
      this.game.combat.ring(u.pos, TEAM_RING[u.team] ?? 0xffffff, u.kind === 'tower' || u.kind === 'crystal' ? 6 : 2, 0.5);
      u.dispose();
    }
  }

  fall(u) {
    events.emit('slam');
    this.ui.toast(u.kind === 'crystal' ? t('arenaCrystalFell') : `${t(u.team === 'blue' ? 'arenaBlueTower' : 'arenaRedTower')}`);
  }

  convert(u, owner) {
    u.setTeam(owner.team);
    u.owner = owner;
    u.hp = Math.round(u.maxHp * ARENA.followerHealRatio);
    u.lastAttacker = null;
    u.provoked = null;
    if (u.camp) u.camp.monsters = u.camp.monsters.filter(m => m !== u);
    if (u.kind === 'king') {
      u.path = lanePath('mid', owner.team);
      u.wp = 1;
      u.slamCd = 3;
      this.ui.toast(`${t('enemy.' + u.kingId)}: ${t(owner.team === 'blue' ? 'arenaKingBlue' : 'arenaKingRed')}`);
      events.emit('levelUp');
    } else if (owner.isPlayer) {
      this.ui.toast(t('arenaFollower'));
      events.emit('tame');
    }
    this.game.combat.ring(u.pos, TEAM_RING[owner.team], 4, 0.6);
  }

  onMonsterDeath(u) {
    if (u.camp) {
      u.camp.monsters = u.camp.monsters.filter(m => m !== u);
      if (!u.camp.monsters.length && !u.camp.respawnAt) u.camp.respawnAt = this.time + ARENA.monster.respawn;
    }
  }

  onKingDeath(u) {
    this.king = null;
    this.kingIndex++;
    this.kingTimer = ARENA.kingGap;
    this.ui.toast(`${t('enemy.' + u.kingId)}: ${t('arenaKingGone')}`);
  }

  onHeroDeath(u, killer) {
    u.deaths++;
    const scorer = killer && killer.team !== u.team && killer.team !== 'neutral' ? killer.team : OTHER[u.team];
    this.kills[scorer]++;
    u.respawnAt = this.time + Math.min(ARENA.respawnMax, ARENA.respawnBase + ARENA.respawnPerDeath * u.deaths);
    u.mesh.visible = false;
    u.retreat = false;
    if (u.isPlayer) {
      this.player.frozen = true;
      this.player.mesh.visible = false;
      this.ui.toast(t('arenaDied'));
    }
    events.emit('kill');
  }

  respawnHero(u) {
    u.dead = false;
    u.mesh.visible = true;
    const idx = this.units.filter(x => x.kind === 'hero' && x.team === u.team).indexOf(u);
    const sp = this.spawnPoint(u.team, idx);
    u.pos.set(sp.x, 0, sp.z);
    if (u.isPlayer) {
      this.player.hp = this.player.maxHp;
      this.player.frozen = false;
      this.player.mesh.visible = true;
      this.player.pos.set(sp.x, 0, sp.z);
      this.game.cameraCtl.target.copy(this.player.pos);
    }
    u.hp = u.maxHp;
    u.burnT = u.slowT = u.hasteT = u.shieldT = 0;
    u.shieldAmt = 0;
  }

  // Золото за матч копится и выдаётся в конце (в основную игру)
  awardGold(n, at) {
    this.goldEarned += n;
    const p = at.pos.clone();
    p.y += 2.8;
    this.ui.floatText(p, `+${n} 🪙`, '#ffd23f');
  }

  endMatch(winner) {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    this.winner = winner;
    const win = winner === 'blue';
    if (win) this.goldEarned += ARENA.gold.win;
    this.ui.showArenaResult(win, this.kills, this.time, this.goldEarned);
    events.emit(win ? 'levelUp' : 'hurt');
    this.game.onArenaEnd(win, this.goldEarned);
  }

  // ---------- каждый кадр ----------

  update(dt) {
    if (!this.active) return;
    const cam = this.game.camera;
    this.time += dt;
    if (this.phase === 'countdown') {
      this.timer -= dt;
      this.ui.setArenaCountdown(Math.ceil(this.timer));
      if (this.timer <= 0) { this.phase = 'playing'; this.ui.setArenaCountdown(0); this.time = 0; this.ui.toast(t('arenaGo')); events.emit('raid'); }
    } else if (this.phase === 'playing') {
      this.spawnLogic(dt);
      this.updateShields();
      this.playerAtkCd = Math.max(0, this.playerAtkCd - dt);
      for (let i = 0; i < 3; i++) this.spellCd[i] = Math.max(0, this.spellCd[i] - dt);
      const p = this.player, pu = this.playerUnit;
      pu.hp = p.hp;
      pu.maxHp = p.maxHp;
      for (const u of this.units.slice()) {
        u.atkCd = Math.max(0, u.atkCd - dt);
        if (u.dead && u.kind !== 'hero') continue;
        this.tickStatus(u, dt);
        this.think(u, dt);
      }
      this.units = this.units.filter(u => !u.dead || u.kind === 'hero');
    }
    for (const u of this.units) if (!u.dead || u.kind === 'hero') u.syncMesh(dt, cam);
    this.drawHud(dt);
  }

  // Башни уязвимы по порядку: внутренняя — после внешней, кристалл — после разрушения любой внутренней
  updateShields() {
    for (const team of ['blue', 'red']) {
      const towers = this.units.filter(u => u.kind === 'tower' && u.team === team && !u.dead);
      const innerDown = LANES.some(l => !this.units.some(u => u.kind === 'tower' && u.team === team && u.lane === l && u.tier === 2 && !u.dead));
      for (const u of this.units) {
        if (u.team !== team) continue;
        if (u.kind === 'tower' && u.tier === 2) u.shielded = towers.some(o => o.lane === u.lane && o.tier === 1);
        if (u.kind === 'crystal') u.shielded = !innerDown;
      }
    }
  }

  spawnLogic(dt) {
    // Волны крипов
    this.waveTimer -= dt;
    if (this.waveTimer <= 0) {
      this.waveTimer = ARENA.waveEvery;
      for (const team of ['blue', 'red']) for (const lane of LANES) this.spawnWave(team, lane);
    }
    // Возрождение лагерей
    for (const camp of this.camps) {
      if (camp.respawnAt && this.time >= camp.respawnAt) { camp.respawnAt = 0; this.fillCamp(camp); }
    }
    // Короли по очереди
    if (!this.king) {
      this.kingTimer -= dt;
      if (this.kingTimer <= 0) this.spawnKing();
    }
    // Возрождение героев
    for (const u of this.units) if (u.kind === 'hero' && u.dead && this.time >= u.respawnAt) this.respawnHero(u);
    this.respawnLeft = this.playerUnit.dead ? Math.max(0, Math.ceil(this.playerUnit.respawnAt - this.time)) : 0;
  }

  spawnWave(team, lane) {
    const path = lanePath(lane, team);
    const n = ARENA.minion.count;
    for (let i = 0; i < n + 1; i++) {
      const ranged = i === n;
      const s = ranged ? { ...ARENA.ranged, ranged: true, radius: 0.45, cooldown: ARENA.ranged.cooldown }
        : { ...ARENA.minion, radius: 0.45 };
      const pos = world(path[0].x + (i - n / 2) * 0.9, path[0].z);
      const u = this.add('minion', team, s, pos.x, pos.z);
      u.lane = lane;
      u.path = path;
      u.wp = 1;
    }
  }

  spawnKing() {
    const def = ARENA.kings[this.kingIndex % ARENA.kings.length];
    const pos = world(0, 0);
    const k = this.add('king', 'neutral', { hp: def.hp, atk: def.atk, range: 3.2, speed: 2.8, cooldown: 1.5, radius: 1.6, scale: def.scale, color: def.color }, pos.x, pos.z);
    k.kingId = def.id;
    k.slam = def.slam;
    k.slamCd = 4;
    k.home = { x: pos.x, z: pos.z };
    this.king = k;
    this.ui.toast(`${t('enemy.' + def.id)}: ${t('arenaKingAppears')}`);
    events.emit('raidWarn');
  }

  // ---------- мышление юнитов ----------

  think(u, dt) {
    if (u.kind === 'tower') return this.thinkTower(u);
    if (u.kind === 'crystal') return;
    if (u.kind === 'hero') return u.isPlayer ? this.thinkPlayerUnit(u, dt) : this.thinkBot(u, dt);
    if (u.team === 'neutral') return this.thinkNeutral(u, dt);
    if (u.kind === 'monster' && u.owner) return this.thinkFollower(u, dt);
    return this.thinkMarcher(u, dt);
  }

  thinkTower(u) {
    const target = this.findTarget(u, u.range, { minion: -4, hero: 0, monster: 3, king: 0 });
    if (target) this.attack(u, target);
  }

  // Игрок сам управляет героем: юнит лишь следит за регенерацией
  thinkPlayerUnit(u, dt) {
    const p = this.player;
    if (p.frozen) return;
    const crystal = this.units.find(x => x.kind === 'crystal' && x.team === 'blue' && !x.dead);
    const atBase = crystal && dist(u, crystal) < 10;
    if (atBase) p.heal(ARENA.baseRegen * dt);
  }

  heroRegen(u, dt) {
    const crystal = this.units.find(x => x.kind === 'crystal' && x.team === u.team && !x.dead);
    if (crystal && dist(u, crystal) < 10) u.heal(ARENA.baseRegen * dt);
    else if (this.time - u.lastHurt > 4) u.heal(4 * dt);
  }

  // Герой-бот
  thinkBot(u, dt) {
    if (u.dead) return;
    this.heroRegen(u, dt);
    const hr = u.hp / u.maxHp;
    const home = this.units.find(x => x.kind === 'crystal' && x.team === u.team && !x.dead);
    const base = home ? home.pos : world(0, SIGN[u.team] * ARENA.baseZ);
    if (u.retreat) {
      this.moveTo(u, base.x, base.z + SIGN[u.team] * -4, dt, 1);
      if (hr > 0.85) u.retreat = false;
      return;
    }
    if (hr < 0.3) { u.retreat = true; return; }

    this.botSkills(u, dt);

    // Цель: герой (если здоров), потом крипы, потом постройки
    const bias = hr > 0.5 ? { hero: -3, minion: 0, monster: 1, king: 2, tower: 5, crystal: 5 } : { minion: 0, monster: 1, hero: 4, king: 6, tower: 6, crystal: 6 };
    let role = u.lane;
    if (role === 'jungle') {
      // Лесной бот: сначала лес, потом король
      if (this.king && this.king.team === 'neutral' && hr > 0.7 && this.time > ARENA.kingFirstAt - 5) {
        return this.engage(u, this.king, dt);
      }
      const camp = this.nearestCamp(u);
      if (camp) {
        const target = camp.monsters.find(m => !m.dead && m.team === 'neutral');
        if (target) return this.engage(u, target, dt);
        const c = world(camp.x, camp.z);
        this.moveTo(u, c.x, c.z, dt, 1.5);
        return;
      }
      role = 'mid';
    }
    const target = this.findTarget(u, u.range + 3, bias);
    if (target && this.safeToEngage(u, target)) return this.engage(u, target, dt);
    // Иначе идём за своими крипами по линии
    const path = lanePath(role, u.team);
    const anchor = this.laneAnchor(u, role, path);
    this.moveTo(u, anchor.x, anchor.z, dt, 2);
  }

  nearestCamp(u) {
    let best = null, bestD = Infinity;
    for (const c of this.camps) {
      if (!c.monsters.some(m => !m.dead && m.team === 'neutral')) continue;
      if (Math.sign(c.z) !== SIGN[u.team] && Math.abs(c.z) > 1) continue;      // только свой край леса
      const w = world(c.x, c.z);
      const d = Math.hypot(w.x - u.pos.x, w.z - u.pos.z);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  // Точка на линии, куда идёт бот: за самым дальним своим крипом, иначе у своей внешней башни
  laneAnchor(u, lane, path) {
    let front = null, bestProgress = -Infinity;
    for (const m of this.units) {
      if (m.kind !== 'minion' || m.team !== u.team || m.lane !== lane || m.dead) continue;
      const progress = -SIGN[u.team] * m.pos.z;       // чем дальше к чужой базе, тем больше
      if (progress > bestProgress) { bestProgress = progress; front = m; }
    }
    if (front) return { x: front.pos.x, z: front.pos.z + SIGN[u.team] * 2.5 };
    const tower = this.units.find(x => x.kind === 'tower' && x.team === u.team && x.lane === lane && !x.dead && x.tier === 1)
      ?? this.units.find(x => x.kind === 'tower' && x.team === u.team && x.lane === lane && !x.dead);
    const w = tower ? tower.pos : world(ARENA.lanes[lane], SIGN[u.team] * ARENA.spawnZ);
    return { x: w.x, z: w.z + SIGN[u.team] * 3 };
  }

  // Не лезть под башню без поддержки крипов
  safeToEngage(u, target) {
    for (const tw of this.units) {
      if (tw.kind !== 'tower' || tw.dead || tw.team === u.team) continue;
      if (Math.hypot(tw.pos.x - target.pos.x, tw.pos.z - target.pos.z) < ARENA.tower.range + 1) {
        const allies = this.units.filter(m => m.kind === 'minion' && m.team === u.team && !m.dead && dist(m, tw) < ARENA.tower.range + 3).length;
        return allies >= 2 || target.kind === 'tower' && allies >= 1;
      }
    }
    return true;
  }

  engage(u, target, dt) {
    const d = edge(u, target);
    if (d > u.range) this.moveTo(u, target.pos.x, target.pos.z, dt, u.range * 0.8 + target.radius);
    else {
      if (u.range > 3.2 && d < u.range * 0.5) this.moveTo(u, u.pos.x, u.pos.z + SIGN[u.team] * 3, dt, 0.1);   // лучники отходят
      this.attack(u, target);
    }
  }

  // Крип, король-союзник и лесной монстр без хозяина: идут по линии и бьют встречных
  thinkMarcher(u, dt) {
    const bias = { minion: 0, hero: 1, monster: 1, king: 1, tower: 5, crystal: 5 };
    const aggro = u.kind === 'king' ? 10 : 7;
    const target = this.findTarget(u, aggro, bias);
    if (u.kind === 'king' && u.slam) this.kingSlam(u, target);
    if (target) return this.engage(u, target, dt);
    const wp = u.path[Math.min(u.wp, u.path.length - 1)];
    const w = world(wp.x, wp.z);
    if (!this.moveTo(u, w.x, w.z, dt, 1.5) && u.wp < u.path.length - 1) u.wp++;
    else if (u.wp >= u.path.length - 1) {
      // У вражеской базы: бьём кристалл
      const crystal = this.units.find(x => x.kind === 'crystal' && x.team === OTHER[u.team] && !x.dead);
      if (crystal) this.engage(u, crystal, dt);
    }
  }

  // Лесной монстр, ставший спутником героя: ходит за ним и защищает
  thinkFollower(u, dt) {
    const owner = u.owner;
    const target = this.findTarget(u, 7, { minion: 0, hero: -1, monster: 1, king: 1, tower: 6, crystal: 6 });
    if (target && (owner.dead || dist(u, owner) < 14)) return this.engage(u, target, dt);
    if (owner.dead) {
      const crystal = this.units.find(x => x.kind === 'crystal' && x.team === u.team && !x.dead);
      if (crystal) this.moveTo(u, crystal.pos.x, crystal.pos.z - SIGN[u.team] * 4, dt, 1);
      return;
    }
    this.moveTo(u, owner.pos.x + 1.6, owner.pos.z + 1.6, dt, 2, dist(u, owner) > 8 ? 1.5 : 1);
  }

  // Нейтралы (лес и король): не нападают, пока их не тронули; отбегают назад, если герой убежал
  thinkNeutral(u, dt) {
    const attacker = u.lastAttacker;
    if (attacker && !attacker.dead && Math.hypot(attacker.pos.x - u.home.x, attacker.pos.z - u.home.z) < 16) {
      if (u.kind === 'king' && u.slam) this.kingSlam(u, attacker);
      return this.engage(u, attacker, dt);
    }
    u.lastAttacker = null;
    this.moveTo(u, u.home.x, u.home.z, dt, 0.6);
    u.heal(u.maxHp * 0.04 * dt);
  }

  // Удар короля по области: красное кольцо, потом урон врагам внутри
  kingSlam(k, target) {
    if (!target || k.slamCd > 0 || k.slamming) return;
    const s = k.slam;
    if (edge(k, target) > s.radius) return;
    k.slamming = true;
    k.slamCd = s.cooldown;
    const center = { x: k.pos.x, y: 0, z: k.pos.z };
    this.game.combat.telegraph(center, s.radius, s.windup, () => {
      k.slamming = false;
      if (k.dead) return;
      this.game.combat.ring(center, 0xff6a2a, s.radius * 1.5, 0.5);
      events.emit('slam');
      for (const b of this.units) {
        if (!this.targetable(b) || !this.isEnemy(k, b) || b.kind === 'tower' || b.kind === 'crystal') continue;
        if (Math.hypot(b.pos.x - center.x, b.pos.z - center.z) < s.radius + b.radius) {
          const dealt = b.takeDamage(s.damage, k);
          if (b.isPlayer && dealt > 0) this.number(b, dealt, '#ff6b6b');
        }
      }
    });
  }

  // Удар по области вокруг героя
  areaDamage(u, radius, damage) {
    this.game.combat.ring(u.pos, 0xffd27a, radius * 1.2, 0.4);
    events.emit('slam');
    for (const b of this.units) {
      if (b === u || !this.targetable(b) || !this.isEnemy(u, b)) continue;
      if (edge(u, b) < radius) {
        const dealt = b.takeDamage(damage, u);
        if (u.isPlayer && dealt > 0) this.number(b, dealt, '#ffd27a');
      }
    }
  }

  // ---------- действия игрока ----------

  playerAttack() {
    if (this.phase !== 'playing' || this.playerUnit.dead || this.playerAtkCd > 0) return;
    const u = this.playerUnit;
    const target = this.findTarget(u, u.range, { hero: -2, minion: 0, monster: 0, king: 0, tower: 3, crystal: 3 });
    this.playerAtkCd = u.cooldown;
    u.atkCd = 0;
    if (!target) {
      events.emit('swing');
      const f = new THREE.Vector3(Math.sin(this.player.facing), 0, Math.cos(this.player.facing)).multiplyScalar(1.4).add(this.player.pos);
      this.game.combat.ring(f, 0xffffff, 1.2, 0.2);
      return;
    }
    this.player.facing = Math.atan2(target.pos.x - this.player.pos.x, target.pos.z - this.player.pos.z);
    u.pos.copy(this.player.pos);
    this.attack(u, target);
  }

  // Умения героя-игрока: 1, 2, 3 (клавиши 2, 3, 4)
  castSpell(n) {
    const i = n - 1;
    if (this.phase !== 'playing' || this.playerUnit.dead || this.spellCd[i] > 0) return;
    const u = this.playerUnit;
    u.pos.copy(this.player.pos);
    u.facing = this.player.facing;
    const id = u.skillIds[i];
    if (!id) return;
    if (!castSkill(this.skillCtx(u), id)) return this.ui.toast(t('noTarget'));
    this.spellCd[i] = SKILLS[id].cooldown;
    events.emit('slam');
  }

  // ---------- статусы: горение, замедление, ускорение, щит ----------

  speedFactor(u) {
    if (u.s.external) return 1;                        // игрок: скорость считает сам Player
    return (u.slowT > 0 ? u.slowMul : 1) * (u.hasteT > 0 ? u.hasteMul : 1);
  }

  burnUnit(b, source, total, time) {
    b.burnT = time;
    b.burnDps = total / time;
    b.burnAcc = 0;
    b.burnSource = source;
  }

  slowUnit(b, mul, time) {
    b.slowT = time;
    b.slowMul = 1 - mul;
    if (b.s.external) b.s.external.slowT = time;
  }

  shieldUnit(b, amount, time) {
    if (b.s.external) return b.s.external.addShield(amount, time);
    b.shieldAmt = Math.max(b.shieldAmt ?? 0, amount);
    b.shieldT = time;
  }

  tickStatus(u, dt) {
    if (u.dead) return;
    if (u.slowT > 0) u.slowT -= dt;
    if (u.hasteT > 0) u.hasteT -= dt;
    if (u.shieldT > 0) { u.shieldT -= dt; if (u.shieldT <= 0) u.shieldAmt = 0; }
    if (u.burnT > 0) {
      u.burnT -= dt;
      u.burnAcc += dt;
      if (u.burnAcc >= 1) {
        u.burnAcc -= 1;
        const dealt = u.takeDamage(Math.max(1, Math.round(u.burnDps)), u.burnSource);
        if (dealt > 0 && (u.isPlayer || u.burnSource?.isPlayer)) this.number(u, dealt, '#ff8a3d');
      }
    }
  }

  // Подключение умений (combat/Skills.js) к юнитам арены
  skillCtx(u, aim = null) {
    const g = this.game, p = this.player, sys = this;
    const isPlayer = !!u.s.external;
    const color = ELEMENTS[u.element ?? 'fire'].color;
    const foeAdapter = b => ({
      pos: b.pos, radius: b.radius,
      get hpRatio() { return b.hp / b.maxHp; },
      hit: d => {
        const dealt = b.takeDamage(d, u);
        if (dealt > 0 && (u.isPlayer || b.isPlayer)) sys.number(b, dealt, b.isPlayer ? '#ff6b6b' : '#ffffff');
      },
      slow: (m, s) => sys.slowUnit(b, m, s),
      burn: (total, s) => sys.burnUnit(b, u, total, s),
    });
    const allyAdapter = b => ({
      pos: b.pos, get maxHp() { return b.maxHp; },
      heal: n => {
        const before = b.hp;
        b.heal(n);
        const got = Math.round((b.s.external ? p.hp : b.hp) - before);
        if (got > 0 && (u.isPlayer || b.isPlayer)) {
          const at = b.pos.clone(); at.y += 2.2;
          sys.ui.floatText(at, `+${got}`, '#6bff9a');
        }
      },
      shield: (n, s) => sys.shieldUnit(b, n, s),
    });
    return {
      caster: { pos: u.pos, facing: u.facing, hit: u.atk, color },
      foes: r => this.units
        .filter(b => this.targetable(b) && this.isEnemy(u, b) && b.kind !== 'tower' && b.kind !== 'crystal' && edge(u, b) <= r)
        .sort((a, b) => dist(u, a) - dist(u, b))
        .map(foeAdapter),
      allies: r => this.units
        .filter(b => !b.dead && b.team === u.team && (b === u || (r > 0.5 && (b.kind === 'hero' || b.kind === 'minion') && dist(u, b) <= r)))
        .map(allyAdapter),
      slide: (dx, dz, d) => {
        if (isPlayer) { const m = p.slide(dx, dz, d); u.pos.copy(p.pos); return m; }
        return this.slideUnit(u, dx, dz, d);
      },
      dir: () => {
        if (aim) return aim;
        if (isPlayer) {
          const input = g.input, mx = input.move.x, my = input.move.y;
          if (Math.hypot(mx, my) > 0.1) {
            const yaw = g.cameraCtl.yaw, sin = Math.sin(yaw), cos = Math.cos(yaw);
            return { x: mx * cos + my * sin, z: -mx * sin + my * cos };
          }
        }
        return { x: Math.sin(u.facing), z: Math.cos(u.facing) };
      },
      lifesteal: n => allyAdapter(u).heal(n),
      later: (s, fn) => g.combat.later(s, fn),
      boomerang: (from, toPos, c, onOut, onBack, back) => g.combat.boomerang(from, toPos, c, onOut, onBack, back),
      adapt: foeAdapter,
      haste: (mul, s) => {
        if (isPlayer) { p.hasteMul = mul; p.hasteT = s; } else { u.hasteMul = mul; u.hasteT = s; }
      },
      face: a => { u.facing = a; if (isPlayer) p.facing = a; },
      ring: (pos, c, size, dur) => g.combat.ring(pos, c, size, dur),
      shot: (from, toPos, c, onHit, dur = 0.25) => g.combat.projectile(from, { pos: toPos }, c, onHit, dur),
    };
  }

  // Сдвиг юнита-бота (рывок, телепорт) с проверкой стен и края острова
  slideUnit(u, dx, dz, dist) {
    const n = Math.hypot(dx, dz) || 1;
    const ux = dx / n, uz = dz / n;
    let moved = 0;
    while (moved < dist - 0.001) {
      const st = Math.min(0.4, dist - moved);
      const ox = u.pos.x, oz = u.pos.z;
      u.pos.x += ux * st;
      u.pos.z += uz * st;
      this.world.resolveCollisions(u.pos, u.radius, u.team);
      if (this.world.groundAt(u.pos.x, u.pos.z) === null) { u.pos.x = ox; u.pos.z = oz; break; }
      if (Math.hypot(u.pos.x - ox, u.pos.z - oz) < st * 0.5) break;
      moved += st;
    }
    return moved;
  }

  // Умения героя-бота: простые правила «когда применить»
  botSkills(u, dt) {
    for (let i = 0; i < 3; i++) u.skillCd[i] = Math.max(0, u.skillCd[i] - dt);
    if (u.skillCd.every(c => c > 0)) return;
    const hr = u.hp / u.maxHp;
    const near = r => this.units.filter(b => this.targetable(b) && this.isEnemy(u, b) && b.kind !== 'tower' && b.kind !== 'crystal' && edge(u, b) <= r);
    for (let i = 0; i < 3; i++) {
      if (u.skillCd[i] > 0) continue;
      const def = SKILLS[u.skillIds[i]];
      let aim = null, use = false;
      switch (def.type) {
        case 'dash': {
          const f = near(def.dist).filter(b => dist(u, b) > 3.5);
          use = f.length > 0 && hr > 0.4 && f.some(b => b.kind === 'hero' || b.kind === 'minion');
          break;
        }
        case 'nova': {
          const f = near(def.radius);
          use = f.length >= 2 || f.some(b => b.kind === 'hero');
          break;
        }
        case 'shot': case 'volley': {
          const f = near(def.range * 0.9);
          use = f.some(b => b.kind === 'hero') || f.length >= 2;
          break;
        }
        case 'blink': {
          const f = near(5);
          if (f.length && (hr < 0.45 || u.range > 5 && f.some(b => dist(u, b) < 3))) {
            const e = f[0];
            const dx = u.pos.x - e.pos.x, dz = u.pos.z - e.pos.z, n = Math.hypot(dx, dz) || 1;
            aim = { x: dx / n, z: dz / n };
            use = true;
          }
          break;
        }
        case 'buff':
          use = near(7).some(b => b.kind === 'hero') || (hr < 0.6 && near(7).length > 0);
          break;
        case 'heal': {
          const hurt = this.units.filter(b => !b.dead && b.team === u.team && (b.kind === 'hero') && b.hp / b.maxHp < 0.65 && dist(u, b) <= def.radius);
          use = hurt.length > 0 || hr < 0.55;
          break;
        }
        default: break;
      }
      if (!use) continue;
      if (castSkill(this.skillCtx(u, aim), u.skillIds[i])) {
        u.skillCd[i] = def.cooldown + 1 + Math.random() * 2;
        break;
      }
    }
  }

  // ---------- интерфейс ----------

  drawHud(dt) {
    this.hudTimer = (this.hudTimer ?? 0) - dt;
    if (this.hudTimer > 0) return;
    this.hudTimer = 0.15;
    const towers = team => this.units.filter(u => u.kind === 'tower' && u.team === team && !u.dead).length;
    this.ui.updateArena({
      kills: this.kills, time: this.time, towers: { blue: towers('blue'), red: towers('red') },
      spellCd: this.spellCd, skillIds: this.playerUnit.skillIds, respawn: this.respawnLeft, phase: this.phase,
      units: this.units.filter(u => !u.dead || u.kind === 'hero').map(u => ({ x: u.pos.x - C.x, z: u.pos.z - C.z, team: u.team, kind: u.kind, dead: u.dead, me: u.isPlayer })),
    });
  }
}

const TEAM_RING = { blue: 0x4a8dff, red: 0xff5a5a, neutral: 0xffd27a };
