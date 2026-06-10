import {
  SHOOT_RANGE, SHOOT_COOLDOWN, SHOOT_DAMAGE,
  MELEE_RANGE, MELEE_COOLDOWN, MELEE_DAMAGE,
  RAIDER_SHOOT_RANGE, RAIDER_SHOOT_COOLDOWN, RAIDER_SHOOT_DAMAGE, RAIDER_HOLD_RANGE,
} from './constants';
import { bfsNearest } from './astar';
import { Structure } from './map';
import type { Game } from './game';
import type { Pawn } from './pawn';

/** 사격 궤적 이펙트 (렌더러가 그림) */
export interface Shot {
  x0: number; y0: number;
  x1: number; y1: number;
  ttl: number;
  color: number;
}

/** 타일 단위 시야 체크: 바위/벽이 가로막으면 false */
export function hasLineOfSight(g: Game, x0: number, y0: number, x1: number, y1: number): boolean {
  const m = g.map;
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const x = Math.floor(x0 + (x1 - x0) * t);
    const y = Math.floor(y0 + (y1 - y0) * t);
    if (!m.inBounds(x, y)) return false;
    const i = m.idx(x, y);
    if (m.rock[i] || m.structure[i] === Structure.Wall) return false;
  }
  return true;
}

/** 정착민: 사거리 + 시야 내 가장 가까운 약탈자를 자동 사격 */
export function updateColonistCombat(p: Pawn, g: Game) {
  if (p.sleeping || p.attackCd > 0) return;
  let best: Pawn | null = null;
  let bestD = SHOOT_RANGE;
  for (const r of g.raiders) {
    if (r.dead || r.downed) continue;
    const d = Math.hypot(r.x - p.x, r.y - p.y);
    if (d < bestD && hasLineOfSight(g, p.x, p.y, r.x, r.y)) {
      best = r;
      bestD = d;
    }
  }
  if (!best) return;
  p.attackCd = SHOOT_COOLDOWN;
  g.shots.push({ x0: p.x, y0: p.y, x1: best.x, y1: best.y, ttl: 0.15, color: 0xffe08a });
  best.takeDamage(g, SHOOT_DAMAGE * (0.7 + Math.random() * 0.6));
}

/** 약탈자: 가장 가까운 정착민에게 근접 공격, 막히면 벽을 부순다 */
export function updateRaider(r: Pawn, g: Game, dt: number) {
  const m = g.map;
  r.repathCd = Math.max(0, r.repathCd - dt);

  let target: Pawn | null = null;
  let bestD = Infinity;
  for (const p of g.pawns) {
    if (p.downed) continue;
    const d = Math.hypot(p.x - r.x, p.y - r.y);
    if (d < bestD) {
      target = p;
      bestD = d;
    }
  }

  // 모든 정착민이 쓰러짐: 맵 가장자리로 떠난다
  if (!target) {
    const ex = r.tileX < m.w / 2 ? 0 : m.w - 1;
    const res = r.goTo(g, dt, ex, r.tileY);
    if (res !== 'moving') r.dead = true;
    return;
  }

  // 부수던 벽이 있으면 마저 부순다
  if (r.bashIdx !== null) {
    if (m.structure[r.bashIdx] !== Structure.Wall) {
      r.bashIdx = null; // 부서졌거나 사라짐 → 다시 추격
    } else {
      const [wx, wy] = m.xy(r.bashIdx);
      const mv = r.goTo(g, dt, wx, wy, true);
      if (mv === 'blocked') { r.bashIdx = null; return; }
      if (mv === 'arrived' && r.attackCd <= 0) {
        r.attackCd = MELEE_COOLDOWN;
        g.shots.push({ x0: r.x, y0: r.y, x1: wx + 0.5, y1: wy + 0.5, ttl: 0.12, color: 0xd64541 });
        if (m.damageWall(r.bashIdx, MELEE_DAMAGE)) {
          g.addMessage('⚠ 벽이 부서졌다!');
          r.bashIdx = null;
        }
      }
      return;
    }
  }

  // 원거리 약탈자: 사거리 + 시야가 확보되면 멈춰서 사격
  if (r.isRanged && bestD <= RAIDER_SHOOT_RANGE && hasLineOfSight(g, r.x, r.y, target.x, target.y)) {
    if (r.attackCd <= 0) {
      r.attackCd = RAIDER_SHOOT_COOLDOWN;
      g.shots.push({ x0: r.x, y0: r.y, x1: target.x, y1: target.y, ttl: 0.15, color: 0xff8a5a });
      target.takeDamage(g, RAIDER_SHOOT_DAMAGE * (0.7 + Math.random() * 0.6));
    }
    if (bestD <= RAIDER_HOLD_RANGE) {
      r.stopMoving();
      return; // 적당한 거리: 자리 지키며 사격
    }
    // 사거리 끝자락이면 쏘면서 계속 접근
  }

  if (!r.isRanged && bestD <= MELEE_RANGE) {
    if (r.attackCd <= 0) {
      r.attackCd = MELEE_COOLDOWN;
      g.shots.push({ x0: r.x, y0: r.y, x1: target.x, y1: target.y, ttl: 0.12, color: 0xd64541 });
      target.takeDamage(g, MELEE_DAMAGE * (0.7 + Math.random() * 0.6));
    }
    return;
  }

  if (r.repathCd > 0) return; // 직전에 길이 막혔으면 잠시 대기

  const res = r.goTo(g, dt, target.tileX, target.tileY, true);
  if (res === 'blocked') {
    // 정착민에게 갈 수 없음: 걸어서 닿는 가장 가까운 벽을 부수기 시작
    const wallIdx = bfsNearest(m, r.tileX, r.tileY, (i) => m.structure[i] === Structure.Wall);
    if (wallIdx !== null) r.bashIdx = wallIdx;
    else r.repathCd = 2; // 부술 벽도 없음 (바위로 막힘 등) → 잠시 후 재시도
  }
}
