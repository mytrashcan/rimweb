import { describe, it, expect } from 'vitest';
import { findPath, bfsNearest } from '../astar';
import { Structure } from '../types';
import { blankGame } from './helpers';

describe('findPath', () => {
  it('빈 맵에서 직선 경로를 찾는다', () => {
    const m = blankGame().map;
    const path = findPath(m, 5, 5, 9, 5);
    expect(path).not.toBeNull();
    expect(path!.length).toBe(4);
    expect(path![path!.length - 1]).toEqual({ x: 9, y: 5 });
  });

  it('벽을 우회해 틈으로 지나간다', () => {
    const m = blankGame().map;
    for (let y = 0; y < m.h; y++) m.structure[m.idx(7, y)] = Structure.Wall;
    m.structure[m.idx(7, 20)] = Structure.None; // 유일한 틈
    const path = findPath(m, 5, 5, 9, 5);
    expect(path).not.toBeNull();
    expect(path!.some((n) => n.x === 7 && n.y === 20)).toBe(true);
  });

  it('완전히 막힌 목표는 null', () => {
    const m = blankGame().map;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      m.structure[m.idx(20 + dx, 20 + dy)] = Structure.Wall;
    }
    expect(findPath(m, 10, 10, 20, 20)).toBeNull();
  });

  it('adjacent 모드는 통행 불가 목표의 이웃 칸까지 간다', () => {
    const m = blankGame().map;
    m.rock[m.idx(30, 30)] = 1;
    const path = findPath(m, 25, 30, 30, 30, true);
    expect(path).not.toBeNull();
    const end = path![path!.length - 1];
    expect(Math.abs(end.x - 30) + Math.abs(end.y - 30)).toBe(1);
  });

  it('대각선 모서리 끼임을 허용하지 않는다', () => {
    const m = blankGame().map;
    m.structure[m.idx(11, 10)] = Structure.Wall;
    m.structure[m.idx(10, 11)] = Structure.Wall;
    const path = findPath(m, 10, 10, 11, 11);
    expect(path).not.toBeNull();
    // 직진 대각선(1칸)이 막혔으므로 둘러가야 한다
    expect(path!.length).toBeGreaterThanOrEqual(4);
  });
});

describe('bfsNearest', () => {
  it('걸어서 닿을 수 있는 가장 가까운 타일을 찾는다', () => {
    const g = blankGame();
    const m = g.map;
    m.items.set(m.idx(15, 10), { type: 'wood', count: 1 });
    m.items.set(m.idx(40, 40), { type: 'wood', count: 1 });
    const found = bfsNearest(m, 10, 10, (i) => m.items.has(i));
    expect(found).toBe(m.idx(15, 10));
  });

  it('벽으로 봉쇄된 타일은 찾지 못한다', () => {
    const m = blankGame().map;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      m.structure[m.idx(20 + dx, 20 + dy)] = Structure.Wall;
    }
    m.items.set(m.idx(20, 20), { type: 'food', count: 1 });
    expect(bfsNearest(m, 10, 10, (i) => m.items.has(i))).toBeNull();
  });

  it('통행 불가 타일(바위)도 인접까지 걸어갈 수 있으면 찾는다', () => {
    const m = blankGame().map;
    m.rock[m.idx(15, 10)] = 1;
    expect(bfsNearest(m, 10, 10, (i) => m.rock[i] === 1)).toBe(m.idx(15, 10));
  });
});
