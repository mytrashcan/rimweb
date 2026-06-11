import { describe, it, expect } from 'vitest';
import { makeAnimal } from '../animals';
import { MEAT_PER_ANIMAL } from '../constants';
import { blankGame, run } from './helpers';

describe('사냥', () => {
  it('사냥 지정된 동물을 쏴 죽이고 고기를 얻는다', () => {
    const g = blankGame();
    const a = makeAnimal(16, 10);
    a.hunted = true;
    g.animals.push(a);
    run(g, 1);
    expect(g.pawns.some((p) => p.job?.label === '사냥 중')).toBe(true);
    run(g, 30);
    expect(g.animals.length).toBe(0);
    expect(g.map.countItems().food).toBeGreaterThanOrEqual(MEAT_PER_ANIMAL);
  });

  it('지정하지 않은 동물은 건드리지 않는다', () => {
    const g = blankGame();
    g.animals.push(makeAnimal(16, 10));
    run(g, 10);
    expect(g.animals.length).toBe(1);
    expect(g.animals[0].hp).toBe(g.animals[0].maxHp);
  });

  it('사냥 우선순위를 끄면 사냥하지 않는다', () => {
    const g = blankGame();
    const a = makeAnimal(16, 10);
    a.hunted = true;
    g.animals.push(a);
    g.pawns.forEach((p) => (p.priorities.hunt = 0));
    run(g, 10);
    expect(g.animals.length).toBe(1);
  });

  it('공격받은 동물은 정착민 반대편으로 도망친다', () => {
    const g = blankGame();
    const a = makeAnimal(16, 10);
    g.animals.push(a);
    const distBefore = Math.hypot(a.x - g.pawns[0].x, a.y - g.pawns[0].y);
    a.takeDamage(g, 5);
    expect(a.fleeTimer).toBeGreaterThan(0);
    run(g, 3);
    const distAfter = Math.hypot(a.x - g.pawns[0].x, a.y - g.pawns[0].y);
    expect(distAfter).toBeGreaterThan(distBefore);
  });
});
