import { Application } from 'pixi.js';
import { Game } from './game';
import { Renderer } from './renderer';
import { Camera } from './camera';
import { setupInput } from './input';
import { UI } from './ui';
import { uiState } from './state';
import { makeForcedJob } from './jobs';

async function boot() {
  const app = new Application();
  await app.init({ background: 0x14181c, resizeTo: window, antialias: false });
  document.getElementById('app')!.appendChild(app.canvas);

  const game = new Game();
  // 콘솔 디버깅용
  Object.assign(window as object, { app, game, uiState, makeForcedJob });
  const renderer = new Renderer(app, game);
  const camera = new Camera(app, renderer.world);
  const ui = new UI(game);
  setupInput(app, game, camera, renderer);

  // 시뮬레이션은 setInterval로 구동: rAF 기반 티커와 달리
  // 탭이 백그라운드로 가도 게임이 멈추지 않는다.
  let last = performance.now();
  setInterval(() => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.25); // 절전 등으로 인한 점프 방지
    last = now;
    game.update(dt);
  }, 50);

  // 렌더링/HUD는 화면이 보일 때만 갱신되면 충분
  app.ticker.add(() => {
    renderer.update();
    ui.update();
  });
}

boot();
