import type { Application, Container } from 'pixi.js';
import { TILE, MAP_W, MAP_H } from './constants';

export class Camera {
  zoom = 1;
  constructor(private app: Application, private world: Container) {
    // 맵 중앙이 화면 중앙에 오도록 초기화
    this.zoom = Math.min(
      app.screen.width / (MAP_W * TILE),
      app.screen.height / (MAP_H * TILE),
    ) * 1.6;
    this.zoom = Math.max(0.5, Math.min(3, this.zoom));
    this.world.scale.set(this.zoom);
    this.world.position.set(
      app.screen.width / 2 - (MAP_W * TILE * this.zoom) / 2,
      app.screen.height / 2 - (MAP_H * TILE * this.zoom) / 2,
    );
  }

  pan(dx: number, dy: number) {
    this.world.x += dx;
    this.world.y += dy;
    this.clamp();
  }

  /** 화면 좌표 (sx, sy)를 중심으로 줌 */
  zoomAt(sx: number, sy: number, factor: number) {
    const newZoom = Math.max(0.4, Math.min(4, this.zoom * factor));
    const wx = (sx - this.world.x) / this.zoom;
    const wy = (sy - this.world.y) / this.zoom;
    this.zoom = newZoom;
    this.world.scale.set(newZoom);
    this.world.x = sx - wx * newZoom;
    this.world.y = sy - wy * newZoom;
    this.clamp();
  }

  /** 화면 좌표 → 타일 좌표 */
  screenToTile(sx: number, sy: number): { x: number; y: number } {
    return {
      x: Math.floor((sx - this.world.x) / this.zoom / TILE),
      y: Math.floor((sy - this.world.y) / this.zoom / TILE),
    };
  }

  private clamp() {
    const mw = MAP_W * TILE * this.zoom;
    const mh = MAP_H * TILE * this.zoom;
    const margin = 120;
    this.world.x = Math.max(this.app.screen.width - mw - margin, Math.min(margin, this.world.x));
    this.world.y = Math.max(this.app.screen.height - mh - margin, Math.min(margin, this.world.y));
  }
}
