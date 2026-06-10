import { describe, it, expect, beforeAll } from 'vitest';
import { Plant } from '../types';
import { RAIDER_HP } from '../constants';
import { Pawn } from '../pawn';
import { blankGame } from './helpers';

beforeAll(() => {
  // Node 환경에는 localStorage가 없으므로 메모리 기반으로 대체
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    } as Storage,
  });
});

describe('저장/불러오기', () => {
  it('전체 상태가 라운드트립으로 복원된다', () => {
    const g = blankGame();
    const m = g.map;
    m.plant[m.idx(5, 5)] = Plant.Tree;
    m.dropItem(m.idx(7, 7), 'stone', 4);
    g.pawns[0].priorities.mine = 1;
    g.pawns[0].hunger = 0.42;
    const raider = new Pawn(20, 20, '약탈자', 0xd64541, 'raider');
    raider.hp = 33;
    raider.maxHp = RAIDER_HP;
    g.raiders.push(raider);
    const savedTime = g.time;

    expect(g.save()).toBe(true);

    // 상태를 어지럽힌다
    g.time += 999;
    m.plant.fill(0);
    m.items.clear();
    g.pawns[0].priorities.mine = 4;
    g.pawns[0].hunger = 1;
    g.raiders = [];

    expect(g.load()).toBe(true);
    expect(g.time).toBe(savedTime);
    expect(m.plant[m.idx(5, 5)]).toBe(Plant.Tree);
    expect(m.items.get(m.idx(7, 7))).toEqual({ type: 'stone', count: 4 });
    expect(g.pawns[0].priorities.mine).toBe(1);
    expect(g.pawns[0].hunger).toBeCloseTo(0.42);
    expect(g.raiders.length).toBe(1);
    expect(g.raiders[0].hp).toBe(33);
  });

  it('세이브가 없으면 load는 false', () => {
    localStorage.removeItem('rimweb-save');
    expect(blankGame().load()).toBe(false);
  });
});

describe('습격 이벤트', () => {
  it('spawnRaid는 지정한 수만큼 약탈자를 만들고 알린다', () => {
    const g = blankGame();
    g.spawnRaid(3);
    expect(g.raiders.length).toBe(3);
    expect(g.raiders.every((r) => r.faction === 'raider' && r.hp === RAIDER_HP)).toBe(true);
    expect(g.messages.some((msg) => msg.text.includes('습격'))).toBe(true);
  });
});
