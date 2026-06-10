import { DAY_SECONDS } from './constants';
import { GameMap } from './map';
import { Pawn } from './pawn';
import type { ItemType } from './types';

const PAWN_DEFS: [string, number][] = [
  ['도현', 0xe2b06c],
  ['서연', 0x6cb4e2],
  ['민준', 0xb287d6],
];

export class Game {
  map = new GameMap();
  pawns: Pawn[] = [];
  time = DAY_SECONDS * 0.3; // 아침부터 시작
  speedIdx = 1;
  readonly speeds = [0, 1, 3, 6];
  /** 작업이 점유 중인 타일 인덱스 (이중 배정 방지) */
  reserved = new Set<number>();

  constructor() {
    this.map.generate();
    const cx = this.map.w >> 1;
    const cy = this.map.h >> 1;
    PAWN_DEFS.forEach(([name, color], i) => {
      this.pawns.push(new Pawn(cx - 1 + i, cy - 1, name, color));
    });
  }

  update(realDt: number) {
    const mult = this.speeds[this.speedIdx];
    if (mult === 0) return;
    // 고배속에서도 시뮬이 안정적이도록 0.05초 단위로 쪼개서 진행
    let remaining = realDt * mult;
    while (remaining > 0) {
      const dt = Math.min(remaining, 0.05);
      remaining -= dt;
      this.time += dt;
      this.map.update(dt);
      for (const p of this.pawns) p.update(this, dt);
    }
  }

  /** 0~1, 0이 자정 */
  get timeOfDay(): number {
    return (this.time % DAY_SECONDS) / DAY_SECONDS;
  }
  get day(): number {
    return Math.floor(this.time / DAY_SECONDS) + 1;
  }
  get isNight(): boolean {
    const t = this.timeOfDay;
    return t < 0.22 || t > 0.87;
  }
  /** 밤 어두움 정도 0~1 */
  get darkness(): number {
    const t = this.timeOfDay;
    if (t < 0.22) return Math.min(1, (0.22 - t) / 0.08);
    if (t > 0.87) return Math.min(1, (t - 0.87) / 0.08);
    return 0;
  }
  get clockText(): string {
    const h = Math.floor(this.timeOfDay * 24);
    const m = Math.floor((this.timeOfDay * 24 - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  countResources(): Record<ItemType, number> {
    const out = this.map.countItems();
    for (const p of this.pawns) {
      if (p.carrying) out[p.carrying.type] += p.carrying.count;
    }
    return out;
  }

  // ---------- 저장 / 불러오기 ----------

  save(): boolean {
    try {
      const data = {
        v: 1,
        time: this.time,
        map: this.map.serialize(),
        pawns: this.pawns.map((p) => ({
          x: p.x, y: p.y, name: p.name, color: p.color,
          hunger: p.hunger, rest: p.rest, carrying: p.carrying,
        })),
      };
      localStorage.setItem('rimweb-save', JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  load(): boolean {
    const raw = localStorage.getItem('rimweb-save');
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      if (data.v !== 1) return false;
      this.time = data.time;
      this.map.deserialize(data.map);
      this.reserved.clear();
      // 정착민 수는 고정이므로 인덱스로 짝지어 복원
      const n = Math.min(this.pawns.length, data.pawns.length);
      for (let i = 0; i < n; i++) {
        const p = this.pawns[i];
        const s = data.pawns[i];
        if (p.job) p.job.cleanup(this);
        p.job = null;
        p.sleeping = false;
        p.stopMoving();
        p.x = s.x; p.y = s.y;
        p.name = s.name; p.color = s.color;
        p.hunger = s.hunger; p.rest = s.rest;
        p.carrying = s.carrying;
      }
      return true;
    } catch {
      return false;
    }
  }
}
