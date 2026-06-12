import { describe, it, expect } from 'vitest';
import { Structure } from '../types';
import { blankGame } from './helpers';
import type { Game } from '../game';

/** (x0,y0)~(x1,y1) 테두리에 벽을 두른다 */
function wallRing(g: Game, x0: number, y0: number, x1: number, y1: number) {
  const m = g.map;
  for (let x = x0; x <= x1; x++) {
    for (const y of [y0, y1]) { m.structure[m.idx(x, y)] = Structure.Wall; m.structureHp[m.idx(x, y)] = 100; }
  }
  for (let y = y0; y <= y1; y++) {
    for (const x of [x0, x1]) { m.structure[m.idx(x, y)] = Structure.Wall; m.structureHp[m.idx(x, y)] = 100; }
  }
  m.recomputeIndoor();
}

describe('구역(실내) 인식', () => {
  it('벽으로 완전히 둘러싸인 영역은 실내가 된다', () => {
    const g = blankGame();
    const m = g.map;
    wallRing(g, 20, 20, 26, 26);
    expect(m.indoor[m.idx(23, 23)]).toBe(1); // 안쪽
    expect(m.indoor[m.idx(18, 23)]).toBe(0); // 바깥
    expect(m.indoor[m.idx(20, 23)]).toBe(0); // 벽 자체는 실내가 아님
  });

  it('벽에 구멍이 나면 실내가 풀린다', () => {
    const g = blankGame();
    const m = g.map;
    wallRing(g, 20, 20, 26, 26);
    expect(m.indoor[m.idx(23, 23)]).toBe(1);
    m.damageWall(m.idx(23, 20), 999); // 위쪽 벽 파괴
    expect(m.indoor[m.idx(23, 23)]).toBe(0);
  });

  it('실내에서는 비에 젖지 않고 아늑함 보너스를 받는다', () => {
    const g = blankGame();
    wallRing(g, 8, 8, 14, 12); // 정착민들(10~12,10)을 둘러싼 방
    g.raining = true;
    const inside = g.pawns[0].moodFactors(g);
    expect(inside.some((f) => f.label === '아늑한 실내')).toBe(true);
    expect(inside.some((f) => f.label.includes('젖음'))).toBe(false);
    // 바깥 정착민은 젖는다
    g.pawns[2].x = 30.5;
    g.pawns[2].y = 30.5;
    const outside = g.pawns[2].moodFactors(g);
    expect(outside.some((f) => f.label.includes('젖음'))).toBe(true);
    expect(outside.some((f) => f.label === '아늑한 실내')).toBe(false);
  });

  it('맵 가장자리에 붙은 영역은 벽이 있어도 실내가 아니다', () => {
    const g = blankGame();
    const m = g.map;
    // 가장자리(0행)를 한 변으로 쓰는 ㄷ자 — 천장이 뚫린 셈
    for (let x = 5; x <= 9; x++) { m.structure[m.idx(x, 4)] = Structure.Wall; }
    for (let y = 0; y <= 4; y++) {
      m.structure[m.idx(5, y)] = Structure.Wall;
      m.structure[m.idx(9, y)] = Structure.Wall;
    }
    m.recomputeIndoor();
    expect(m.indoor[m.idx(7, 2)]).toBe(0);
  });
});
