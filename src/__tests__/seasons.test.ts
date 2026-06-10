import { describe, it, expect } from 'vitest';
import { DAY_SECONDS, SEASON_DAYS } from '../constants';
import { Plant } from '../types';
import { blankGame, run } from './helpers';

describe('계절', () => {
  it('3일마다 계절이 바뀌고 4계절이 순환한다', () => {
    const g = blankGame();
    g.time = DAY_SECONDS * 0.5; // 1일차
    expect(g.seasonName).toContain('봄');
    g.time = DAY_SECONDS * (SEASON_DAYS + 0.5); // 4일차
    expect(g.seasonName).toContain('여름');
    g.time = DAY_SECONDS * (SEASON_DAYS * 3 + 0.5); // 10일차
    expect(g.seasonName).toContain('겨울');
    expect(g.isWinter).toBe(true);
    g.time = DAY_SECONDS * (SEASON_DAYS * 4 + 0.5); // 13일차 → 다시 봄
    expect(g.seasonName).toContain('봄');
  });

  it('겨울에는 작물이 자라지 않는다', () => {
    const g = blankGame();
    const m = g.map;
    const i = m.idx(20, 20);
    m.plant[i] = Plant.Crop;
    m.growth[i] = 0.5;
    g.pawns.forEach((p) => (p.priorities.grow = 0)); // 수확/파종 개입 방지

    g.time = DAY_SECONDS * (SEASON_DAYS * 3 + 0.5); // 겨울
    run(g, 30);
    expect(m.growth[i]).toBe(0.5);

    g.time = DAY_SECONDS * 0.5; // 봄
    run(g, 30);
    expect(m.growth[i]).toBeGreaterThan(0.5);
  });
});
