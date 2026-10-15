// На iPhone и iPad страница может увеличиться (щипок двумя пальцами или двойное касание, например при быстрых
// нажатиях "Атака"): тогда интерфейс становится огромным, а поле — маленьким. Здесь мы это запрещаем
// и, если увеличение всё же случилось, возвращаем масштаб обратно.
const VIEWPORT = 'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover';

export function preventPageZoom() {
  const stop = e => e.preventDefault();
  // Щипок (события жестов в Safari)
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, stop, { passive: false });
  document.addEventListener('touchstart', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  document.addEventListener('touchmove', e => { if (e.scale && e.scale !== 1) e.preventDefault(); }, { passive: false });
  // Двойное касание вне кнопок (для кнопок это делает touch-action: manipulation в CSS)
  let last = 0;
  document.addEventListener('touchend', e => {
    const now = Date.now();
    if (now - last < 350 && !e.target.closest?.('button, input, #stick')) e.preventDefault();
    last = now;
  }, { passive: false });
  document.addEventListener('dblclick', stop);

  // Если масштаб всё же изменился — сбрасываем
  const meta = document.querySelector('meta[name=viewport]');
  const reset = () => {
    const vv = window.visualViewport;
    if (!vv || vv.scale <= 1.02 || !meta) return;
    meta.setAttribute('content', VIEWPORT.replace('maximum-scale=1,', 'maximum-scale=1.01,'));
    requestAnimationFrame(() => { meta.setAttribute('content', VIEWPORT); window.scrollTo(0, 0); });
  };
  window.visualViewport?.addEventListener('resize', reset);
}
