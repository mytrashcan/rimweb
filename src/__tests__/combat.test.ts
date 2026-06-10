import { describe, it, expect } from 'vitest';
import { hasLineOfSight } from '../combat';
import { Pawn } from '../pawn';
import { Structure } from '../types';
import { RAIDER_HP, WALL_HP, DOWNED_RECOVER_SECONDS } from '../constants';
import { blankGame, run } from './helpers';
import type { Game } from '../game';

function addRaider(g: Game, x: number, y: number): Pawn {
  const r = new Pawn(x, y, '약탈자', 0xd64541, 'raider');
  r.hp = r.maxHp = RAIDER_HP;
  g.raiders.push(r);
  return r;
}

describe('시야', () => {
  it('빈 땅은 보이고 벽 뒤는 안 보인다', () => {
    const g = blankGame();
    expect(hasLineOfSight(g, 10.5, 10.5, 15.5, 10.5)).toBe(true);
    g.map.structure[g.map.idx(13, 10)] = Structure.Wall;
    expect(hasLineOfSight(g, 10.5, 10.5, 15.5, 10.5)).toBe(false);
  });
});

describe('전투', () => {
  it('정착민은 사거리 내 약탈자를 자동 사격한다', () => {
    const g = blankGame();
    const r = addRaider(g, 15, 10);
    run(g, 0.5);
    expect(r.hp).toBeLessThan(RAIDER_HP);
  });

  it('약탈자는 인접한 정착민을 근접 공격한다', () => {
    const g = blankGame();
    addRaider(g, 11, 11); // 정착민 바로 옆
    run(g, 1);
    expect(g.pawns.some((p) => p.hp < p.maxHp)).toBe(true);
  });

  it('길이 막히면 가장 가까운 벽을 부순다', () => {
    const g = blankGame();
    const m = g.map;
    // 정착민들(10~12,10)을 상자로 봉쇄
    for (let x = 8; x <= 14; x++) {
      for (const y of [8, 12]) {
        m.structure[m.idx(x, y)] = Structure.Wall;
        m.structureHp[m.idx(x, y)] = WALL_HP;
      }
    }
    for (let y = 8; y <= 12; y++) {
      for (const x of [8, 14]) {
        m.structure[m.idx(x, y)] = Structure.Wall;
        m.structureHp[m.idx(x, y)] = WALL_HP;
      }
    }
    const wallCount = () => m.structure.filter((s) => s === Structure.Wall).length;
    const before = wallCount();
    addRaider(g, 25, 10);
    run(g, 30);
    // 벽이 부서졌거나 최소한 피해를 입었다
    let minHp = Infinity;
    for (let i = 0; i < m.structure.length; i++) {
      if (m.structure[i] === Structure.Wall) minHp = Math.min(minHp, m.structureHp[i]);
    }
    expect(wallCount() < before || minHp < WALL_HP).toBe(true);
  });

  it('정착민은 체력 0에 쓰러지고 시간이 지나면 회복한다', () => {
    const g = blankGame();
    const p = g.pawns[0];
    p.takeDamage(g, 9999);
    expect(p.downed).toBe(true);
    expect(p.hp).toBe(0);
    run(g, DOWNED_RECOVER_SECONDS + 5);
    expect(p.downed).toBe(false);
    expect(p.hp).toBeGreaterThan(0);
  });

  it('약탈자는 체력 0에 사망 처리되어 제거된다', () => {
    const g = blankGame();
    const r = addRaider(g, 15, 10);
    r.takeDamage(g, 9999);
    expect(r.dead).toBe(true);
    run(g, 0.2);
    expect(g.raiders.length).toBe(0);
  });
});
