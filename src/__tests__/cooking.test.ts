import { describe, it, expect } from 'vitest';
import { Structure } from '../types';
import { COOK_RAW_NEEDED } from '../constants';
import { blankGame, run } from './helpers';

describe('요리', () => {
  it('화덕에서 생식량 2를 요리 1로 만든다', () => {
    const g = blankGame();
    const m = g.map;
    m.structure[m.idx(14, 10)] = Structure.Stove;
    m.dropItem(m.idx(12, 12), 'food', 4);
    run(g, 30);
    const items = m.countItems();
    expect(items.meal).toBeGreaterThanOrEqual(1);
    expect(items.food).toBeLessThan(4); // 재료 소모됨
  });

  it('화덕이 없으면 요리하지 않는다', () => {
    const g = blankGame();
    g.map.dropItem(g.map.idx(12, 12), 'food', 4);
    run(g, 15);
    expect(g.map.countItems().meal).toBe(0);
  });

  it('재료가 부족하면 요리하지 않는다', () => {
    const g = blankGame();
    const m = g.map;
    m.structure[m.idx(14, 10)] = Structure.Stove;
    m.dropItem(m.idx(12, 12), 'food', COOK_RAW_NEEDED - 1);
    run(g, 15);
    expect(m.countItems().meal).toBe(0);
  });

  it('요리를 생식량보다 먼저 먹고 기분이 좋아진다', () => {
    const g = blankGame();
    const m = g.map;
    m.dropItem(m.idx(13, 10), 'meal', 1);
    m.dropItem(m.idx(12, 10), 'food', 1);
    const p = g.pawns[0];
    p.hunger = 0.2;
    g.pawns[1].hunger = 1;
    g.pawns[2].hunger = 1;
    run(g, 10);
    const items = m.countItems();
    expect(items.meal).toBe(0); // 요리부터 먹음
    expect(p.hunger).toBeGreaterThan(0.9);
    expect(p.moodFactors(g).some((f) => f.label === '따뜻한 식사')).toBe(true);
  });

  it('생식하면 기분이 나빠진다', () => {
    const g = blankGame();
    const m = g.map;
    m.dropItem(m.idx(12, 10), 'food', 1);
    const p = g.pawns[0];
    p.hunger = 0.2;
    g.pawns[1].hunger = 1;
    g.pawns[2].hunger = 1;
    run(g, 10);
    expect(p.moodFactors(g).some((f) => f.label === '생식')).toBe(true);
  });
});
