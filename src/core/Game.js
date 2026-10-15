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
import { events } from './Events.js';
import { initSound } from './Sound.js';

const QUALITY_SCALE = { low: 0.6, medium: 0.85, high: 1 };
import { SaveManager } from '../save/SaveManager.js';
import { RESOURCES } from '../config/resources.js';
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
    this.resources.reset();
    this.combat.reset();
    this.inventory.reset();
    this.creatures.reset();
    this.build.reset();
    this.stats = { kills: 0, collected: 0, built: 0 };
    const data = loadSave ? SaveManager.load() : null;
    if (data) {
      this.player.fromSave(data.player);
      this.inventory.fromSave(data.inventory);
      this.creatures.fromSave(data.creatures);
      this.build.fromSave(data.buildings);
      this.setTutorialStep(data.tutorial, false);
    } else {
      SaveManager.clear();
      this.player.resetStats();
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
    SaveManager.save({
      player: this.player.toSave(),
      inventory: this.inventory.toSave(),
      creatures: this.creatures.toSave(),
      buildings: this.build.toSave(),
      tutorial: this.tutorialStep,
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

  updateTutorial() {
    if (this.tutorialStep < TUTORIAL_DONE && TUTORIAL_STEPS[this.tutorialStep].done(this)) {
      this.setTutorialStep(this.tutorialStep + 1);
      if (this.tutorialStep < TUTORIAL_DONE) this.ui.toast('✔');
    }
  }

  onEnemyKilled(enemy) {
    this.stats.kills++;
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
    if (target.kind === 'portal') {
      return this.ui.setPrompt(`${key}${t('portal')}: ${t(target.portal.nameKey)}`);
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
      events.emit('collect');
      _label.set(node.x, 1.8, node.z);
      this.ui.floatText(_label, `+${got.amount} ${RESOURCES[got.type].icon}`, '#ffffff');
      this.gainXp(got.xp);
    } else if (target.kind === 'portal') {
      this.teleport(target.portal);
    } else {
      const wild = target.creature;
      if (this.creatures.tame(wild)) {
        this.ui.toast(`${t('tamed')} ${t('creature.' + wild.id)}`);
        events.emit('tame');
        this.combat.ring(wild.pos, 0xffe066, 4, 0.8);
      } else {
        this.ui.toast(`${t('need')}: ${this.costText(wild.def.tame.cost)}`);
      }
    }
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
    events.emit('portal');
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
      this.handleActions();
      this.resources.update(dt);
      this.combat.update(dt, this.camera);
      this.creatures.update(dt);
      this.build.update();
      this.updateBuildBar();
      this.updatePrompt();
      this.updateTutorial();
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
