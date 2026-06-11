import {
  PAWN_SPEED, HUNGER_SECONDS, REST_SECONDS,
  COLONIST_HP, HP_REGEN, DOWNED_RECOVER_SECONDS,
  MOOD_BASE, MOOD_LERP_SECONDS, MOOD_BREAK_THRESHOLD, MOOD_BREAK_DELAY,
} from './constants';
import { findPath } from './astar';
import { Structure } from './map';
import type { ItemStack, WorkType } from './types';
import { defaultPriorities } from './types';
import type { Game } from './game';
import type { Job } from './jobs';
import { findJob, BreakJob } from './jobs';
import { updateColonistCombat, updateRaider } from './combat';
import { updateAnimal } from './animals';
import {
  MEAT_PER_ANIMAL, ANIMAL_FLEE_SECONDS, RIFLE_DROP_CHANCE, RAIN_SPEED_MULT,
  DEATH_CHANCE_ON_DOWN, GRIEF_SECONDS,
} from './constants';

export interface MoodFactor {
  label: string;
  value: number;
}

export type MoveResult = 'arrived' | 'moving' | 'blocked';
export type Faction = 'colonist' | 'raider' | 'animal';

export class Pawn {
  x: number; // 타일 단위 좌표 (칸 중심 = x.5)
  y: number;
  name: string;
  color: number;
  faction: Faction;
  hunger = 0.75 + Math.random() * 0.2;
  rest = 0.75 + Math.random() * 0.2;
  carrying: ItemStack | null = null;
  job: Job | null = null;
  sleeping = false;
  /** 작업 종류별 우선순위: 1(높음)~4(낮음), 0 = 안 함 */
  priorities: Record<WorkType, number> = defaultPriorities();

  // 기분
  mood = MOOD_BASE;
  private lowMoodTime = 0;
  /** 최근 식사 품질: +1 요리, -1 생식, 0 없음 */
  mealMood = 0;
  mealMoodTimer = 0;
  /** 장착 무기 (정착민 전용) */
  weapon: 'rifle' | null = null;
  /** '동료의 죽음' 애도 타이머 */
  griefTimer = 0;

  // 전투
  hp = COLONIST_HP;
  maxHp = COLONIST_HP;
  downed = false;
  downTimer = 0;
  beingRescued = false;
  drafted = false;
  draftDest: { x: number; y: number } | null = null;
  attackCd = 0;
  dead = false; // 약탈자/동물 전용: 사망/이탈 → 다음 틱에 제거
  isRanged = false; // 약탈자 전용: 원거리 무장
  bashIdx: number | null = null; // 약탈자가 부수는 중인 벽
  repathCd = 0;

  // 동물 전용
  hunted = false; // 사냥 지정됨
  targeted = false; // 사냥꾼이 이미 붙음 (이중 배정 방지)
  fleeTimer = 0;
  wanderTarget: { x: number; y: number } | null = null;
  wanderWait = 0;

  private path: { x: number; y: number }[] | null = null;
  private pathGoal = '';

  constructor(x: number, y: number, name: string, color: number, faction: Faction = 'colonist') {
    this.x = x + 0.5;
    this.y = y + 0.5;
    this.name = name;
    this.color = color;
    this.faction = faction;
  }

  get tileX() { return Math.floor(this.x); }
  get tileY() { return Math.floor(this.y); }

  update(g: Game, dt: number) {
    // 쓰러진 상태: 시간이 지나면 회복해서 일어남 (침대 위에서는 3배 빠르게)
    if (this.downed) {
      const onBed = g.map.structure[g.map.idx(this.tileX, this.tileY)] === Structure.Bed;
      this.downTimer -= dt * (onBed ? 3 : 1);
      if (this.downTimer <= 0) {
        this.downed = false;
        this.hp = this.maxHp * 0.4;
        if (this.faction === 'colonist') g.addMessage(`${this.name}이(가) 다시 일어났다.`);
      }
      return;
    }

    this.attackCd = Math.max(0, this.attackCd - dt);

    if (this.faction === 'raider') {
      updateRaider(this, g, dt);
      return;
    }
    if (this.faction === 'animal') {
      updateAnimal(this, g, dt);
      return;
    }

    // ---- 정착민 ----
    this.hunger = Math.max(0, this.hunger - dt / HUNGER_SECONDS);
    if (!this.sleeping) this.rest = Math.max(0, this.rest - dt / REST_SECONDS);
    if (this.hp < this.maxHp && this.hunger > 0.2) {
      this.hp = Math.min(this.maxHp, this.hp + HP_REGEN * (this.sleeping ? 3 : 1) * dt);
    }

    this.mealMoodTimer = Math.max(0, this.mealMoodTimer - dt);
    this.griefTimer = Math.max(0, this.griefTimer - dt);

    // 기분: 현재 상황이 만드는 목표치로 서서히 수렴
    const target = this.moodTarget(g);
    this.mood += (target - this.mood) * Math.min(1, dt / MOOD_LERP_SECONDS);
    if (this.mood < MOOD_BREAK_THRESHOLD) this.lowMoodTime += dt;
    else this.lowMoodTime = 0;
    if (this.lowMoodTime >= MOOD_BREAK_DELAY && !(this.job && this.job.uninterruptible)) {
      if (this.job) this.job.cleanup(g);
      this.sleeping = false;
      this.drafted = false;
      this.draftDest = null;
      this.stopMoving();
      this.job = new BreakJob();
      this.lowMoodTime = 0;
      g.addMessage(`🤯 ${this.name}이(가) 정신적 한계에 도달했다!`);
    }

    updateColonistCombat(this, g); // 사거리 내 약탈자 자동 사격

    if (this.drafted && !(this.job && this.job.uninterruptible)) {
      // 징집 중에는 일하지 않고 이동 명령만 따른다
      if (this.job) {
        this.job.cleanup(g);
        this.job = null;
        this.sleeping = false;
      }
      if (this.draftDest) {
        const r = this.goTo(g, dt, this.draftDest.x, this.draftDest.y);
        if (r !== 'moving') this.draftDest = null;
      }
      return;
    }

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

  /** 현재 상황의 기분 요인 목록 (UI 표시 겸 목표치 계산) */
  moodFactors(g: Game): MoodFactor[] {
    const f: MoodFactor[] = [];
    if (this.hunger <= 0) f.push({ label: '굶주림', value: -0.3 });
    else if (this.hunger < 0.3) f.push({ label: '배고픔', value: -0.12 });
    else if (this.hunger > 0.85) f.push({ label: '포만감', value: 0.08 });
    if (this.rest < 0.15) f.push({ label: '탈진', value: -0.15 });
    else if (this.rest < 0.35) f.push({ label: '피곤함', value: -0.08 });
    else if (this.rest > 0.85) f.push({ label: '개운함', value: 0.06 });
    if (this.hp < this.maxHp * 0.5) f.push({ label: '부상', value: -0.12 });
    if (this.mealMoodTimer > 0) {
      if (this.mealMood > 0) f.push({ label: '따뜻한 식사', value: 0.06 });
      else if (this.mealMood < 0) f.push({ label: '생식', value: -0.05 });
    }
    if (g.bedCount < g.pawns.length) f.push({ label: '침대 부족', value: -0.08 });
    if (g.raiders.length > 0) f.push({ label: '습격 공포', value: -0.1 });
    if (g.raining) f.push({ label: g.isWinter ? '눈에 젖음' : '비에 젖음', value: -0.04 });
    if (this.griefTimer > 0) f.push({ label: '동료의 죽음', value: -0.12 });
    if (g.corpseCount > 0) f.push({ label: '방치된 시신', value: -0.06 });
    return f;
  }

  moodTarget(g: Game): number {
    const sum = this.moodFactors(g).reduce((a, x) => a + x.value, 0);
    return Math.max(0.05, Math.min(0.95, MOOD_BASE + sum));
  }

  takeDamage(g: Game, dmg: number) {
    this.hp -= dmg;
    // 자다가 맞으면 깬다
    if (this.sleeping && this.job) {
      this.job.cleanup(g);
      this.job = null;
      this.sleeping = false;
    }
    if (this.hp > 0) {
      if (this.faction === 'animal') this.fleeTimer = ANIMAL_FLEE_SECONDS; // 놀라서 도망
      return;
    }
    this.hp = 0;
    if (this.faction === 'raider') {
      this.dead = true;
      if (this.isRanged && Math.random() < RIFLE_DROP_CHANCE) {
        g.map.dropItem(g.map.idx(this.tileX, this.tileY), 'rifle', 1); // 전리품
      }
      return;
    }
    if (this.faction === 'animal') {
      this.dead = true;
      g.map.dropItem(g.map.idx(this.tileX, this.tileY), 'food', MEAT_PER_ANIMAL); // 고기
      return;
    }
    // 정착민: 운이 나쁘면 사망, 아니면 쓰러진다
    if (Math.random() < DEATH_CHANCE_ON_DOWN) {
      this.die(g);
      return;
    }
    this.downed = true;
    this.downTimer = DOWNED_RECOVER_SECONDS;
    if (this.job) {
      this.job.cleanup(g);
      this.job = null;
    }
    this.sleeping = false;
    this.drafted = false;
    this.draftDest = null;
    this.stopMoving();
    if (this.carrying) {
      g.map.dropItem(g.map.idx(this.tileX, this.tileY), this.carrying.type, this.carrying.count);
      this.carrying = null;
    }
    g.addMessage(`⚠ ${this.name}이(가) 쓰러졌다!`);
  }

  get speed(): number {
    let s = PAWN_SPEED;
    if (this.faction === 'raider') s *= 0.85;
    if (this.faction === 'animal') s *= this.fleeTimer > 0 ? 1.3 : 0.55;
    if (this.carrying) s *= 0.85;
    if (this.faction === 'colonist' && this.hunger <= 0) s *= 0.5; // 굶주림 페널티
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
    const step = this.speed * (g.raining ? RAIN_SPEED_MULT : 1) * dt;
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

  /** 정착민 사망: 시신과 소지품을 남기고 콜로니 전체가 애도한다 */
  die(g: Game) {
    this.dead = true;
    if (this.job) {
      this.job.cleanup(g);
      this.job = null;
    }
    const here = g.map.idx(this.tileX, this.tileY);
    if (this.carrying) {
      g.map.dropItem(here, this.carrying.type, this.carrying.count);
      this.carrying = null;
    }
    if (this.weapon === 'rifle') g.map.dropItem(here, 'rifle', 1);
    g.map.dropItem(here, 'corpse', 1);
    for (const o of g.pawns) {
      if (o !== this && o.faction === 'colonist') o.griefTimer = GRIEF_SECONDS;
    }
    g.addMessage(`💀 ${this.name}이(가) 사망했다...`);
  }

  /** 진행 중인 작업을 버리고 새 작업을 강제 할당 (우클릭 명령) */
  assignForcedJob(g: Game, job: Job) {
    if (this.job && this.job.uninterruptible) return; // 멘탈 브레이크 중에는 명령 불가
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
