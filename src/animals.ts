import { ANIMAL_HP } from './constants';
import { Pawn } from './pawn';
import type { Game } from './game';

export function makeAnimal(x: number, y: number): Pawn {
  const a = new Pawn(x, y, '사슴', 0xa8845c, 'animal');
  a.hp = a.maxHp = ANIMAL_HP;
  return a;
}

/** 야생동물: 한가로이 배회하다가 공격받으면 정착민 반대편으로 도망친다 */
export function updateAnimal(a: Pawn, g: Game, dt: number) {
  a.fleeTimer = Math.max(0, a.fleeTimer - dt);

  if (a.fleeTimer > 0) {
    let nearest: Pawn | null = null;
    let best = Infinity;
    for (const p of g.pawns) {
      const d = Math.hypot(p.x - a.x, p.y - a.y);
      if (d < best) { best = d; nearest = p; }
    }
    if (nearest) {
      const dx = a.x - nearest.x;
      const dy = a.y - nearest.y;
      const len = Math.hypot(dx, dy) || 1;
      // 반대 방향 6타일 지점 근처에서 갈 수 있는 칸을 찾는다
      for (let tries = 0; tries < 6; tries++) {
        const tx = Math.round(a.x + (dx / len) * 6 + (Math.random() * 5 - 2.5));
        const ty = Math.round(a.y + (dy / len) * 6 + (Math.random() * 5 - 2.5));
        if (g.map.walkable(tx, ty)) {
          a.goTo(g, dt, tx, ty);
          return;
        }
      }
    }
    return;
  }

  // 배회
  if (a.wanderWait > 0) {
    a.wanderWait -= dt;
    return;
  }
  if (!a.wanderTarget) {
    for (let tries = 0; tries < 8; tries++) {
      const tx = a.tileX + ((Math.random() * 11) | 0) - 5;
      const ty = a.tileY + ((Math.random() * 11) | 0) - 5;
      if (g.map.walkable(tx, ty)) {
        a.wanderTarget = { x: tx, y: ty };
        break;
      }
    }
    if (!a.wanderTarget) {
      a.wanderWait = 2;
      return;
    }
  }
  if (a.goTo(g, dt, a.wanderTarget.x, a.wanderTarget.y) !== 'moving') {
    a.wanderTarget = null;
    a.wanderWait = 2 + Math.random() * 4;
  }
}
