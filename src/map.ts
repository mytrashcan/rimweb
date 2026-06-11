import { MAP_W, MAP_H, BUSH_REGROW_SECONDS, CROP_GROW_SECONDS, WALL_HP } from './constants';
import { Terrain, Plant, Structure, Designation } from './types';
import type { Blueprint, ItemStack, ItemType } from './types';

/** (cx,cy)에서 바깥으로 번지는 정사각 링 순회 (r=0 중심부터) */
export function* spiralTiles(cx: number, cy: number, maxR: number): Generator<[number, number]> {
  yield [cx, cy];
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        yield [cx + dx, cy + dy];
      }
    }
  }
}

export class GameMap {
  readonly w = MAP_W;
  readonly h = MAP_H;
  terrain = new Uint8Array(MAP_W * MAP_H);
  rock = new Uint8Array(MAP_W * MAP_H);
  plant = new Uint8Array(MAP_W * MAP_H);
  growth = new Float32Array(MAP_W * MAP_H); // 덤불 성장도 0~1
  structure = new Uint8Array(MAP_W * MAP_H);
  structureHp = new Float32Array(MAP_W * MAP_H);
  stockpile = new Uint8Array(MAP_W * MAP_H);
  farm = new Uint8Array(MAP_W * MAP_H);
  designation = new Uint8Array(MAP_W * MAP_H);
  baseColor = new Uint32Array(MAP_W * MAP_H);
  blueprints = new Map<number, Blueprint>();
  items = new Map<number, ItemStack>();
  dirty = true; // 타일 레이어 다시 그리기 필요

  idx(x: number, y: number): number {
    return y * this.w + x;
  }
  xy(idx: number): [number, number] {
    return [idx % this.w, (idx / this.w) | 0];
  }
  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  walkable(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const i = this.idx(x, y);
    return (
      this.terrain[i] !== Terrain.Water &&
      !this.rock[i] &&
      this.structure[i] !== Structure.Wall
    );
  }
  walkableIdx(i: number): boolean {
    return this.walkable(i % this.w, (i / this.w) | 0);
  }
  /** 건설 가능: 통행 가능 + 식물/구조물/청사진/아이템 없음 */
  buildableClear(i: number): boolean {
    return (
      this.walkableIdx(i) &&
      this.plant[i] === Plant.None &&
      this.structure[i] === Structure.None &&
      !this.blueprints.has(i) &&
      !this.items.has(i)
    );
  }

  /** @param growthMult 계절별 성장 배율 (겨울 0) */
  update(dt: number, growthMult = 1) {
    if (growthMult <= 0) return;
    // 덤불 재성장 + 작물 성장
    for (let i = 0; i < this.plant.length; i++) {
      if (this.plant[i] === Plant.Bush && this.growth[i] < 1) {
        this.growth[i] = Math.min(1, this.growth[i] + (growthMult * dt) / BUSH_REGROW_SECONDS);
      } else if (this.plant[i] === Plant.Crop && this.growth[i] < 1) {
        const before = this.growth[i];
        this.growth[i] = Math.min(1, this.growth[i] + (growthMult * dt) / CROP_GROW_SECONDS);
        // 성장 단계가 바뀔 때만 다시 그리기 (4단계)
        if (((before * 4) | 0) !== ((this.growth[i] * 4) | 0)) this.dirty = true;
      }
    }
  }

  /** 아이템 낙하: 같은 종류면 합치고, 다른 종류가 있으면 주변 빈 칸을 찾는다. */
  dropItem(i: number, type: ItemType, count: number) {
    const target = this.findDropTile(i, type);
    if (target === null) return; // 둘 데가 전혀 없으면 소실 (사실상 발생 안 함)
    const stack = this.items.get(target);
    if (stack && stack.type === type) stack.count += count;
    else this.items.set(target, { type, count });
  }

  private findDropTile(i: number, type: ItemType): number | null {
    const [sx, sy] = this.xy(i);
    for (const [x, y] of spiralTiles(sx, sy, 6)) {
      if (!this.walkable(x, y)) continue;
      const ti = this.idx(x, y);
      if (this.blueprints.has(ti)) continue;
      const stack = this.items.get(ti);
      if (!stack || stack.type === type) return ti;
    }
    return null;
  }

  /** 벽에 피해. 파괴되면 true. */
  damageWall(i: number, dmg: number): boolean {
    if (this.structure[i] !== Structure.Wall) return false;
    this.structureHp[i] -= dmg;
    if (this.structureHp[i] <= 0) {
      this.structure[i] = Structure.None;
      this.structureHp[i] = 0;
      this.dirty = true;
      return true;
    }
    return false;
  }

  /** count만큼 집어 올림. 스택이 비면 제거. 실제 가져온 수를 반환. */
  takeItem(i: number, count: number): number {
    const stack = this.items.get(i);
    if (!stack) return 0;
    const taken = Math.min(count, stack.count);
    stack.count -= taken;
    if (stack.count <= 0) this.items.delete(i);
    return taken;
  }

  countItems(): Record<ItemType, number> {
    const out: Record<ItemType, number> = { wood: 0, stone: 0, food: 0, meal: 0 };
    for (const s of this.items.values()) out[s.type] += s.count;
    return out;
  }

  hasAnyBed(): boolean {
    for (let i = 0; i < this.structure.length; i++) {
      if (this.structure[i] === Structure.Bed) return true;
    }
    return false;
  }

  // ---------- 직렬화 ----------

  serialize() {
    return {
      terrain: Array.from(this.terrain),
      rock: Array.from(this.rock),
      plant: Array.from(this.plant),
      growth: Array.from(this.growth, (v) => Math.round(v * 1000) / 1000),
      structure: Array.from(this.structure),
      structureHp: Array.from(this.structureHp, (v) => Math.round(v)),
      stockpile: Array.from(this.stockpile),
      farm: Array.from(this.farm),
      designation: Array.from(this.designation),
      blueprints: [...this.blueprints.entries()],
      items: [...this.items.entries()],
    };
  }

  deserialize(data: ReturnType<GameMap['serialize']>) {
    this.terrain.set(data.terrain);
    this.rock.set(data.rock);
    this.plant.set(data.plant);
    this.growth.set(data.growth);
    this.structure.set(data.structure);
    if (data.structureHp) this.structureHp.set(data.structureHp);
    else {
      // 구버전 세이브: 벽 체력 최대로
      for (let i = 0; i < this.structure.length; i++) {
        this.structureHp[i] = this.structure[i] === Structure.Wall ? WALL_HP : 0;
      }
    }
    this.stockpile.set(data.stockpile);
    this.farm.set(data.farm ?? []);
    this.designation.set(data.designation);
    this.blueprints = new Map(data.blueprints);
    this.items = new Map(data.items);
    this.recomputeColors();
    this.dirty = true;
  }

  // ---------- 맵 생성 ----------

  generate() {
    const cx = this.w >> 1;
    const cy = this.h >> 1;

    // 기본 잔디 + 흙 패치
    for (let i = 0; i < this.terrain.length; i++) this.terrain[i] = Terrain.Grass;
    for (let n = 0; n < 10; n++) this.blob(this.randTile(), 3 + (Math.random() * 12 | 0), (i) => {
      this.terrain[i] = Terrain.Dirt;
    });

    // 물웅덩이
    for (let n = 0; n < 3; n++) this.blob(this.randTile(), 10 + (Math.random() * 14 | 0), (i) => {
      this.terrain[i] = Terrain.Water;
    });

    // 바위 지대 (가장자리 위주 + 랜덤)
    for (let n = 0; n < 7; n++) {
      const edge = Math.random() < 0.7;
      let sx: number, sy: number;
      if (edge) {
        const side = Math.random() * 4 | 0;
        sx = side < 2 ? (side === 0 ? 3 : this.w - 4) : Math.random() * this.w | 0;
        sy = side < 2 ? Math.random() * this.h | 0 : (side === 2 ? 3 : this.h - 4);
      } else {
        [sx, sy] = this.xy(this.randTile());
      }
      this.blob(this.idx(sx, sy), 14 + (Math.random() * 24 | 0), (i) => {
        if (this.terrain[i] !== Terrain.Water) this.rock[i] = 1;
      });
    }

    // 나무 / 덤불
    for (let i = 0; i < this.terrain.length; i++) {
      if (this.terrain[i] === Terrain.Water || this.rock[i]) continue;
      const [x, y] = this.xy(i);
      const nearCenter = Math.abs(x - cx) < 6 && Math.abs(y - cy) < 6;
      const r = Math.random();
      if (!nearCenter && this.terrain[i] === Terrain.Grass && r < 0.09) {
        this.plant[i] = Plant.Tree;
      } else if (r < 0.115) {
        this.plant[i] = Plant.Bush;
        this.growth[i] = 0.4 + Math.random() * 0.6;
      }
    }

    // 정착 지점 주변 정리
    for (let dy = -5; dy <= 5; dy++) {
      for (let dx = -5; dx <= 5; dx++) {
        const i = this.idx(cx + dx, cy + dy);
        this.rock[i] = 0;
        if (this.terrain[i] === Terrain.Water) this.terrain[i] = Terrain.Dirt;
        if (Math.abs(dx) < 3 && Math.abs(dy) < 3) this.plant[i] = Plant.None;
      }
    }

    // 시작 보급품
    this.dropItem(this.idx(cx - 1, cy + 1), 'wood', 20);
    this.dropItem(this.idx(cx + 1, cy + 1), 'food', 14);

    this.recomputeColors();
    this.dirty = true;
  }

  /** 지형 기반 타일 색상 (결정적 지터 포함) — 맵 생성/로드 후 호출 */
  recomputeColors() {
    for (let i = 0; i < this.terrain.length; i++) {
      const base =
        this.terrain[i] === Terrain.Grass ? 0x3f6d3a :
        this.terrain[i] === Terrain.Dirt ? 0x6e5a3e : 0x2e5d8c;
      const j = ((i * 2654435761) >>> 24) % 14 - 7;
      const r = Math.min(255, Math.max(0, ((base >> 16) & 0xff) + j));
      const g = Math.min(255, Math.max(0, ((base >> 8) & 0xff) + j));
      const b = Math.min(255, Math.max(0, (base & 0xff) + j));
      this.baseColor[i] = (r << 16) | (g << 8) | b;
    }
  }

  private randTile(): number {
    return (Math.random() * this.terrain.length) | 0;
  }

  /** 랜덤 워크 방식의 얼룩 채우기 */
  private blob(start: number, steps: number, paint: (i: number) => void) {
    let [x, y] = this.xy(start);
    for (let s = 0; s < steps; s++) {
      for (let dy = 0; dy <= 1; dy++) {
        for (let dx = 0; dx <= 1; dx++) {
          if (this.inBounds(x + dx, y + dy)) paint(this.idx(x + dx, y + dy));
        }
      }
      x += (Math.random() * 3 | 0) - 1;
      y += (Math.random() * 3 | 0) - 1;
      x = Math.max(0, Math.min(this.w - 1, x));
      y = Math.max(0, Math.min(this.h - 1, y));
    }
  }
}

export { Terrain, Plant, Structure, Designation };
