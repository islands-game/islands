import * as THREE from 'three';
import { World } from '../world/World.js';
import { Player } from '../player/Player.js';
import { CameraController } from '../player/CameraController.js';
import { InputManager } from '../player/InputManager.js';
import { UIManager } from '../ui/UIManager.js';
import { SaveManager } from '../save/SaveManager.js';

const xpForLevel = level => 50 + level * 25;

// Запуск игры и главный цикл.
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

    this.world = new World(this.scene);
    this.player = new Player(this.scene, this.world);
    this.cameraCtl = new CameraController(this.camera);
    this.input = new InputManager(canvas);
    this.ui = new UIManager({
      isTouch: this.input.isTouch,
      onStart: () => this.start(false),
      onContinue: () => this.start(true),
      onMenu: () => this.pause(),
    });

    // Меньше пикселей на слабых устройствах
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.input.isTouch ? 1.5 : 2));
    addEventListener('resize', () => this.resize());
    addEventListener('keydown', e => { if (e.code === 'Escape' && this.playing) this.pause(); });
    addEventListener('beforeunload', () => this.save());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.save(); });
    this.resize();

    this.ui.showMenu(true);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  start(loadSave) {
    if (loadSave) {
      const data = SaveManager.load();
      if (data) this.player.fromSave(data.player);
    } else {
      SaveManager.clear();
      this.player.respawn();
      Object.assign(this.player, { hp: 100, level: 1, xp: 0 });
    }
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
    this.save();
    this.ui.showMenu(true);
  }

  save() {
    // Сохраняем только после начала игры, чтобы меню не затирало старое сохранение
    if (this.started) SaveManager.save({ player: this.player.toSave() });
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.world.update(dt);

    if (this.playing) {
      this.input.poll();
      const look = this.input.consumeLook();
      this.cameraCtl.update(dt, this.player.pos, look);
      this.player.update(dt, this.input, this.cameraCtl.yaw);
      this.ui.updateHud(this.player, xpForLevel(this.player.level));

      this.saveTimer += dt;
      if (this.saveTimer > 5) { this.saveTimer = 0; this.save(); }
    } else {
      // В меню камера медленно облетает остров
      this.cameraCtl.update(dt, this.player.pos, { x: 0.15, y: 0 });
    }
    this.renderer.render(this.scene, this.camera);
  }
}
