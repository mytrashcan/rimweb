import {
  DAY_SECONDS, RAIDER_HP, COLONIST_HP, RANGED_RAIDER_CHANCE,
  FIRST_RAID_TIME, RAID_INTERVAL_MIN, RAID_INTERVAL_RAND,
  SEASON_DAYS, SEASONS, SEASON_GROWTH,
} from './constants';
import { GameMap, Structure } from './map';
import { Pawn } from './pawn';
import { makeAnimal } from './animals';
import {
  MAX_ANIMALS, ANIMAL_HP, MAX_COLONISTS,
  FIRST_JOIN_TIME, JOIN_INTERVAL_MIN, JOIN_INTERVAL_RAND,
  FIRE_DAMAGE_PER_SEC, FIRST_LIGHTNING_TIME, LIGHTNING_INTERVAL_MIN, LIGHTNING_INTERVAL_RAND,
  FIRST_RAIN_TIME, RAIN_INTERVAL_MIN, RAIN_INTERVAL_RAND,
  RAIN_DURATION_MIN, RAIN_DURATION_RAND, RAIN_DOUSE_RATE, RAIN_GROWTH_BONUS,
  FIRST_TRADER_TIME, TRADER_INTERVAL_MIN, TRADER_INTERVAL_RAND, TRADER_STAY,
} from './constants';
import { updateTurrets } from './combat';
import { makeTrader, TRADE_OFFERS, ITEM_LABELS } from './trader';
import type { Shot } from './combat';
import type { ItemType } from './types';

const PAWN_DEFS: [string, number][] = [
  ['도현', 0xe2b06c],
  ['서연', 0x6cb4e2],
  ['민준', 0xb287d6],
];

/** 방랑자 이름/색상 풀 (초기 3명 이후 합류 순서대로) */
const WANDERER_DEFS: [string, number][] = [
  ['하늘', 0x7dd6a0],
  ['지우', 0xd6d67d],
  ['은서', 0xd67d9c],
  ['태오', 0x7dc6d6],
  ['수아', 0xd09ce0],
  ['예린', 0x9cd07d],
];

export class Game {
  map = new GameMap();
  pawns: Pawn[] = [];
  time = DAY_SECONDS * 0.3; // 아침부터 시작
  speedIdx = 1;
  readonly speeds = [0, 1, 3, 6];
  /** 작업이 점유 중인 타일 인덱스 (이중 배정 방지) */
  reserved = new Set<number>();
  raiders: Pawn[] = [];
  animals: Pawn[] = [];
  shots: Shot[] = [];
  /** 침대 수 캐시 (기분 계산용, 틱마다 갱신) */
  bedCount = 0;
  /** 매장되지 않은 시신 수 캐시 */
  corpseCount = 0;
  private nextAnimalCheck = DAY_SECONDS;
  nextJoinTime = FIRST_JOIN_TIME * DAY_SECONDS;
  nextLightningTime = FIRST_LIGHTNING_TIME * DAY_SECONDS;
  /** 비 시작 시각 (clear일 때) 또는 비 그칠 시각 (raining일 때) */
  raining = false;
  nextWeatherTime = FIRST_RAIN_TIME * DAY_SECONDS;
  trader: Pawn | null = null;
  traderUntil = 0;
  nextTraderTime = FIRST_TRADER_TIME * DAY_SECONDS;
  messages: { text: string; until: number }[] = [];
  nextRaidTime = FIRST_RAID_TIME * DAY_SECONDS;

  constructor() {
    this.map.generate();
    const cx = this.map.w >> 1;
    const cy = this.map.h >> 1;
    PAWN_DEFS.forEach(([name, color], i) => {
      this.pawns.push(new Pawn(cx - 1 + i, cy - 1, name, color));
    });
    // 초기 야생동물
    for (let n = 0; n < MAX_ANIMALS; n++) {
      for (let tries = 0; tries < 50; tries++) {
        const x = (Math.random() * this.map.w) | 0;
        const y = (Math.random() * this.map.h) | 0;
        if (this.map.walkable(x, y) && Math.hypot(x - cx, y - cy) > 10) {
          this.animals.push(makeAnimal(x, y));
          break;
        }
      }
    }
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
      this.map.update(dt, this.growthMult);
      let beds = 0;
      const turrets: number[] = [];
      for (let i = 0; i < this.map.structure.length; i++) {
        if (this.map.structure[i] === Structure.Bed) beds++;
        else if (this.map.structure[i] === Structure.Turret) turrets.push(i);
      }
      this.bedCount = beds;
      if (turrets.length > 0 && this.raiders.length > 0) updateTurrets(this, turrets, dt);
      let corpses = 0;
      for (const s of this.map.items.values()) {
        if (s.type === 'corpse') corpses += s.count;
      }
      this.corpseCount = corpses;
      for (const p of this.pawns) p.update(this, dt);
      if (this.pawns.some((p) => p.dead)) {
        this.pawns = this.pawns.filter((p) => !p.dead);
      }
      for (const r of this.raiders) r.update(this, dt);
      if (this.raiders.some((r) => r.dead)) {
        this.raiders = this.raiders.filter((r) => !r.dead);
        if (this.raiders.length === 0) this.addMessage('습격을 격퇴했다! 🎉');
      }
      for (const a of this.animals) a.update(this, dt);
      this.animals = this.animals.filter((a) => !a.dead);
      // 하루에 한 번, 야생동물이 줄었으면 가장자리에서 보충
      if (this.time >= this.nextAnimalCheck) {
        this.nextAnimalCheck = this.time + DAY_SECONDS;
        if (this.animals.length < MAX_ANIMALS) {
          const spot = this.findEdgeTile();
          if (spot) this.animals.push(makeAnimal(spot.x, spot.y));
        }
      }
      if (this.time >= this.nextRaidTime) this.spawnRaid();
      if (this.time >= this.nextJoinTime) this.tryJoinWanderer();
      if (this.time >= this.nextLightningTime) this.strikeLightning();
      // 상인 캐러밴
      if (this.trader) {
        this.trader.update(this, dt);
        if (this.trader.dead) {
          this.trader = null;
          this.addMessage('상인이 떠났다.');
        }
      } else if (this.time >= this.nextTraderTime) {
        this.spawnTrader();
      }
      // 날씨 전환
      if (this.time >= this.nextWeatherTime) {
        this.raining = !this.raining;
        if (this.raining) {
          this.nextWeatherTime = this.time + (RAIN_DURATION_MIN + Math.random() * RAIN_DURATION_RAND) * DAY_SECONDS;
          this.addMessage(this.isWinter ? '🌨 눈이 내리기 시작했다.' : '🌧 비가 내리기 시작했다.');
        } else {
          this.nextWeatherTime = this.time + (RAIN_INTERVAL_MIN + Math.random() * RAIN_INTERVAL_RAND) * DAY_SECONDS;
        }
      }
      // 비는 불을 끈다
      if (this.raining) {
        for (let i = 0; i < this.map.fire.length; i++) {
          if (this.map.fire[i] > 0) {
            this.map.fire[i] = Math.max(0, this.map.fire[i] - RAIN_DOUSE_RATE * dt);
          }
        }
      }
      // 화재: 확산 + 불 위에 서 있는 모든 생명체 피해
      if (this.map.updateFire(dt)) {
        for (const e of [...this.pawns, ...this.raiders, ...this.animals]) {
          if (e.downed || e.dead) continue;
          if (this.map.fire[this.map.idx(e.tileX, e.tileY)] > 0.4) {
            e.takeDamage(this, FIRE_DAMAGE_PER_SEC * dt);
          }
        }
      }
      for (const s of this.shots) s.ttl -= dt;
      this.shots = this.shots.filter((s) => s.ttl > 0);
    }
  }

  addMessage(text: string) {
    this.messages.push({ text, until: this.time + 14 });
    if (this.messages.length > 6) this.messages.shift();
  }

  /** 맵 가장자리의 무작위 통행 가능 타일 */
  private findEdgeTile(): { x: number; y: number } | null {
    const m = this.map;
    for (let tries = 0; tries < 300; tries++) {
      const side = (Math.random() * 4) | 0;
      const x = side < 2 ? (side === 0 ? 1 : m.w - 2) : 1 + ((Math.random() * (m.w - 2)) | 0);
      const y = side < 2 ? 1 + ((Math.random() * (m.h - 2)) | 0) : (side === 2 ? 1 : m.h - 2);
      if (m.walkable(x, y)) return { x, y };
    }
    return null;
  }

  spawnTrader() {
    this.nextTraderTime =
      this.time + (TRADER_INTERVAL_MIN + Math.random() * TRADER_INTERVAL_RAND) * DAY_SECONDS;
    const spot = this.findEdgeTile();
    if (!spot) return;
    this.trader = makeTrader(spot.x, spot.y);
    this.traderUntil = this.time + TRADER_STAY * DAY_SECONDS;
    this.addMessage('🛒 상인 캐러밴이 도착했다! 거래해 보자.');
  }

  /** 물물교환 실행. 자원이 부족하면 false. */
  trade(offerIdx: number): boolean {
    const offer = TRADE_OFFERS[offerIdx];
    if (!this.trader || !offer) return false;
    const [giveType, giveCount] = offer.give;
    const [getType, getCount] = offer.get;
    if (!this.map.takeResource(giveType, giveCount)) return false;
    this.map.dropItem(this.map.idx(this.trader.tileX, this.trader.tileY), getType, getCount);
    this.addMessage(
      `🤝 ${ITEM_LABELS[giveType]} ${giveCount} → ${ITEM_LABELS[getType]} ${getCount} 거래 완료`,
    );
    return true;
  }

  /** 번개 이벤트: 가연물에 떨어지면 화재 발생 */
  strikeLightning() {
    this.nextLightningTime =
      this.time + (LIGHTNING_INTERVAL_MIN + Math.random() * LIGHTNING_INTERVAL_RAND) * DAY_SECONDS;
    const m = this.map;
    for (let tries = 0; tries < 30; tries++) {
      const i = (Math.random() * m.fire.length) | 0;
      if (m.flammable(i) && m.fire[i] <= 0) {
        m.fire[i] = 0.3;
        this.addMessage('⚡ 번개가 떨어져 불이 붙었다!');
        return;
      }
    }
    // 가연물에 안 맞음: 마른 번개
  }

  /** 방랑자 합류 이벤트: 가장자리에서 새 정착민이 걸어 들어온다 */
  tryJoinWanderer() {
    this.nextJoinTime = this.time + (JOIN_INTERVAL_MIN + Math.random() * JOIN_INTERVAL_RAND) * DAY_SECONDS;
    if (this.pawns.length >= MAX_COLONISTS) return;
    const spot = this.findEdgeTile();
    if (!spot) return;
    // 아직 안 쓴 이름 고르기
    const used = new Set(this.pawns.map((p) => p.name));
    const def = WANDERER_DEFS.find(([name]) => !used.has(name)) ?? WANDERER_DEFS[0];
    const p = new Pawn(spot.x, spot.y, def[0], def[1]);
    p.hunger = 0.5;
    p.rest = 0.6;
    this.pawns.push(p);
    this.addMessage(`🎒 방랑자 ${p.name}이(가) 콜로니에 합류했다!`);
  }

  spawnRaid(count?: number) {
    const n = count ?? Math.min(5, 1 + Math.floor(this.day / 2));
    const m = this.map;
    const spot = this.findEdgeTile();
    if (!spot) return; // 스폰 불가 (사실상 없음)
    const sx = spot.x;
    const sy = spot.y;
    let spawned = 0;
    for (let dy = -2; dy <= 2 && spawned < n; dy++) {
      for (let dx = -2; dx <= 2 && spawned < n; dx++) {
        if (!m.walkable(sx + dx, sy + dy)) continue;
        const r = new Pawn(sx + dx, sy + dy, '약탈자', 0xd64541, 'raider');
        r.hp = r.maxHp = RAIDER_HP;
        r.isRanged = Math.random() < RANGED_RAIDER_CHANCE;
        this.raiders.push(r);
        spawned++;
      }
    }
    this.addMessage(`⚔ 습격! 약탈자 ${spawned}명이 나타났다!`);
    this.nextRaidTime = this.time + (RAID_INTERVAL_MIN + Math.random() * RAID_INTERVAL_RAND) * DAY_SECONDS;
  }

  /** 0~1, 0이 자정 */
  get timeOfDay(): number {
    return (this.time % DAY_SECONDS) / DAY_SECONDS;
  }
  get day(): number {
    return Math.floor(this.time / DAY_SECONDS) + 1;
  }
  get seasonIdx(): number {
    return Math.floor((this.day - 1) / SEASON_DAYS) % SEASONS.length;
  }
  get seasonName(): string {
    return SEASONS[this.seasonIdx];
  }
  get isWinter(): boolean {
    return this.seasonIdx === 3;
  }
  get growthMult(): number {
    return SEASON_GROWTH[this.seasonIdx] * (this.raining ? RAIN_GROWTH_BONUS : 1);
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
          priorities: p.priorities,
          hp: p.hp, downed: p.downed, downTimer: p.downTimer, drafted: p.drafted,
          mood: p.mood, weapon: p.weapon, griefTimer: p.griefTimer,
        })),
        raiders: this.raiders.map((r) => ({ x: r.x, y: r.y, hp: r.hp, ranged: r.isRanged })),
        animals: this.animals.map((a) => ({ x: a.x, y: a.y, hp: a.hp, hunted: a.hunted })),
        nextRaidTime: this.nextRaidTime,
        nextJoinTime: this.nextJoinTime,
        raining: this.raining,
        nextWeatherTime: this.nextWeatherTime,
        trader: this.trader ? { x: this.trader.x, y: this.trader.y } : null,
        traderUntil: this.traderUntil,
        nextTraderTime: this.nextTraderTime,
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
      // 정착민 수가 달라질 수 있으므로 배열을 통째로 재구성
      interface SavedPawn {
        x: number; y: number; name: string; color: number;
        hunger: number; rest: number; carrying: Pawn['carrying'];
        priorities?: Pawn['priorities']; hp?: number; downed?: boolean;
        downTimer?: number; drafted?: boolean; mood?: number;
        weapon?: Pawn['weapon']; griefTimer?: number;
      }
      this.pawns = (data.pawns as SavedPawn[]).map((s) => {
        const p = new Pawn(s.x - 0.5, s.y - 0.5, s.name, s.color);
        p.hunger = s.hunger;
        p.rest = s.rest;
        p.carrying = s.carrying;
        if (s.priorities) p.priorities = { ...p.priorities, ...s.priorities };
        p.hp = s.hp ?? COLONIST_HP;
        p.downed = s.downed ?? false;
        p.downTimer = s.downTimer ?? 0;
        p.drafted = s.drafted ?? false;
        p.mood = s.mood ?? 0.65;
        p.weapon = s.weapon ?? null;
        p.griefTimer = s.griefTimer ?? 0;
        return p;
      });
      this.raiders = (data.raiders ?? []).map((s: { x: number; y: number; hp: number; ranged?: boolean }) => {
        const r = new Pawn(s.x - 0.5, s.y - 0.5, '약탈자', 0xd64541, 'raider');
        r.hp = s.hp;
        r.maxHp = RAIDER_HP;
        r.isRanged = s.ranged ?? false;
        return r;
      });
      this.animals = (data.animals ?? []).map((s: { x: number; y: number; hp: number; hunted?: boolean }) => {
        const a = makeAnimal(s.x - 0.5, s.y - 0.5);
        a.hp = Math.min(s.hp, ANIMAL_HP);
        a.hunted = s.hunted ?? false;
        return a;
      });
      this.nextRaidTime = data.nextRaidTime ?? this.time + FIRST_RAID_TIME * DAY_SECONDS;
      this.nextJoinTime = data.nextJoinTime ?? this.time + FIRST_JOIN_TIME * DAY_SECONDS;
      this.raining = data.raining ?? false;
      this.nextWeatherTime = data.nextWeatherTime ?? this.time + FIRST_RAIN_TIME * DAY_SECONDS;
      this.trader = data.trader ? makeTrader(data.trader.x - 0.5, data.trader.y - 0.5) : null;
      this.traderUntil = data.traderUntil ?? 0;
      this.nextTraderTime = data.nextTraderTime ?? this.time + FIRST_TRADER_TIME * DAY_SECONDS;
      this.shots = [];
      this.messages = [];
      return true;
    } catch {
      return false;
    }
  }
}
