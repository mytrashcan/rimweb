import { describe, it, expect, beforeAll } from 'vitest';
import { MAX_COLONISTS } from '../constants';
import { blankGame } from './helpers';

beforeAll(() => {
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

describe('방랑자 합류', () => {
  it('합류 이벤트로 정착민이 늘어난다 (이름 중복 없음)', () => {
    const g = blankGame();
    g.tryJoinWanderer();
    expect(g.pawns.length).toBe(4);
    g.tryJoinWanderer();
    expect(g.pawns.length).toBe(5);
    const names = g.pawns.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    expect(g.messages.some((m) => m.text.includes('합류'))).toBe(true);
  });

  it('최대 인원을 넘지 않는다', () => {
    const g = blankGame();
    for (let i = 0; i < 10; i++) g.tryJoinWanderer();
    expect(g.pawns.length).toBe(MAX_COLONISTS);
  });

  it('늘어난 정착민 수가 저장/불러오기에서 유지된다', () => {
    const g = blankGame();
    g.tryJoinWanderer();
    g.tryJoinWanderer();
    const names = g.pawns.map((p) => p.name);
    expect(g.save()).toBe(true);

    const g2 = blankGame(); // 3명짜리 새 게임
    expect(g2.load()).toBe(true);
    expect(g2.pawns.length).toBe(5);
    expect(g2.pawns.map((p) => p.name)).toEqual(names);
  });

  it('새 정착민도 일을 받는다', () => {
    const g = blankGame();
    g.tryJoinWanderer();
    const rookie = g.pawns[3];
    rookie.hunger = 1; // 허기 행동 배제
    rookie.rest = 1;
    const m = g.map;
    const i = m.idx(rookie.tileX + 2, rookie.tileY);
    m.plant[i] = 1;
    m.designation[i] = 1; // 벌목 지정
    g.update(0.1);
    expect(g.pawns.some((p) => p.job?.label === '벌목 중')).toBe(true);
  });
});
