import { ISTouch } from './touchFlag.js';

// Клавиши -> действия. Кнопки на экране вызывают те же действия через press().
const KEY_ACTIONS = {
  KeyE: 'interact',
  KeyF: 'attack',
  Digit1: 'ability',
  KeyX: 'cmd-follow',
  KeyG: 'cmd-stay',
  KeyV: 'cmd-defend',
  KeyT: 'cmd-attack',
  KeyR: 'cmd-return',
  KeyP: 'panel',
  Digit2: 'spell1',
  Digit3: 'spell2',
  KeyB: 'build',
  KeyZ: 'rotate',
  KeyQ: 'cancel',
};

// Единый ввод: клавиатура, мышь и сенсорный экран дают одни и те же значения.
// move.x / move.y — направление ходьбы (-1..1), look — накопленный поворот камеры,
// press(name) / consume(name) — одноразовые действия (атака, взаимодействие, команды).
export class InputManager {
  constructor(canvas) {
    this.move = { x: 0, y: 0 };
    this.look = { x: 0, y: 0 };
    this.jumpPressed = false;
    this.pressed = new Set();
    this.keys = new Set();
    this.isTouch = ISTouch;
    this.enabled = false;

    this.initKeyboard();
    this.initMouse(canvas);
    if (this.isTouch) this.initTouch();
  }

  press(name) {
    this.pressed.add(name);
  }

  consume(name) {
    return this.pressed.delete(name);
  }

  clearActions() {
    this.pressed.clear();
    this.jumpPressed = false;
  }

  initKeyboard() {
    addEventListener('keydown', e => {
      if (!this.enabled) return;
      this.keys.add(e.code);
      if (e.code === 'Space') { this.jumpPressed = true; e.preventDefault(); }
      const action = KEY_ACTIONS[e.code];
      if (action && !e.repeat) this.press(action);
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  initMouse(canvas) {
    let dragging = false, sx = 0, sy = 0, st = 0;
    canvas.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse') return;
      dragging = true; sx = e.clientX; sy = e.clientY; st = performance.now();
      try { canvas.setPointerCapture(e.pointerId); } catch { /* касание уже закончилось */ }
    });
    canvas.addEventListener('pointerup', e => {
      if (e.pointerType !== 'mouse') return;
      dragging = false;
      // Короткий клик без перетаскивания — атака
      if (this.enabled && Math.hypot(e.clientX - sx, e.clientY - sy) < 6 && performance.now() - st < 350) {
        this.press('attack');
      }
    });
    canvas.addEventListener('pointermove', e => {
      if (dragging && this.enabled) {
        this.look.x += e.movementX;
        this.look.y += e.movementY;
      }
    });
  }

  initTouch() {
    const stick = document.getElementById('stick');
    const knob = document.getElementById('knob');
    const jump = document.getElementById('btn-jump');
    const canvas = document.getElementById('game');
    const R = 55;

    // Джойстик: отдельный палец, не мешает камере и кнопкам
    let stickId = null, cx = 0, cy = 0;
    stick.addEventListener('pointerdown', e => {
      stickId = e.pointerId;
      try { stick.setPointerCapture(e.pointerId); } catch { /* касание уже закончилось */ }
      const r = stick.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      onStick(e);
    });
    const onStick = e => {
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = dx / d * R; dy = dy / d * R; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.move.x = dx / R; this.move.y = dy / R;
    };
    stick.addEventListener('pointermove', e => { if (e.pointerId === stickId) onStick(e); });
    const endStick = e => {
      if (e.pointerId !== stickId) return;
      stickId = null;
      knob.style.transform = '';
      this.move.x = 0; this.move.y = 0;
    };
    stick.addEventListener('pointerup', endStick);
    stick.addEventListener('pointercancel', endStick);

    jump.addEventListener('pointerdown', e => { e.preventDefault(); this.jumpPressed = true; });

    // Камера: свайп по свободной части экрана.
    // Не считаем свайпом касания рядом с кнопками и джойстиком (в бою палец постоянно скользит у кнопок),
    // небольшие движения (мёртвая зона) и делаем поворот мягким — иначе камера "уплывает" и смотрит в пол.
    const noLookZones = () => ['stick', 'actions', 'btn-jump', 'btn-menu', 'btn-creatures', 'btn-build']
      .map(id => document.getElementById(id)?.getBoundingClientRect()).filter(r => r && r.width > 0);
    const inZone = (x, y) => noLookZones().some(r => x > r.left - 24 && x < r.right + 24 && y > r.top - 24 && y < r.bottom + 24);
    let lookId = null, lx = 0, ly = 0, moved = 0;
    canvas.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' || lookId !== null || inZone(e.clientX, e.clientY)) return;
      lookId = e.pointerId; lx = e.clientX; ly = e.clientY; moved = 0;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* касание уже закончилось */ }
    });
    canvas.addEventListener('pointermove', e => {
      if (e.pointerId !== lookId || !this.enabled) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      moved += Math.hypot(dx, dy);
      if (moved < 12) return;                 // мёртвая зона: случайные касания не вращают камеру
      this.look.x += dx * 0.7;
      this.look.y += dy * 0.3;                // наклон вверх-вниз намного мягче поворота
    });
    const endLook = e => { if (e.pointerId === lookId) lookId = null; };
    canvas.addEventListener('pointerup', endLook);
    canvas.addEventListener('pointercancel', endLook);
  }

  // Вызывается каждый кадр: собирает клавиатуру в move
  poll() {
    if (!this.isTouch || this.keys.size) {
      const k = this.keys;
      const x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
      const y = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
      if (x || y || !this.isTouch) { this.move.x = x; this.move.y = y; }
    }
  }

  consumeLook() {
    const l = { x: this.look.x, y: this.look.y };
    this.look.x = 0; this.look.y = 0;
    return l;
  }

  consumeJump() {
    const j = this.jumpPressed;
    this.jumpPressed = false;
    return j;
  }
}
