import { describe, it, expect } from 'vitest';
import { Plant } from '../types';
import { blankGame, run } from './helpers';

describe('날씨', () => {
  it('때가 되면 비가 내리기 시작하고, 시간이 지나면 그친다', () => {
    const g = blankGame();
    g.nextWeatherTime = g.time; // 즉시 전환
    g.update(0.1);
    expect(g.raining).toBe(true);
    expect(g.messages.some((m) => m.text.includes('비'))).toBe(true);
    g.nextWeatherTime = g.time;
    g.update(0.1);
    expect(g.raining).toBe(false);
  });

  it('비는 불을 끈다', () => {
    const g = blankGame();
    const m = g.map;
    // 정착민 봉인 (진압 개입 방지)
    for (let x = 8; x <= 14; x++) for (const y of [8, 12]) m.rock[m.idx(x, y)] = 1;
    for (let y = 8; y <= 12; y++) for (const x of [8, 14]) m.rock[m.idx(x, y)] = 1;
    const i = m.idx(40, 40);
    m.plant[i] = Plant.Tree;
    m.fire[i] = 0.6;
    g.raining = true;
    g.nextWeatherTime = Infinity;
    run(g, 20);
    expect(m.fire[i]).toBe(0); // 꺼짐
    expect(m.plant[i]).toBe(Plant.Tree); // 다 타기 전에 진화됨
  });

  it('비가 오면 작물이 더 빨리 자란다', () => {
    const measure = (raining: boolean) => {
      const g = blankGame();
      const m = g.map;
      g.pawns.forEach((p) => (p.priorities.grow = 0));
      g.raining = raining;
      g.nextWeatherTime = Infinity;
      const i = m.idx(20, 20);
      m.plant[i] = Plant.Crop;
      m.growth[i] = 0;
      run(g, 30);
      return m.growth[i];
    };
    expect(measure(true)).toBeGreaterThan(measure(false));
  });

  it('비에 젖으면 기분 요인이 생긴다', () => {
    const g = blankGame();
    g.raining = true;
    expect(g.pawns[0].moodFactors(g).some((f) => f.label.includes('젖음'))).toBe(true);
  });
});
