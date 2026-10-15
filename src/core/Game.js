import * as THREE from 'three';
import { World } from '../world/World.js';
import { ResourceSystem } from '../world/ResourceSystem.js';
import { Player } from '../player/Player.js';
import { CameraController } from '../player/CameraController.js';
import { InputManager } from '../player/InputManager.js';
import { CombatSystem } from '../combat/CombatSystem.js';
import { CreatureManager } from '../creatures/CreatureManager.js';
import { Inventory } from '../inventory/Inventory.js';
import { addXp, xpNeeded } from '../progression/Progression.js';
import { UIManager } from '../ui/UIManager.js';
import { BuildSystem, DEMOLISH } from '../building/BuildSystem.js';
import { BUILDINGS } from '../config/buildings.js';
import { TUTORIAL_STEPS, TUTORIAL_DONE } from '../ui/Tutorial.js';
import { Settings } from '../save/Settings.js';
import { QuestManager } from '../quests/QuestManager.js';
import { RaidSystem } from '../combat/RaidSystem.js';
import { ArenaSystem } from '../arena/ArenaSystem.js';
import { QUESTS } from '../config/quests.js';
import { events } from './Events.js';
import { initSound } from './Sound.js';

const QUALITY_SCALE = { low: 0.6, medium: 0.85, high: 1 };
import { SaveManager } from '../save/SaveManager.js';
import { RESOURCES } from '../config/resources.js';
import { ARENA } from '../config/arena.js';
import { t } from '../config/i18n.js';

const COMMANDS = ['follow', 'stay', 'defend', 'attack', 'ability', 'return'];
const _label = new THREE.Vector3();

// Запуск игры и главный цикл: связывает все системы между собой.
export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 300);
    this.clock = new THREE.Clock();
    this.playing = false;
    this.started = false;
    this.saveTimer = 0;
    this.stats = { kills: 0, collected: 0, built: 0 }; // счётчики для обучения
    this.tutorialStep = TUTORIAL_DONE;

    this.world = new World(this.scene);
    this.player = new Player(this.scene, this.world);
    this.inventory = new Inventory();
    this.cameraCtl = new CameraController(this.camera);
    this.input = new InputManager(canvas);
    this.ui = new UIManager({
      isTouch: this.input.isTouch,
      press: name => this.input.press(name),
      onStart: () => this.start(false),
      onContinue: () => this.start(true),
      onMenu: () => this.pause(),
      onSummon: id => { this.creatures.summon(id); this.refreshPanel(); },
      onSelectBuilding: id => { this.ui.showBuildPanel(false); this.build.select(id); },
      onSkipTutorial: () => this.setTutorialStep(TUTORIAL_DONE),
    });
    this.ui.setCamera(this.camera);

    this.resources = new ResourceSystem(this.world, this.inventory);
    this.combat = new CombatSystem({
      scene: this.scene, world: this.world, player: this.player, ui: this.ui,
      onKill: enemy => this.onEnemyKilled(enemy),
    });
    this.creatures = new CreatureManager({
      scene: this.scene, world: this.world, player: this.player,
      inventory: this.inventory, combat: this.combat, ui: this.ui,
    });
    this.build = new BuildSystem({
      scene: this.scene, world: this.world, player: this.player, inventory: this.inventory,
      creatures: this.creatures, combat: this.combat, ui: this.ui,
      onPlaced: () => { this.stats.built++; },
    });
    this.quests = new QuestManager(this);
    this.raids = new RaidSystem(this);
    this.arena = new ArenaSystem(this);

    // Качество графики: меньше пикселей на слабых устройствах. В режиме "Авто" подстраивается по FPS.
    this.autoScale = this.input.isTouch ? 0.8 : 1;
    this.ratio = 0;
    this.fpsFrames = 0;
    this.fpsStart = performance.now();
    this.goodSeconds = 0;
    events.on('settings', () => this.applyQuality());
    events.on('nightfall', () => { if (this.playing) this.ui.toast(t('nightfall')); });
    events.on('daybreak', () => { if (this.playing) this.ui.toast(t('daybreak')); });
    initSound();
    this.applyQuality();
    addEventListener('resize', () => this.resize());
    addEventListener('keydown', e => {
      if (e.code !== 'Escape' || !this.playing) return;
      if (this.ui.panelOpen) this.ui.showPanel(false);
      else if (this.ui.buildPanelOpen) this.ui.showBuildPanel(false);
      else if (this.build.active) this.build.cancel();
      else this.pause();
    });
    addEventListener('beforeunload', () => this.save());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.save(); });
    this.resize();

    this.ui.showMenu(true);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  start(loadSave) {
    this.arena.exit();
    this.resources.reset();
    this.combat.reset();
    this.inventory.reset();
    this.creatures.reset();
    this.build.reset();
    this.stats = { kills: 0, collected: 0, built: 0 };
    const data = loadSave ? SaveManager.load() : null;
    if (data) {
      this.player.fromSave(data.player);
      // Если сохранились на арене (старая версия) — возвращаем домой
      if (this.world.islandIdAt(this.player.pos.x, this.player.pos.z) === 'arena') this.player.respawn();
      this.inventory.fromSave(data.inventory);
      this.creatures.fromSave(data.creatures);
      this.build.fromSave(data.buildings);
      this.quests.fromSave(data.quests);
      this.world.day = data.time.day;
      this.world.dayCount = data.time.count;
      this.world.applyLighting();
      this.raids.fromSave(data.time);
      this.setTutorialStep(data.tutorial, false);
    } else {
      SaveManager.clear();
      this.player.resetStats();
      this.quests.reset();
      this.world.day = 0.12;
      this.world.dayCount = 0;
      this.world.applyLighting();
      this.raids.reset();
      this.setTutorialStep(0, false);
    }
    this.input.clearActions();
    this.started = true;
    this.playing = true;
    this.input.enabled = true;
    this.ui.showMenu(false);
    this.ui.showHint();
  }

  pause() {
    this.playing = false;
    this.input.enabled = false;
    this.input.move.x = this.input.move.y = 0;
    this.build.cancel();
    this.save();
    this.ui.showMenu(true);
  }

  save() {
    // Сохраняем только после начала игры, чтобы меню не затирало старое сохранение
    if (!this.started) return;
    // На арене сохраняем состояние основной игры, а не матча
    const inArena = this.arena.active;
    const playerData = this.player.toSave();
    if (inArena) Object.assign(playerData, { x: -8.5, y: 0, z: 5, hp: this.arena.returnSave().hp });
    SaveManager.save({
      player: playerData,
      inventory: this.inventory.toSave(),
      creatures: this.creatures.toSave(),
      buildings: this.build.toSave(),
      tutorial: this.tutorialStep,
      quests: this.quests.toSave(),
      time: { day: inArena ? this.arena.saved.day : this.world.day, count: this.world.dayCount, ...this.raids.toSave() },
    });
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // --- Качество графики и FPS ---

  applyQuality() {
    const s = Settings.get();
    const cap = Math.min(devicePixelRatio, this.input.isTouch ? 1.5 : 2);
    const scale = s.quality === 'auto' ? this.autoScale : QUALITY_SCALE[s.quality];
    const ratio = Math.max(0.5, cap * scale);
    if (Math.abs(ratio - this.ratio) > 0.01) {
      this.ratio = ratio;
      this.renderer.setPixelRatio(ratio);
      this.renderer.setSize(innerWidth, innerHeight, false);
    }
    this.ui.showFps(s.showFps);
  }

  // Считаем FPS раз в секунду; в режиме "Авто" снижаем или повышаем разрешение
  sampleFps() {
    this.fpsFrames++;
    const now = performance.now();
    if (now - this.fpsStart < 1000) return;
    const fps = (this.fpsFrames * 1000) / (now - this.fpsStart);
    this.fpsFrames = 0;
    this.fpsStart = now;
    this.ui.setFps(fps, this.ratio);
    if (Settings.get().quality !== 'auto' || document.hidden || fps < 5 || !this.playing) return;
    if (fps < 24 && this.autoScale > 0.5) {
      this.autoScale = Math.max(0.5, this.autoScale - 0.15);
      this.goodSeconds = 0;
      this.applyQuality();
    } else if (fps > 55) {
      this.goodSeconds++;
      if (this.goodSeconds >= 4 && this.autoScale < 1) {
        this.autoScale = Math.min(1, this.autoScale + 0.1);
        this.goodSeconds = 0;
        this.applyQuality();
      }
    } else {
      this.goodSeconds = 0;
    }
  }

  // --- Награды ---

  gainXp(n) {
    if (addXp(this.player, n)) {
      this.ui.toast(`${t('levelUp')} ${this.player.level}`);
      this.combat.ring(this.player.pos, 0xffe066, 4, 0.8);
      events.emit('levelUp');
    }
  }

  // --- Обучение ---

  setTutorialStep(step, announce = true) {
    this.tutorialStep = step;
    if (step >= TUTORIAL_DONE) {
      this.ui.setTutorial(null);
      if (announce) this.ui.toast(t('tut.done'));
    } else {
      this.ui.setTutorial(step, TUTORIAL_DONE, TUTORIAL_STEPS[step].key);
    }
  }

  // Полоска сверху: здоровье босса рядом или оставшиеся слизни рейда
  updateTopBar() {
    const boss = this.combat.nearestBoss(this.player.pos, 30);
    if (boss) this.ui.setBar(t('enemy.' + boss.def.id), boss.hp / boss.maxHp);
    else if (this.raids.active) this.ui.setBar(t('raid.title'), this.raids.remaining / Math.max(1, this.raids.total));
    else this.ui.setBar(null, 0);
  }

  // Текущее задание в углу экрана (показываем, когда обучение закончено)
  updateQuestUi() {
    const q = this.quests.current;
    const show = this.tutorialStep >= TUTORIAL_DONE;
    this.ui.setQuest(show ? (q ?? 'done') : null, q ? Math.min(this.quests.value(q), q.amount) : 0, QUESTS.length);
  }

  updateTutorial() {
    if (this.tutorialStep < TUTORIAL_DONE && TUTORIAL_STEPS[this.tutorialStep].done(this)) {
      this.setTutorialStep(this.tutorialStep + 1);
      if (this.tutorialStep < TUTORIAL_DONE) this.ui.toast('✔');
    }
  }

  onEnemyKilled(enemy) {
    this.stats.kills++;
    if (enemy.def.boss) {
      this.ui.toast(`${t('bossDefeated')} ${t('enemy.' + enemy.def.id)}`);
      this.combat.ring(enemy.pos, 0xffd23f, 8, 1);
      events.emit('levelUp');
    }
    const xp = enemy.def.xp;
    this.gainXp(xp);
    this.creatures.gainXp(Math.ceil(xp * 0.6));
    const p = enemy.pos.clone();
    p.y += 1.2;
    this.ui.floatText(p, `+${xp} XP`, '#7df9ff');
  }

  // --- Взаимодействие (E / кнопка) ---

  // Что находится рядом: дикое существо (важнее) или ресурс
  interactTarget() {
    const wild = this.creatures.nearestWild(this.player.pos);
    if (wild) return { kind: 'wild', ...wild };
    const portal = this.world.nearestPortal(this.player.pos);
    if (portal) return { kind: 'portal', ...portal };
    const room = this.player.inside;
    if (room && Math.hypot(this.player.pos.x - room.bed.x, this.player.pos.z - room.bed.z) < 1.7) return { kind: 'bed', room };
    const node = this.resources.nearest(this.player.pos);
    return node ? { kind: 'node', ...node } : null;
  }

  costText(cost) {
    return Object.entries(cost).map(([k, v]) => `${RESOURCES[k].icon}${v}`).join(' ');
  }

  updateBuildBar() {
    const b = this.build;
    if (!b.active) return this.ui.setBuildBar(false);
    const def = BUILDINGS[b.mode];
    let text = b.infoText();
    if (def) text += ` ${this.ui.costText(def.cost)}`;
    if (!this.input.isTouch) text += ` — ${t('buildHelp')}`; // на телефоне подсказка не нужна: кнопки подписаны значками
    this.ui.setBuildBar(true, text, b.valid || b.mode === DEMOLISH && !!b.demolishTarget);
  }

  updatePrompt() {
    if (this.build.active) return this.ui.setPrompt(null);
    const target = this.player.dead ? null : this.interactTarget();
    const key = this.input.isTouch ? '' : 'E — ';
    if (!target) return this.ui.setPrompt(null);
    if (target.kind === 'node') {
      return this.ui.setPrompt(`${key}${t('collect')}: ${t('res.' + target.node.type)}`);
    }
    if (target.kind === 'bed') {
      return this.ui.setPrompt(`${key}${t('sleep')}`, !this.canSleep());
    }
    if (target.kind === 'portal') {
      // Если уровень героя ниже рекомендуемого, подсказка предупреждает (но пройти всё равно можно)
      const p = target.portal;
      const rec = p.recLevel > 1 ? ` (${t('recLevel')} ${p.recLevel})` : '';
      return this.ui.setPrompt(`${key}${t('portal')}: ${t(p.nameKey)}${rec}`, this.player.level < p.recLevel);
    }
    const def = target.creature.def;
    const name = t('creature.' + def.id);
    if (this.inventory.has(def.tame.cost)) {
      return this.ui.setPrompt(`${key}${t('tame')}: ${name} (${this.costText(def.tame.cost)})`);
    }
    return this.ui.setPrompt(`${name} — ${t('need')}: ${this.costText(def.tame.cost)}`, true);
  }

  interact() {
    const target = this.player.dead ? null : this.interactTarget();
    if (!target) return;
    if (target.kind === 'node') {
      const node = target.node;
      const got = this.resources.collect(node);
      this.stats.collected++;
      events.emit('collect', got.type, got.amount);
      _label.set(node.x, 1.8, node.z);
      this.ui.floatText(_label, `+${got.amount} ${RESOURCES[got.type].icon}`, '#ffffff');
      this.gainXp(got.xp);
    } else if (target.kind === 'bed') {
      this.sleep();
    } else if (target.kind === 'portal') {
      this.teleport(target.portal);
    } else {
      const wild = target.creature;
      if (this.creatures.tame(wild)) {
        this.ui.toast(`${t('tamed')} ${t('creature.' + wild.id)}`);
        events.emit('tame', wild.id);
        this.combat.ring(wild.pos, 0xffe066, 4, 0.8);
      } else {
        this.ui.toast(`${t('need')}: ${this.costText(wild.def.tame.cost)}`);
      }
    }
  }

  // Выйти с арены обратно на домашний остров (через её портал)
  leaveArena() {
    const portal = this.world.portals.find(p => this.world.islandIdAt(p.x, p.z) === 'arena');
    if (portal) this.teleport(portal);
  }

  // Матч закончился: награда в основной игре
  onArenaEnd(win) {
    this.gainXp(win ? ARENA.winXp : ARENA.loseXp);
    if (win) {
      for (const [k, v] of Object.entries(ARENA.winItems)) this.inventory.add(k, v);
      events.emit('arenaWin');
    }
  }

  // Спать можно ночью или когда ранен
  canSleep() {
    return this.world.isNight || this.player.hp < this.player.maxHp;
  }

  // Сон в доме: экран темнеет, наступает утро, здоровье восстанавливается
  sleep() {
    if (this.sleeping) return;
    if (!this.canSleep()) return this.ui.toast(t('notTired'));
    this.sleeping = true;
    this.ui.fade(true);
    setTimeout(() => {
      const wasNight = this.world.isNight;
      if (wasNight) this.world.skipToMorning();
      this.player.hp = this.player.maxHp;
      this.raids?.endRaid('sleep');
      this.ui.toast(t(wasNight ? 'slept' : 'rested'));
      this.save();
    }, 700);
    setTimeout(() => { this.ui.fade(false); this.sleeping = false; }, 1500);
  }

  // Перенос героя через портал. Спутник догонит сам (если он далеко, существо переносится к герою).
  teleport(portal) {
    const p = this.player;
    this.combat.ring(p.pos, 0xb388ff, 4, 0.6);
    p.pos.set(portal.dest.x, 0, portal.dest.z);
    p.vy = 0;
    p.mesh.position.copy(p.pos);
    this.cameraCtl.target.copy(p.pos);
    this.combat.ring(p.pos, 0xb388ff, 4, 0.6);
    this.ui.toast(t(portal.nameKey));
    events.emit('portal', portal.nameKey.replace('island.', ''));
    // Арена: при входе начинается матч, при выходе он заканчивается
    const to = this.world.islandIdAt(portal.dest.x, portal.dest.z);
    if (this.arena.active && to !== 'arena') this.arena.exit();
    else if (!this.arena.active && to === 'arena') this.arena.enter();
  }

  // Ночью деревья оживают, утром всё возвращается как было
  updateNightMonsters() {
    if (this.world.isNight && !this.combat.nightActive) {
      if (this.combat.awakenTrees() > 0) this.ui.toast(t('treesAwake'));
    } else if (!this.world.isNight && this.combat.nightActive) {
      this.combat.calmTrees();
    }
  }

  // --- Панель существ ---

  togglePanel() {
    if (this.ui.panelOpen) this.ui.showPanel(false);
    else this.ui.showPanel(true, this.creatures.list(), this.creatures.activeId);
  }

  refreshPanel() {
    if (this.ui.panelOpen) this.ui.renderPanel(this.creatures.list(), this.creatures.activeId);
  }

  // --- Главный цикл ---

  toggleBuild() {
    if (this.build.active) return this.build.cancel();
    if (this.ui.buildPanelOpen) return this.ui.showBuildPanel(false);
    this.ui.showPanel(false);
    const items = Object.values(BUILDINGS).map(b => ({ id: b.id, cost: b.cost, canAfford: this.inventory.has(b.cost) }));
    this.ui.showBuildPanel(true, items);
  }

  handleActions() {
    const input = this.input;
    if (this.arena.active) {
      // Арена: атака, две способности героя и кнопки итога матча
      if (input.consume('attack')) this.arena.playerAttack();
      if (input.consume('spell1')) this.arena.castSpell(1);
      if (input.consume('spell2')) this.arena.castSpell(2);
      if (input.consume('arenaAgain')) { this.ui.hideArenaResult(); this.arena.restart(); }
      if (input.consume('arenaExit')) this.leaveArena();
      input.consume('build'); input.consume('confirm'); input.consume('rotate'); input.consume('cancel');
      if (input.consume('interact')) this.interact();
      if (input.consume('panel')) this.togglePanel();
      if (input.consume('ability')) this.creatures.command('ability');
      for (const c of COMMANDS) if (input.consume('cmd-' + c)) this.creatures.command(c);
      return;
    }
    if (input.consume('build')) this.toggleBuild();
    if (this.build.active) {
      // В режиме строительства "Действие" ставит постройку, "Атака" не работает
      input.consume('attack');
      if (input.consume('interact') | input.consume('confirm')) this.build.confirm();
      if (input.consume('rotate')) this.build.rotate();
      if (input.consume('cancel')) this.build.cancel();
    } else {
      input.consume('confirm'); input.consume('rotate'); input.consume('cancel');
      if (input.consume('attack')) this.combat.heroAttack();
      if (input.consume('interact')) this.interact();
    }
    if (input.consume('panel')) { this.ui.showBuildPanel(false); this.togglePanel(); }
    if (input.consume('ability')) this.creatures.command('ability');
    for (const c of COMMANDS) {
      if (input.consume('cmd-' + c)) this.creatures.command(c);
    }
  }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.sampleFps();
    this.world.update(dt);

    if (this.playing) {
      this.input.poll();
      const look = this.input.consumeLook();
      this.cameraCtl.update(dt, this.player.pos, look);
      this.player.update(dt, this.input, this.cameraCtl.yaw);
      // Внутри дома безопасно: враги не видят героя, здоровье восстанавливается
      this.player.inside = this.player.dead ? null : this.world.interiorAt(this.player.pos.x, this.player.pos.z);
      this.world.updateRoofs(this.player.inside);
      if (this.player.inside && !this.player.dead) this.player.heal(6 * dt);
      this.handleActions();
      this.resources.update(dt);
      this.updateNightMonsters();
      this.combat.update(dt, this.camera);
      this.creatures.update(dt);
      this.build.update();
      this.updateBuildBar();
      this.updatePrompt();
      this.updateTutorial();
      this.quests.update();
      this.raids.update(dt);
      this.arena.update(dt);
      this.updateQuestUi();
      this.updateTopBar();
      this.ui.setClock(this.world.night);
      this.ui.updateHud(this.player, this.inventory, this.creatures.active, xpNeeded(this.player.level));

      this.saveTimer += dt;
      if (this.saveTimer > 5) { this.saveTimer = 0; this.save(); }
    } else {
      // В меню камера медленно облетает остров
      this.cameraCtl.update(dt, this.player.pos, { x: 0.15, y: 0 });
    }
    this.renderer.render(this.scene, this.camera);
  }
}
