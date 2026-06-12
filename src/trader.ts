import { Pawn } from './pawn';
import type { Game } from './game';
import type { ItemType } from './types';

export function makeTrader(x: number, y: number): Pawn {
  return new Pawn(x, y, '상인', 0xd9b84a, 'trader');
}

/** 물물교환 오퍼: [내는 것, 수량] → [받는 것, 수량] */
export interface TradeOffer {
  give: [ItemType, number];
  get: [ItemType, number];
}

export const TRADE_OFFERS: TradeOffer[] = [
  { give: ['wood', 12], get: ['food', 8] },
  { give: ['stone', 10], get: ['wood', 10] },
  { give: ['food', 18], get: ['rifle', 1] },
  { give: ['meal', 5], get: ['stone', 14] },
];

export const ITEM_LABELS: Record<ItemType, string> = {
  wood: '목재',
  stone: '석재',
  food: '식량',
  meal: '요리',
  rifle: '소총',
  corpse: '시신',
};

/** 상인: 콜로니 중앙 근처로 와서 머물다가, 시간이 되면 떠난다 */
export function updateTrader(t: Pawn, g: Game, dt: number) {
  const m = g.map;
  // 떠날 시간
  if (g.time >= g.traderUntil) {
    const ex = t.tileX < m.w / 2 ? 0 : m.w - 1;
    if (t.goTo(g, dt, ex, t.tileY) !== 'moving') t.dead = true;
    return;
  }
  // 콜로니 중앙으로 접근
  const cx = m.w >> 1;
  const cy = m.h >> 1;
  if (Math.hypot(t.x - (cx + 0.5), t.y - (cy + 0.5)) > 6) {
    if (t.goTo(g, dt, cx, cy, true) === 'blocked') t.wanderWait = 2; // 못 가면 그 자리에서 대기
    return;
  }
  // 체류: 느긋하게 서성
  if (t.wanderWait > 0) {
    t.wanderWait -= dt;
    return;
  }
  if (!t.wanderTarget) {
    for (let tries = 0; tries < 8; tries++) {
      const tx = t.tileX + ((Math.random() * 7) | 0) - 3;
      const ty = t.tileY + ((Math.random() * 7) | 0) - 3;
      if (m.walkable(tx, ty)) {
        t.wanderTarget = { x: tx, y: ty };
        break;
      }
    }
    if (!t.wanderTarget) {
      t.wanderWait = 3;
      return;
    }
  }
  if (t.goTo(g, dt, t.wanderTarget.x, t.wanderTarget.y) !== 'moving') {
    t.wanderTarget = null;
    t.wanderWait = 3 + Math.random() * 5;
  }
}
