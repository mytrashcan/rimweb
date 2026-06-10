import { describe, it, expect } from 'vitest';
import { spiralTiles } from '../map';
import { Structure, Plant } from '../types';
import { WALL_HP } from '../constants';
import { blankGame } from './helpers';

describe('아이템 드랍/획득', () => {
  it('같은 종류는 같은 칸에 합쳐진다', () => {
    const m = blankGame().map;
    const i = m.idx(10, 10);
    m.dropItem(i, 'wood', 5);
    m.dropItem(i, 'wood', 3);
    expect(m.items.get(i)).toEqual({ type: 'wood', count: 8 });
    expect(m.items.size).toBe(1);
  });

  it('다른 종류는 인접한 빈 칸으로 밀려난다', () => {
    const m = blankGame().map;
    const i = m.idx(10, 10);
    m.dropItem(i, 'wood', 5);
    m.dropItem(i, 'stone', 2);
    expect(m.items.get(i)!.type).toBe('wood');
    expect(m.items.size).toBe(2);
    const stone = [...m.items.values()].find((s) => s.type === 'stone');
    expect(stone).toEqual({ type: 'stone', count: 2 });
  });

  it('takeItem은 일부/전부를 집고 빈 스택을 제거한다', () => {
    const m = blankGame().map;
    const i = m.idx(10, 10);
    m.dropItem(i, 'food', 5);
    expect(m.takeItem(i, 2)).toBe(2);
    expect(m.items.get(i)!.count).toBe(3);
    expect(m.takeItem(i, 99)).toBe(3);
    expect(m.items.has(i)).toBe(false);
  });
});

describe('벽 내구도', () => {
  it('피해를 누적하다 0이 되면 파괴된다', () => {
    const m = blankGame().map;
    const i = m.idx(10, 10);
    m.structure[i] = Structure.Wall;
    m.structureHp[i] = WALL_HP;
    expect(m.damageWall(i, 40)).toBe(false);
    expect(m.structureHp[i]).toBe(WALL_HP - 40);
    expect(m.damageWall(i, 999)).toBe(true);
    expect(m.structure[i]).toBe(Structure.None);
  });
});

describe('직렬화', () => {
  it('serialize → deserialize 라운드트립으로 상태가 복원된다', () => {
    const m = blankGame().map;
    m.plant[m.idx(5, 5)] = Plant.Tree;
    m.farm[m.idx(6, 6)] = 1;
    m.dropItem(m.idx(7, 7), 'wood', 9);
    m.blueprints.set(m.idx(8, 8), { kind: Structure.Bed, woodNeed: 6, woodHas: 2, workLeft: 100 });

    const data = m.serialize();
    // 상태를 어지럽힌 뒤 복원
    m.plant.fill(0);
    m.farm.fill(0);
    m.items.clear();
    m.blueprints.clear();
    m.deserialize(data);

    expect(m.plant[m.idx(5, 5)]).toBe(Plant.Tree);
    expect(m.farm[m.idx(6, 6)]).toBe(1);
    expect(m.items.get(m.idx(7, 7))).toEqual({ type: 'wood', count: 9 });
    expect(m.blueprints.get(m.idx(8, 8))).toEqual({ kind: Structure.Bed, woodNeed: 6, woodHas: 2, workLeft: 100 });
  });
});

describe('spiralTiles', () => {
  it('중심부터 바깥으로, 중복 없이 순회한다', () => {
    const tiles = [...spiralTiles(10, 10, 2)];
    expect(tiles[0]).toEqual([10, 10]);
    expect(tiles.length).toBe(25); // 5x5
    const keys = new Set(tiles.map(([x, y]) => `${x},${y}`));
    expect(keys.size).toBe(25);
    // 반지름이 단조 증가
    const radii = tiles.map(([x, y]) => Math.max(Math.abs(x - 10), Math.abs(y - 10)));
    for (let k = 1; k < radii.length; k++) expect(radii[k]).toBeGreaterThanOrEqual(radii[k - 1]);
  });
});
