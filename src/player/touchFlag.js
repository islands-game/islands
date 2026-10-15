// Определяем, сенсорное ли устройство (телефон/планшет)
export const ISTouch =
  typeof window !== 'undefined' &&
  ('ontouchstart' in window || navigator.maxTouchPoints > 0) &&
  matchMedia('(pointer: coarse)').matches;
