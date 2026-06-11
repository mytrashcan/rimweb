import { describe, it, expect } from 'vitest';
import { Pawn } from '../pawn';
import { Structure } from '../types';
import { RAIDER_HP, WALL_HP, TURRET_RANGE } from '../constants';
import { blankGame, run } from './helpers';
import type { Game } from '../game';

function addRaider(g: Game, x: number, y: number): Pawn {
  const r = new Pawn(x, y, '약탈자', 0xd64541, 'raider');
  r.hp = r.maxHp = RAIDER_HP;
  r.repathCd = 999; // 이동 봉인
  g.raiders.push(r);
  return r;
}

function buildTurret(g: Game, x: number, y: number): number {
  const i = g.map.idx(x, y);
  g.map.structure[i] = Structure.Turret;
  g.map.structureHp[i] = WALL_HP;
  return i;
}

describe('방어 터렛', () => {
  it('사거리 내 약탈자를 자동 사격한다', () => {
    const g = blankGame();
    // 정착민들은 멀리 치워서 터렛만 쏘게 한다
    g.pawns.forEach((p, k) => { p.x = 50.5 + k; p.y = 55.5; });
    buildTurret(g, 20, 20);
    const r = addRaider(g, 20 + TURRET_RANGE - 2, 20);
    run(g, 2);
    expect(r.hp).toBeLessThan(RAIDER_HP);
  });

  it('사거리 밖이거나 벽에 가리면 쏘지 않는다', () => {
    const g = blankGame();
    g.pawns.forEach((p, k) => { p.x = 50.5 + k; p.y = 55.5; });
    buildTurret(g, 20, 20);
    const far = addRaider(g, 20 + TURRET_RANGE + 3, 20);
    const m = g.map;
    for (let y = 15; y <= 25; y++) m.structure[m.idx(23, y)] = Structure.Wall;
    const hidden = addRaider(g, 25, 20); // 벽 뒤
    run(g, 2);
    expect(far.hp).toBe(RAIDER_HP);
    expect(hidden.hp).toBe(RAIDER_HP);
  });

  it('터렛은 통행을 막고, 약탈자가 부술 수 있다', () => {
    const g = blankGame();
    const i = buildTurret(g, 20, 20);
    expect(g.map.walkable(20, 20)).toBe(false);
    expect(g.map.damageWall(i, WALL_HP + 1)).toBe(true);
    expect(g.map.structure[i]).toBe(Structure.None);
  });
});
