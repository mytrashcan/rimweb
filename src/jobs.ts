import {
  CHOP_SECONDS, MINE_SECONDS, EAT_SECONDS, BUSH_EAT_SECONDS,
  WOOD_PER_TREE, STONE_PER_ROCK, CONSTRUCT_SPEED,
  HUNGER_SEEK_FOOD, REST_COLLAPSE, NIGHT_SLEEP_REST,
} from './constants';
import { bfsNearest } from './astar';
import { Plant, Structure, Designation } from './map';
import type { Game } from './game';
import type { Pawn } from './pawn';

export abstract class Job {
  done = false;
  failed = false;
  abstract label: string;
  private reservedIdxs: number[] = [];

  abstract update(p: Pawn, g: Game, dt: number): void;

  reserve(g: Game, idx: number) {
    g.reserved.add(idx);
    this.reservedIdxs.push(idx);
  }
  cleanup(g: Game) {
    for (const i of this.reservedIdxs) g.reserved.delete(i);
  }
}

// ---------- 작업: 벌목 ----------

class ChopJob extends Job {
  label = '벌목 중';
  private timer = CHOP_SECONDS;
  constructor(private target: number) {
    super();
  }
  update(p: Pawn, g: Game, dt: number) {
    const m = g.map;
    if (m.plant[this.target] !== Plant.Tree || m.designation[this.target] !== Designation.Chop) {
      this.failed = true;
      return;
    }
    const [tx, ty] = m.xy(this.target);
    const move = p.goTo(g, dt, tx, ty);
    if (move === 'blocked') { this.failed = true; return; }
    if (move !== 'arrived') return;
    this.timer -= dt;
    if (this.timer <= 0) {
      m.plant[this.target] = Plant.None;
      m.designation[this.target] = Designation.None;
      m.dropItem(this.target, 'wood', WOOD_PER_TREE);
      m.dirty = true;
      this.done = true;
    }
  }
}

// ---------- 작업: 채굴 ----------

class MineJob extends Job {
  label = '채굴 중';
  private timer = MINE_SECONDS;
  constructor(private target: number) {
    super();
  }
  update(p: Pawn, g: Game, dt: number) {
    const m = g.map;
    if (!m.rock[this.target] || m.designation[this.target] !== Designation.Mine) {
      this.failed = true;
      return;
    }
    const [tx, ty] = m.xy(this.target);
    const move = p.goTo(g, dt, tx, ty, true);
    if (move === 'blocked') { this.failed = true; return; }
    if (move !== 'arrived') return;
    this.timer -= dt;
    if (this.timer <= 0) {
      m.rock[this.target] = 0;
      m.designation[this.target] = Designation.None;
      m.dropItem(this.target, 'stone', STONE_PER_ROCK);
      m.dirty = true;
      this.done = true;
    }
  }
}

// ---------- 작업: 운반 (땅 위 아이템 → 비축구역) ----------

class HaulJob extends Job {
  label = '운반 중';
  private phase: 'fetch' | 'deliver' = 'fetch';
  constructor(private src: number, private dest: number) {
    super();
  }
  update(p: Pawn, g: Game, dt: number) {
    const m = g.map;
    if (this.phase === 'fetch') {
      const stack = m.items.get(this.src);
      if (!stack) { this.failed = true; return; }
      const [sx, sy] = m.xy(this.src);
      const move = p.goTo(g, dt, sx, sy);
      if (move === 'blocked') { this.failed = true; return; }
      if (move !== 'arrived') return;
      const cur = m.items.get(this.src);
      if (!cur) { this.failed = true; return; }
      const taken = m.takeItem(this.src, cur.count);
      p.carrying = { type: cur.type, count: taken };
      this.phase = 'deliver';
    } else {
      if (!p.carrying) { this.failed = true; return; }
      // 목적지가 유효하지 않게 됐으면(다른 종류 스택이 생겼으면) 재탐색
      const destStack = m.items.get(this.dest);
      if (!m.stockpile[this.dest] || (destStack && destStack.type !== p.carrying.type)) {
        const nd = findStockpileDest(g, p.tileX, p.tileY, p.carrying.type);
        if (nd === null) {
          m.dropItem(m.idx(p.tileX, p.tileY), p.carrying.type, p.carrying.count);
          p.carrying = null;
          this.failed = true;
          return;
        }
        this.dest = nd;
      }
      const [dx, dy] = m.xy(this.dest);
      const move = p.goTo(g, dt, dx, dy);
      if (move === 'blocked') {
        m.dropItem(m.idx(p.tileX, p.tileY), p.carrying.type, p.carrying.count);
        p.carrying = null;
        this.failed = true;
        return;
      }
      if (move !== 'arrived') return;
      m.dropItem(this.dest, p.carrying.type, p.carrying.count);
      p.carrying = null;
      this.done = true;
    }
  }
}

// ---------- 작업: 자재 배달 (목재 → 청사진) ----------

class DeliverJob extends Job {
  label = '자재 배달 중';
  private phase: 'fetch' | 'deliver' = 'fetch';
  constructor(private src: number, private bpIdx: number) {
    super();
  }
  update(p: Pawn, g: Game, dt: number) {
    const m = g.map;
    const bp = m.blueprints.get(this.bpIdx);
    if (!bp) {
      if (p.carrying) {
        m.dropItem(m.idx(p.tileX, p.tileY), p.carrying.type, p.carrying.count);
        p.carrying = null;
      }
      this.failed = true;
      return;
    }
    if (this.phase === 'fetch') {
      const stack = m.items.get(this.src);
      if (!stack || stack.type !== 'wood') { this.failed = true; return; }
      const [sx, sy] = m.xy(this.src);
      const move = p.goTo(g, dt, sx, sy);
      if (move === 'blocked') { this.failed = true; return; }
      if (move !== 'arrived') return;
      const need = bp.woodNeed - bp.woodHas;
      const taken = m.takeItem(this.src, need);
      if (taken === 0) { this.failed = true; return; }
      p.carrying = { type: 'wood', count: taken };
      this.phase = 'deliver';
    } else {
      const [bx, by] = m.xy(this.bpIdx);
      const move = p.goTo(g, dt, bx, by, true);
      if (move === 'blocked') {
        m.dropItem(m.idx(p.tileX, p.tileY), p.carrying!.type, p.carrying!.count);
        p.carrying = null;
        this.failed = true;
        return;
      }
      if (move !== 'arrived') return;
      const used = Math.min(p.carrying!.count, bp.woodNeed - bp.woodHas);
      bp.woodHas += used;
      const leftover = p.carrying!.count - used;
      if (leftover > 0) m.dropItem(m.idx(p.tileX, p.tileY), 'wood', leftover);
      p.carrying = null;
      this.done = true;
    }
  }
}

// ---------- 작업: 건설 ----------

class ConstructJob extends Job {
  label = '건설 중';
  constructor(private bpIdx: number) {
    super();
  }
  update(p: Pawn, g: Game, dt: number) {
    const m = g.map;
    const bp = m.blueprints.get(this.bpIdx);
    if (!bp || bp.woodHas < bp.woodNeed) { this.failed = true; return; }
    const [bx, by] = m.xy(this.bpIdx);
    const move = p.goTo(g, dt, bx, by, true);
    if (move === 'blocked') { this.failed = true; return; }
    if (move !== 'arrived') return;
    bp.workLeft -= CONSTRUCT_SPEED * dt;
    if (bp.workLeft <= 0) {
      m.blueprints.delete(this.bpIdx);
      m.structure[this.bpIdx] = bp.kind;
      m.plant[this.bpIdx] = Plant.None;
      m.dirty = true;
      if (bp.kind === Structure.Wall) {
        for (const other of g.pawns) other.nudgeToWalkable(g);
      }
      this.done = true;
    }
  }
}

// ---------- 작업: 식사 ----------

class EatJob extends Job {
  label = '식사하러 가는 중';
  private timer = -1;
  constructor(private target: number, private kind: 'item' | 'bush') {
    super();
  }
  update(p: Pawn, g: Game, dt: number) {
    const m = g.map;
    if (this.kind === 'item') {
      const stack = m.items.get(this.target);
      if (this.timer < 0 && (!stack || stack.type !== 'food')) { this.failed = true; return; }
    } else if (this.timer < 0 && (m.plant[this.target] !== Plant.Bush || m.growth[this.target] < 0.5)) {
      this.failed = true;
      return;
    }
    const [tx, ty] = m.xy(this.target);
    if (this.timer < 0) {
      const move = p.goTo(g, dt, tx, ty);
      if (move === 'blocked') { this.failed = true; return; }
      if (move !== 'arrived') return;
      // 도착: 먹기 시작
      if (this.kind === 'item') {
        if (m.takeItem(this.target, 1) === 0) { this.failed = true; return; }
        this.timer = EAT_SECONDS;
      } else {
        this.timer = BUSH_EAT_SECONDS;
      }
      this.label = '식사 중';
      return;
    }
    this.timer -= dt;
    if (this.timer <= 0) {
      if (this.kind === 'item') {
        p.hunger = Math.min(1, p.hunger + 0.85);
      } else {
        p.hunger = Math.min(1, p.hunger + 0.5);
        m.growth[this.target] = 0;
      }
      this.done = true;
    }
  }
}

// ---------- 작업: 수면 ----------

class SleepJob extends Job {
  label = '자러 가는 중';
  private inBed = false;
  private started = false;
  constructor(private bedIdx: number | null) {
    super();
  }
  update(p: Pawn, g: Game, dt: number) {
    const m = g.map;
    if (this.bedIdx !== null && !this.started) {
      if (m.structure[this.bedIdx] !== Structure.Bed) { this.failed = true; return; }
      const [bx, by] = m.xy(this.bedIdx);
      const move = p.goTo(g, dt, bx, by);
      if (move === 'blocked') { this.bedIdx = null; return; }
      if (move !== 'arrived') return;
      this.inBed = true;
    }
    if (!this.started) {
      this.started = true;
      this.label = this.inBed ? '수면 중' : '바닥에서 수면 중';
      p.sleeping = true;
    }
    p.rest = Math.min(1, p.rest + dt / (this.inBed ? 40 : 110));
    if (p.rest >= 0.99) {
      p.sleeping = false;
      this.done = true;
    }
  }
}

// ---------- 작업: 배회 ----------

class WanderJob extends Job {
  label = '서성이는 중';
  private target: { x: number; y: number } | null = null;
  private idleTimer = 1 + Math.random() * 2;
  update(p: Pawn, g: Game, dt: number) {
    if (!this.target) {
      this.idleTimer -= dt;
      if (this.idleTimer > 0) {
        // 잠깐 서 있는 동안에도 더 중요한 일이 생겼으면 양보
        if (hasUrgentWork(p, g)) this.done = true;
        return;
      }
      for (let tries = 0; tries < 8; tries++) {
        const tx = p.tileX + ((Math.random() * 9) | 0) - 4;
        const ty = p.tileY + ((Math.random() * 9) | 0) - 4;
        if (g.map.walkable(tx, ty)) {
          this.target = { x: tx, y: ty };
          break;
        }
      }
      if (!this.target) { this.done = true; return; }
    }
    const move = p.goTo(g, dt, this.target.x, this.target.y);
    if (move !== 'moving') this.done = true;
  }
}

function hasUrgentWork(p: Pawn, g: Game): boolean {
  if (p.hunger < HUNGER_SEEK_FOOD || p.rest < REST_COLLAPSE) return true;
  for (let i = 0; i < g.map.designation.length; i++) {
    if (g.map.designation[i] !== Designation.None && !g.reserved.has(i)) return true;
  }
  for (const [i] of g.map.blueprints) {
    if (!g.reserved.has(i)) return true;
  }
  return false;
}

// ---------- 잡 기버: 우선순위에 따라 다음 일 결정 ----------

function findStockpileDest(g: Game, sx: number, sy: number, type: string): number | null {
  const m = g.map;
  return bfsNearest(m, sx, sy, (i) => {
    if (!m.stockpile[i] || g.reserved.has(i) || !m.walkableIdx(i) || m.blueprints.has(i)) return false;
    const stack = m.items.get(i);
    return !stack || stack.type === type;
  });
}

function makeEatJob(p: Pawn, g: Game): Job | null {
  const m = g.map;
  const foodIdx = bfsNearest(m, p.tileX, p.tileY, (i) => {
    const s = m.items.get(i);
    return !!s && s.type === 'food' && !g.reserved.has(i) && m.walkableIdx(i);
  });
  if (foodIdx !== null) {
    const j = new EatJob(foodIdx, 'item');
    j.reserve(g, foodIdx);
    return j;
  }
  const bushIdx = bfsNearest(m, p.tileX, p.tileY, (i) =>
    m.plant[i] === Plant.Bush && m.growth[i] >= 0.5 && !g.reserved.has(i) && m.walkableIdx(i),
  );
  if (bushIdx !== null) {
    const j = new EatJob(bushIdx, 'bush');
    j.reserve(g, bushIdx);
    return j;
  }
  return null;
}

function makeSleepJob(p: Pawn, g: Game): Job {
  const m = g.map;
  const bedIdx = bfsNearest(m, p.tileX, p.tileY, (i) =>
    m.structure[i] === Structure.Bed && !g.reserved.has(i),
  );
  const j = new SleepJob(bedIdx);
  if (bedIdx !== null) j.reserve(g, bedIdx);
  return j;
}

export function findJob(p: Pawn, g: Game): Job {
  const m = g.map;

  // 1. 생존 욕구
  if (p.hunger < HUNGER_SEEK_FOOD) {
    const j = makeEatJob(p, g);
    if (j) return j;
  }
  if (p.rest < REST_COLLAPSE) return makeSleepJob(p, g);
  if (g.isNight && p.rest < NIGHT_SLEEP_REST) return makeSleepJob(p, g);

  // 2. 자재 배달이 필요한 청사진
  for (const [bpIdx, bp] of m.blueprints) {
    if (bp.woodHas >= bp.woodNeed || g.reserved.has(bpIdx)) continue;
    const src = bfsNearest(m, p.tileX, p.tileY, (i) => {
      const s = m.items.get(i);
      return !!s && s.type === 'wood' && !g.reserved.has(i) && m.walkableIdx(i);
    });
    if (src !== null) {
      const j = new DeliverJob(src, bpIdx);
      j.reserve(g, src);
      j.reserve(g, bpIdx);
      return j;
    }
  }

  // 3. 자재가 갖춰진 청사진 건설
  for (const [bpIdx, bp] of m.blueprints) {
    if (bp.woodHas < bp.woodNeed || g.reserved.has(bpIdx)) continue;
    const j = new ConstructJob(bpIdx);
    j.reserve(g, bpIdx);
    return j;
  }

  // 4. 벌목/채굴 지정 (걸어서 닿을 수 있는 가장 가까운 것)
  const desIdx = bfsNearest(m, p.tileX, p.tileY, (i) =>
    m.designation[i] !== Designation.None && !g.reserved.has(i),
  );
  if (desIdx !== null) {
    const j = m.designation[desIdx] === Designation.Chop ? new ChopJob(desIdx) : new MineJob(desIdx);
    j.reserve(g, desIdx);
    return j;
  }

  // 5. 운반: 비축구역 밖 아이템 → 비축구역
  const haulSrc = bfsNearest(m, p.tileX, p.tileY, (i) => {
    if (!m.items.has(i) || m.stockpile[i] || g.reserved.has(i)) return false;
    return m.walkableIdx(i);
  });
  if (haulSrc !== null) {
    const stack = m.items.get(haulSrc)!;
    const dest = findStockpileDest(g, p.tileX, p.tileY, stack.type);
    if (dest !== null) {
      const j = new HaulJob(haulSrc, dest);
      j.reserve(g, haulSrc);
      j.reserve(g, dest);
      return j;
    }
  }

  // 6. 할 일 없음: 배회
  return new WanderJob();
}
