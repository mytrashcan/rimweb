import {
  CHOP_SECONDS, MINE_SECONDS, EAT_SECONDS, BUSH_EAT_SECONDS,
  WOOD_PER_TREE, STONE_PER_ROCK, CONSTRUCT_SPEED,
  SOW_SECONDS, HARVEST_SECONDS, FOOD_PER_HARVEST, WALL_HP,
  HUNGER_SEEK_FOOD, REST_COLLAPSE, NIGHT_SLEEP_REST,
  BREAK_DURATION, BREAK_CATHARSIS,
  SHOOT_COOLDOWN,
  COOK_SECONDS, COOK_RAW_NEEDED, MEAL_HUNGER, RAW_HUNGER, MEAL_MOOD_SECONDS,
  FIRE_BEAT_RATE,
} from './constants';
import { hasLineOfSight, shootRange, shootDamage } from './combat';
import { bfsNearest } from './astar';
import { Plant, Structure, Designation } from './map';
import { WORK_TYPES } from './types';
import type { WorkType } from './types';
import type { Game } from './game';
import type { Pawn } from './pawn';

export abstract class Job {
  done = false;
  failed = false;
  /** true면 강제 명령/징집으로 중단할 수 없다 (멘탈 브레이크 등) */
  uninterruptible = false;
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
      if (bp.kind === Structure.Wall) m.structureHp[this.bpIdx] = WALL_HP;
      m.plant[this.bpIdx] = Plant.None;
      m.dirty = true;
      if (bp.kind === Structure.Wall) {
        for (const other of g.pawns) other.nudgeToWalkable(g);
      }
      this.done = true;
    }
  }
}

// ---------- 작업: 파종 ----------

class SowJob extends Job {
  label = '파종 중';
  private timer = SOW_SECONDS;
  constructor(private target: number) {
    super();
  }
  update(p: Pawn, g: Game, dt: number) {
    const m = g.map;
    if (!m.farm[this.target] || m.plant[this.target] !== Plant.None || !m.walkableIdx(this.target)) {
      this.failed = true;
      return;
    }
    const [tx, ty] = m.xy(this.target);
    const move = p.goTo(g, dt, tx, ty);
    if (move === 'blocked') { this.failed = true; return; }
    if (move !== 'arrived') return;
    this.timer -= dt;
    if (this.timer <= 0) {
      m.plant[this.target] = Plant.Crop;
      m.growth[this.target] = 0;
      m.dirty = true;
      this.done = true;
    }
  }
}

// ---------- 작업: 수확 ----------

class HarvestJob extends Job {
  label = '수확 중';
  private timer = HARVEST_SECONDS;
  constructor(private target: number) {
    super();
  }
  update(p: Pawn, g: Game, dt: number) {
    const m = g.map;
    if (m.plant[this.target] !== Plant.Crop || m.growth[this.target] < 1) {
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
      m.growth[this.target] = 0;
      m.dropItem(this.target, 'food', FOOD_PER_HARVEST);
      m.dirty = true;
      this.done = true;
    }
  }
}

// ---------- 작업: 이동 명령 ----------

export class MoveJob extends Job {
  label = '이동 중';
  constructor(private tx: number, private ty: number) {
    super();
  }
  update(p: Pawn, g: Game, dt: number) {
    const move = p.goTo(g, dt, this.tx, this.ty);
    if (move === 'blocked') this.failed = true;
    else if (move === 'arrived') this.done = true;
  }
}

// ---------- 작업: 식사 ----------

class EatJob extends Job {
  label = '식사하러 가는 중';
  private timer = -1;
  private eatenType: 'meal' | 'food' | 'bush' = 'bush';
  constructor(private target: number, private kind: 'item' | 'bush') {
    super();
  }
  update(p: Pawn, g: Game, dt: number) {
    const m = g.map;
    if (this.kind === 'item') {
      const stack = m.items.get(this.target);
      if (this.timer < 0 && (!stack || (stack.type !== 'food' && stack.type !== 'meal'))) {
        this.failed = true;
        return;
      }
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
        const stack = m.items.get(this.target);
        if (!stack || m.takeItem(this.target, 1) === 0) { this.failed = true; return; }
        this.eatenType = stack.type === 'meal' ? 'meal' : 'food';
        this.timer = EAT_SECONDS;
      } else {
        this.timer = BUSH_EAT_SECONDS;
      }
      this.label = '식사 중';
      return;
    }
    this.timer -= dt;
    if (this.timer <= 0) {
      if (this.eatenType === 'meal') {
        p.hunger = Math.min(1, p.hunger + MEAL_HUNGER);
        p.mealMood = 1;
      } else if (this.eatenType === 'food') {
        p.hunger = Math.min(1, p.hunger + RAW_HUNGER);
        p.mealMood = -1;
      } else {
        p.hunger = Math.min(1, p.hunger + 0.5);
        p.mealMood = -1;
        m.growth[this.target] = 0;
      }
      p.mealMoodTimer = MEAL_MOOD_SECONDS;
      this.done = true;
    }
  }
}

// ---------- 작업: 요리 (화덕에서 생식량 2 → 요리 1) ----------

export class CookJob extends Job {
  label = '요리 재료 모으는 중';
  private timer = -1;
  constructor(private stoveIdx: number) {
    super();
  }
  update(p: Pawn, g: Game, dt: number) {
    const m = g.map;
    if (m.structure[this.stoveIdx] !== Structure.Stove) { this.dropAndFail(p, g); return; }

    // 1단계: 생식량 모으기 (여러 스택에서 채울 수 있음)
    const have = p.carrying?.type === 'food' ? p.carrying.count : 0;
    if (have < COOK_RAW_NEEDED && this.timer < 0) {
      if (p.carrying && p.carrying.type !== 'food') { this.dropAndFail(p, g); return; }
      const src = bfsNearest(m, p.tileX, p.tileY, (i) => {
        const s = m.items.get(i);
        return !!s && s.type === 'food' && !g.reserved.has(i) && m.walkableIdx(i);
      });
      if (src === null) { this.dropAndFail(p, g); return; }
      const [sx, sy] = m.xy(src);
      const move = p.goTo(g, dt, sx, sy);
      if (move === 'blocked') { this.dropAndFail(p, g); return; }
      if (move !== 'arrived') return;
      const taken = m.takeItem(src, COOK_RAW_NEEDED - have);
      if (taken === 0) { this.dropAndFail(p, g); return; }
      p.carrying = { type: 'food', count: have + taken };
      return;
    }

    // 2단계: 화덕에서 조리
    const [bx, by] = m.xy(this.stoveIdx);
    const move = p.goTo(g, dt, bx, by, true);
    if (move === 'blocked') { this.dropAndFail(p, g); return; }
    if (move !== 'arrived') return;
    if (this.timer < 0) {
      this.timer = COOK_SECONDS;
      this.label = '요리 중';
    }
    this.timer -= dt;
    if (this.timer <= 0) {
      p.carrying = null;
      m.dropItem(this.stoveIdx, 'meal', 1);
      this.done = true;
    }
  }
  private dropAndFail(p: Pawn, g: Game) {
    if (p.carrying) {
      g.map.dropItem(g.map.idx(p.tileX, p.tileY), p.carrying.type, p.carrying.count);
      p.carrying = null;
    }
    this.failed = true;
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

// ---------- 작업: 무기 장착 ----------

class EquipJob extends Job {
  label = '무기 챙기는 중';
  constructor(private target: number) {
    super();
  }
  update(p: Pawn, g: Game, dt: number) {
    const m = g.map;
    const stack = m.items.get(this.target);
    if (!stack || stack.type !== 'rifle') { this.failed = true; return; }
    const [tx, ty] = m.xy(this.target);
    const move = p.goTo(g, dt, tx, ty);
    if (move === 'blocked') { this.failed = true; return; }
    if (move !== 'arrived') return;
    if (m.takeItem(this.target, 1) === 0) { this.failed = true; return; }
    p.weapon = 'rifle';
    g.addMessage(`🔫 ${p.name}이(가) 소총을 장착했다.`);
    this.done = true;
  }
}

// ---------- 작업: 화재 진압 ----------

class BeatFireJob extends Job {
  label = '화재 진압 중';
  constructor(private target: number) {
    super();
  }
  update(p: Pawn, g: Game, dt: number) {
    const m = g.map;
    if (m.fire[this.target] <= 0) { this.done = true; return; }
    const [tx, ty] = m.xy(this.target);
    // 불 위에 서지 않도록 인접 칸에서 두드려 끈다
    const move = p.goTo(g, dt, tx, ty, true);
    if (move === 'blocked') { this.failed = true; return; }
    if (move !== 'arrived') return;
    m.fire[this.target] = Math.max(0, m.fire[this.target] - FIRE_BEAT_RATE * dt);
    if (m.fire[this.target] <= 0) this.done = true;
  }
}

// ---------- 작업: 사냥 ----------

export class HuntJob extends Job {
  label = '사냥 중';
  constructor(private target: Pawn) {
    super();
    target.targeted = true;
  }
  update(p: Pawn, g: Game, dt: number) {
    const t = this.target;
    if (t.dead) { this.done = true; return; }
    if (!t.hunted) { this.failed = true; return; }
    const d = Math.hypot(t.x - p.x, t.y - p.y);
    if (d <= shootRange(p) - 0.5 && hasLineOfSight(g, p.x, p.y, t.x, t.y)) {
      p.stopMoving();
      if (p.attackCd <= 0) {
        p.attackCd = SHOOT_COOLDOWN;
        g.shots.push({ x0: p.x, y0: p.y, x1: t.x, y1: t.y, ttl: 0.15, color: 0xffe08a });
        t.takeDamage(g, shootDamage(p) * (0.7 + Math.random() * 0.6));
      }
      return;
    }
    if (p.goTo(g, dt, t.tileX, t.tileY) === 'blocked') this.failed = true;
  }
  cleanup(g: Game) {
    super.cleanup(g);
    this.target.targeted = false;
  }
}

// ---------- 작업: 구조 (쓰러진 동료 → 침대) ----------

export class RescueJob extends Job {
  label = '구조하러 가는 중';
  private phase: 'fetch' | 'carry' = 'fetch';
  constructor(private target: Pawn, private bedIdx: number) {
    super();
    target.beingRescued = true;
  }
  update(p: Pawn, g: Game, dt: number) {
    const m = g.map;
    if (!this.target.downed) { this.done = true; return; } // 스스로 일어남
    if (m.structure[this.bedIdx] !== Structure.Bed) { this.failed = true; return; }
    if (this.phase === 'fetch') {
      const move = p.goTo(g, dt, this.target.tileX, this.target.tileY);
      if (move === 'blocked') { this.failed = true; return; }
      if (move !== 'arrived') return;
      this.phase = 'carry';
      this.label = '구조 중 (업고 이동)';
    } else {
      // 업힌 동료는 구조자를 따라간다
      this.target.x = p.x;
      this.target.y = p.y;
      const [bx, by] = m.xy(this.bedIdx);
      const move = p.goTo(g, dt, bx, by);
      if (move === 'blocked') { this.failed = true; return; }
      if (move !== 'arrived') return;
      this.target.x = bx + 0.5;
      this.target.y = by + 0.5;
      this.done = true;
    }
  }
  cleanup(g: Game) {
    super.cleanup(g);
    this.target.beingRescued = false;
  }
}

// ---------- 작업: 멘탈 브레이크 ----------

export class BreakJob extends Job {
  label = '멘탈 브레이크 🤯';
  uninterruptible = true;
  private timeLeft = BREAK_DURATION;
  private target: { x: number; y: number } | null = null;
  update(p: Pawn, g: Game, dt: number) {
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      p.mood = Math.min(1, p.mood + BREAK_CATHARSIS); // 발산하고 나면 후련해진다
      this.done = true;
      return;
    }
    // 정처 없이 빠르게 배회
    if (!this.target) {
      for (let tries = 0; tries < 8; tries++) {
        const tx = p.tileX + ((Math.random() * 13) | 0) - 6;
        const ty = p.tileY + ((Math.random() * 13) | 0) - 6;
        if (g.map.walkable(tx, ty)) {
          this.target = { x: tx, y: ty };
          break;
        }
      }
      if (!this.target) return;
    }
    if (p.goTo(g, dt, this.target.x, this.target.y) !== 'moving') this.target = null;
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
  if (g.map.fire.some((v) => v > 0)) return true;
  if (g.pawns.some((o) => o !== p && o.downed && !o.beingRescued)) return true;
  if (p.priorities.hunt > 0 && g.animals.some((a) => !a.dead && a.hunted && !a.targeted)) return true;
  const m = g.map;
  const wants = (wt: WorkType) => p.priorities[wt] > 0;
  for (let i = 0; i < m.designation.length; i++) {
    if (g.reserved.has(i)) continue;
    if (m.designation[i] === Designation.Chop && wants('chop')) return true;
    if (m.designation[i] === Designation.Mine && wants('mine')) return true;
    if (wants('grow')) {
      if (m.plant[i] === Plant.Crop && m.growth[i] >= 1) return true;
      if (m.farm[i] && m.plant[i] === Plant.None && m.walkableIdx(i)) return true;
    }
  }
  if (wants('construct')) {
    for (const [i] of m.blueprints) {
      if (!g.reserved.has(i)) return true;
    }
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
  // 요리를 가장 선호하고, 없으면 생식량 → 덤불 순
  for (const wanted of ['meal', 'food'] as const) {
    const idx = bfsNearest(m, p.tileX, p.tileY, (i) => {
      const s = m.items.get(i);
      return !!s && s.type === wanted && !g.reserved.has(i) && m.walkableIdx(i);
    });
    if (idx !== null) {
      const j = new EatJob(idx, 'item');
      j.reserve(g, idx);
      return j;
    }
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

// ---------- 작업 종류별 메이커 ----------

function makeConstructWork(p: Pawn, g: Game): Job | null {
  const m = g.map;
  // 자재 배달이 필요한 청사진
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
  // 자재가 갖춰진 청사진 시공
  for (const [bpIdx, bp] of m.blueprints) {
    if (bp.woodHas < bp.woodNeed || g.reserved.has(bpIdx)) continue;
    const j = new ConstructJob(bpIdx);
    j.reserve(g, bpIdx);
    return j;
  }
  return null;
}

function makeGrowWork(p: Pawn, g: Game): Job | null {
  const m = g.map;
  const harvestIdx = bfsNearest(m, p.tileX, p.tileY, (i) =>
    m.plant[i] === Plant.Crop && m.growth[i] >= 1 && !g.reserved.has(i) && m.walkableIdx(i),
  );
  if (harvestIdx !== null) {
    const j = new HarvestJob(harvestIdx);
    j.reserve(g, harvestIdx);
    return j;
  }
  const sowIdx = bfsNearest(m, p.tileX, p.tileY, (i) =>
    m.farm[i] === 1 && m.plant[i] === Plant.None && !g.reserved.has(i) &&
    m.walkableIdx(i) && !m.blueprints.has(i),
  );
  if (sowIdx !== null) {
    const j = new SowJob(sowIdx);
    j.reserve(g, sowIdx);
    return j;
  }
  return null;
}

function makeMineWork(p: Pawn, g: Game): Job | null {
  const m = g.map;
  const idx = bfsNearest(m, p.tileX, p.tileY, (i) =>
    m.designation[i] === Designation.Mine && !g.reserved.has(i),
  );
  if (idx === null) return null;
  const j = new MineJob(idx);
  j.reserve(g, idx);
  return j;
}

function makeChopWork(p: Pawn, g: Game): Job | null {
  const m = g.map;
  const idx = bfsNearest(m, p.tileX, p.tileY, (i) =>
    m.designation[i] === Designation.Chop && !g.reserved.has(i),
  );
  if (idx === null) return null;
  const j = new ChopJob(idx);
  j.reserve(g, idx);
  return j;
}

function makeCookWork(p: Pawn, g: Game): Job | null {
  const m = g.map;
  // 비축 요리가 넉넉하면 쉰다
  const items = m.countItems();
  if (items.meal >= g.pawns.length * 2 || items.food < COOK_RAW_NEEDED) return null;
  const stoveIdx = bfsNearest(m, p.tileX, p.tileY, (i) =>
    m.structure[i] === Structure.Stove && !g.reserved.has(i),
  );
  if (stoveIdx === null) return null;
  const j = new CookJob(stoveIdx);
  j.reserve(g, stoveIdx);
  return j;
}

function makeHuntWork(p: Pawn, g: Game): Job | null {
  let best: Pawn | null = null;
  let bestD = Infinity;
  for (const a of g.animals) {
    if (a.dead || !a.hunted || a.targeted) continue;
    const d = Math.hypot(a.x - p.x, a.y - p.y);
    if (d < bestD) { bestD = d; best = a; }
  }
  return best ? new HuntJob(best) : null;
}

function makeHaulWork(p: Pawn, g: Game): Job | null {
  const m = g.map;
  const haulSrc = bfsNearest(m, p.tileX, p.tileY, (i) => {
    if (!m.items.has(i) || m.stockpile[i] || g.reserved.has(i)) return false;
    return m.walkableIdx(i);
  });
  if (haulSrc === null) return null;
  const stack = m.items.get(haulSrc)!;
  const dest = findStockpileDest(g, p.tileX, p.tileY, stack.type);
  if (dest === null) return null;
  const j = new HaulJob(haulSrc, dest);
  j.reserve(g, haulSrc);
  j.reserve(g, dest);
  return j;
}

const WORK_MAKERS: Record<WorkType, (p: Pawn, g: Game) => Job | null> = {
  construct: makeConstructWork,
  cook: makeCookWork,
  grow: makeGrowWork,
  mine: makeMineWork,
  chop: makeChopWork,
  hunt: makeHuntWork,
  haul: makeHaulWork,
};

export function findJob(p: Pawn, g: Game): Job {
  // 1. 생존 욕구는 항상 최우선
  if (p.hunger < HUNGER_SEEK_FOOD) {
    const j = makeEatJob(p, g);
    if (j) return j;
  }
  if (p.rest < REST_COLLAPSE) return makeSleepJob(p, g);
  if (g.isNight && p.rest < NIGHT_SLEEP_REST) return makeSleepJob(p, g);

  // 2. 화재 진압: 모든 작업보다 우선 (콜로니가 불타면 끝장이다)
  const m1 = g.map;
  const fireIdx = bfsNearest(m1, p.tileX, p.tileY, (i) => m1.fire[i] > 0 && !g.reserved.has(i));
  if (fireIdx !== null) {
    const j = new BeatFireJob(fireIdx);
    j.reserve(g, fireIdx);
    return j;
  }

  // 3. 구조: 쓰러진 동료를 침대로 (인도적 의무 — 우선순위 표보다 먼저)
  const m2 = g.map;
  const downedMate = g.pawns.find(
    (o) =>
      o !== p && o.downed && !o.beingRescued &&
      m2.structure[m2.idx(o.tileX, o.tileY)] !== Structure.Bed,
  );
  if (downedMate) {
    const reachable = bfsNearest(m2, p.tileX, p.tileY,
      (i) => i === m2.idx(downedMate.tileX, downedMate.tileY));
    const bedIdx = reachable === null ? null : bfsNearest(m2, p.tileX, p.tileY, (i) =>
      m2.structure[i] === Structure.Bed && !g.reserved.has(i) &&
      !g.pawns.some((o) => m2.idx(o.tileX, o.tileY) === i), // 누가 누워 있는 침대 제외
    );
    if (bedIdx !== null) {
      const j = new RescueJob(downedMate, bedIdx);
      j.reserve(g, bedIdx);
      return j;
    }
  }

  // 4. 무장: 빈손이면 떨어진 소총을 줍는다
  if (!p.weapon) {
    const m3 = g.map;
    const rifleIdx = bfsNearest(m3, p.tileX, p.tileY, (i) => {
      const s = m3.items.get(i);
      return !!s && s.type === 'rifle' && !g.reserved.has(i) && m3.walkableIdx(i);
    });
    if (rifleIdx !== null) {
      const j = new EquipJob(rifleIdx);
      j.reserve(g, rifleIdx);
      return j;
    }
  }

  // 5. 우선순위 표: 숫자 낮은 것부터, 같은 숫자면 WORK_TYPES 순서대로
  for (let pr = 1; pr <= 4; pr++) {
    for (const wt of WORK_TYPES) {
      if (p.priorities[wt] !== pr) continue;
      const j = WORK_MAKERS[wt](p, g);
      if (j) return j;
    }
  }

  // 6. 할 일 없음: 배회
  return new WanderJob();
}

/**
 * 우클릭 직접 명령: 대상 타일에 맞는 작업을 만들어 반환.
 * 다른 정착민이 예약한 대상이면 null.
 */
export function makeForcedJob(p: Pawn, g: Game, tx: number, ty: number): Job | null {
  const m = g.map;
  const i = m.idx(tx, ty);
  if (g.reserved.has(i)) return null;

  // 나무 → 벌목 (지정 안 돼 있으면 자동 지정)
  if (m.plant[i] === Plant.Tree) {
    m.designation[i] = Designation.Chop;
    const j = new ChopJob(i);
    j.reserve(g, i);
    return j;
  }
  // 바위 → 채굴
  if (m.rock[i]) {
    m.designation[i] = Designation.Mine;
    const j = new MineJob(i);
    j.reserve(g, i);
    return j;
  }
  // 청사진 → 자재 배달 또는 건설
  const bp = m.blueprints.get(i);
  if (bp) {
    if (bp.woodHas >= bp.woodNeed) {
      const j = new ConstructJob(i);
      j.reserve(g, i);
      return j;
    }
    const src = bfsNearest(m, p.tileX, p.tileY, (k) => {
      const s = m.items.get(k);
      return !!s && s.type === 'wood' && !g.reserved.has(k) && m.walkableIdx(k);
    });
    if (src !== null) {
      const j = new DeliverJob(src, i);
      j.reserve(g, src);
      j.reserve(g, i);
      return j;
    }
    return null;
  }
  // 다 자란 작물 → 수확
  if (m.plant[i] === Plant.Crop && m.growth[i] >= 1 && m.walkableIdx(i)) {
    const j = new HarvestJob(i);
    j.reserve(g, i);
    return j;
  }
  // 비축구역 밖 아이템 → 운반
  if (m.items.has(i) && !m.stockpile[i] && m.walkableIdx(i)) {
    const dest = findStockpileDest(g, p.tileX, p.tileY, m.items.get(i)!.type);
    if (dest !== null) {
      const j = new HaulJob(i, dest);
      j.reserve(g, i);
      j.reserve(g, dest);
      return j;
    }
  }
  // 빈 통행 가능 타일 → 이동
  if (m.walkable(tx, ty)) return new MoveJob(tx, ty);
  return null;
}
