import { describe, it, expect } from 'vitest';
import { Structure } from '../types';
import { DOWNED_RECOVER_SECONDS } from '../constants';
import { blankGame, run } from './helpers';

describe('구조와 침대 요양', () => {
  it('침대 위에서는 3배 빨리 회복한다', () => {
    const g = blankGame();
    const m = g.map;
    const bed = m.idx(11, 10);
    m.structure[bed] = Structure.Bed;
    const p = g.pawns[1]; // (11,10)에 서 있음 → 침대 위
    p.takeDamage(g, 9999);
    run(g, DOWNED_RECOVER_SECONDS / 3 + 5);
    expect(p.downed).toBe(false);
  });

  it('바닥에서는 정상 속도로 회복한다 (대조군)', () => {
    const g = blankGame();
    const p = g.pawns[1];
    p.takeDamage(g, 9999);
    p.beingRescued = true; // 동료가 옮기지 못하게 고정
    run(g, DOWNED_RECOVER_SECONDS / 3 + 5);
    expect(p.downed).toBe(true); // 아직 회복 전
  });

  it('동료가 쓰러지면 침대로 업어 나른다', () => {
    const g = blankGame();
    const m = g.map;
    const bed = m.idx(20, 10);
    m.structure[bed] = Structure.Bed;
    const victim = g.pawns[1];
    victim.takeDamage(g, 9999);
    expect(victim.downed).toBe(true);
    run(g, 12);
    expect([victim.tileX, victim.tileY]).toEqual([20, 10]); // 침대에 눕힘
    run(g, DOWNED_RECOVER_SECONDS / 3 + 10);
    expect(victim.downed).toBe(false); // 요양으로 회복
  });

  it('침대가 없으면 구조 대신 다른 일을 한다', () => {
    const g = blankGame();
    const m = g.map;
    const i = m.idx(15, 10);
    m.plant[i] = 1; // 나무
    m.designation[i] = 1; // 벌목 지정
    g.pawns[1].takeDamage(g, 9999);
    run(g, 1);
    // 침대가 없으므로 구조 작업이 생기지 않고 벌목을 진행
    expect(g.pawns.some((p) => p.job?.label === '벌목 중')).toBe(true);
  });
});
