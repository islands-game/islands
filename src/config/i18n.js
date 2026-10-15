// Тексты игры на трёх языках. Чтобы добавить фразу — допиши её во все три блока.
// Чтобы добавить язык — создай новый блок и кнопку в index.html.
export const LANGS = ['ru', 'en', 'ka'];

const TEXTS = {
  ru: {
    subtitle: 'Мир парящих островов',
    newGame: 'Новая игра',
    continue: 'Продолжить',
    hp: 'Здоровье',
    level: 'Уровень',
    jump: 'Прыжок',
    hintDesktop: 'WASD — идти · Пробел — прыжок · Перетащи мышью — камера',
    hintTouch: 'Джойстик — идти · Свайп справа — камера',
    confirmNew: 'Начать заново? Старое сохранение будет удалено.',
  },
  en: {
    subtitle: 'A world of floating islands',
    newGame: 'New game',
    continue: 'Continue',
    hp: 'Health',
    level: 'Level',
    jump: 'Jump',
    hintDesktop: 'WASD — move · Space — jump · Drag mouse — camera',
    hintTouch: 'Joystick — move · Swipe right side — camera',
    confirmNew: 'Start over? The old save will be deleted.',
  },
  ka: {
    subtitle: 'მფრინავი კუნძულების სამყარო',
    newGame: 'ახალი თამაში',
    continue: 'გაგრძელება',
    hp: 'ჯანმრთელობა',
    level: 'დონე',
    jump: 'ნახტომი',
    hintDesktop: 'WASD — სიარული · Space — ნახტომი · თაგვით გადაათრიე — კამერა',
    hintTouch: 'ჯოისტიკი — სიარული · მარჯვნივ გადაქაჩვა — კამერა',
    confirmNew: 'თავიდან დაწყება? ძველი შენახვა წაიშლება.',
  },
};

let current = 'ru';

export function setLang(lang) {
  if (TEXTS[lang]) current = lang;
}
export function getLang() {
  return current;
}
export function t(key) {
  return TEXTS[current][key] ?? TEXTS.ru[key] ?? key;
}
