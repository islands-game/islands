import { Game } from './core/Game.js';
import { preventPageZoom } from './ui/NoZoom.js';
import { Cloud } from './net/Cloud.js';

preventPageZoom();

window.islands = new Game(document.getElementById('game'));
Cloud.init();                       // вход через Google и облачное сохранение (игра работает и без них)
