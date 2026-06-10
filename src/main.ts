import { Application } from 'pixi.js';
import { Game } from './game';
import { Renderer } from './renderer';
import { Camera } from './camera';
import { setupInput } from './input';
import { UI } from './ui';

async function boot() {
  const app = new Application();
  await app.init({ background: 0x14181c, resizeTo: window, antialias: false });
  document.getElementById('app')!.appendChild(app.canvas);

  const game = new Game();
  (window as unknown as { game: Game }).game = game; // 콘솔 디버깅용
  const renderer = new Renderer(app, game);
  const camera = new Camera(app, renderer.world);
  const ui = new UI(game);
  setupInput(app, game, camera, renderer);

  app.ticker.add((ticker) => {
    const dt = Math.min(ticker.deltaMS / 1000, 0.1); // 탭 전환 등으로 인한 점프 방지
    game.update(dt);
    renderer.update();
    ui.update();
  });
}

boot();
