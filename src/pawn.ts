import { PAWN_SPEED, HUNGER_SECONDS, REST_SECONDS } from './constants';
import { findPath } from './astar';
import type { ItemStack, WorkType } from './types';
import { defaultPriorities } from './types';
import type { Game } from './game';
import type { Job } from './jobs';
import { findJob } from './jobs';

export type MoveResult = 'arrived' | 'moving' | 'blocked';

export class Pawn {
  x: number; // 타일 단위 좌표 (칸 중심 = x.5)
  y: number;
  name: string;
  color: number;
  hunger = 0.75 + Math.random() * 0.2;
  rest = 0.75 + Math.random() * 0.2;
  carrying: ItemStack | null = null;
  job: Job | null = null;
  sleeping = false;
  /** 작업 종류별 우선순위: 1(높음)~4(낮음), 0 = 안 함 */
  priorities: Record<WorkType, number> = defaultPriorities();

  private path: { x: number; y: number }[] | null = null;
  private pathGoal = '';

  constructor(x: number, y: number, name: string, color: number) {
    this.x = x + 0.5;
    this.y = y + 0.5;
    this.name = name;
    this.color = color;
  }

  get tileX() { return Math.floor(this.x); }
  get tileY() { return Math.floor(this.y); }

  update(g: Game, dt: number) {
    this.hunger = Math.max(0, this.hunger - dt / HUNGER_SECONDS);
    if (!this.sleeping) this.rest = Math.max(0, this.rest - dt / REST_SECONDS);

    if (this.job) {
      this.job.update(this, g, dt);
      if (this.job.done || this.job.failed) {
        this.job.cleanup(g);
        this.job = null;
        this.sleeping = false;
        this.stopMoving();
      }
    } else {
      this.job = findJob(this, g);
    }
  }

  get speed(): number {
    let s = PAWN_SPEED;
    if (this.carrying) s *= 0.85;
    if (this.hunger <= 0) s *= 0.5; // 굶주림 페널티
    return s;
  }

  stopMoving() {
    this.path = null;
    this.pathGoal = '';
  }

  /** 목표 타일로 한 프레임 이동. 매 프레임 호출하면 경로를 따라간다. */
  goTo(g: Game, dt: number, tx: number, ty: number, adjacent = false): MoveResult {
    const key = `${tx},${ty},${adjacent ? 1 : 0}`;
    if (this.pathGoal !== key) {
      const p = findPath(g.map, this.tileX, this.tileY, tx, ty, adjacent);
      if (p === null) {
        this.stopMoving();
        return 'blocked';
      }
      this.path = p;
      this.pathGoal = key;
    }
    if (!this.path || this.path.length === 0) {
      this.stopMoving();
      return 'arrived';
    }

    const node = this.path[0];
    // 길이 막혔으면 재탐색
    if (!g.map.walkable(node.x, node.y)) {
      this.pathGoal = '';
      return 'moving';
    }
    const targetX = node.x + 0.5;
    const targetY = node.y + 0.5;
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const dist = Math.hypot(dx, dy);
    const step = this.speed * dt;
    if (dist <= step) {
      this.x = targetX;
      this.y = targetY;
      this.path.shift();
      if (this.path.length === 0) {
        this.stopMoving();
        return 'arrived';
      }
    } else {
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }
    return 'moving';
  }

  /** 진행 중인 작업을 버리고 새 작업을 강제 할당 (우클릭 명령) */
  assignForcedJob(g: Game, job: Job) {
    if (this.job) this.job.cleanup(g);
    this.sleeping = false;
    this.stopMoving();
    this.job = job;
  }

  /** 현재 위치가 통행 불가가 되었을 때(벽 완공 등) 인접 칸으로 밀어내기 */
  nudgeToWalkable(g: Game) {
    if (g.map.walkable(this.tileX, this.tileY)) return;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      if (g.map.walkable(this.tileX + dx, this.tileY + dy)) {
        this.x = this.tileX + dx + 0.5;
        this.y = this.tileY + dy + 0.5;
        this.stopMoving();
        return;
      }
    }
  }
}
