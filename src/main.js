import { Game } from './core/Game.js';
import { preventPageZoom } from './ui/NoZoom.js';

preventPageZoom();

window.islands = new Game(document.getElementById('game'));
