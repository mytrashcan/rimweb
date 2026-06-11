import { describe, it, expect } from 'vitest';
import { Plant, Structure } from '../types';
import { Terrain } from '../map';
import { blankGame, run } from './helpers';
import type { Game } from '../game';

/** 정착민들을 바위로 봉인해 진압을 못 하게 만든다 */
function sealPawns(g: Game) {
  const m = g.map;
  for (let x = 8; x <= 14; x++) for (const y of [8, 12]) m.rock[m.idx(x, y)] = 1;
  for (let y = 8; y <= 12; y++) for (const x of [8, 14]) m.rock[m.idx(x, y)] = 1;
}

describe('화재', () => {
  it('불은 나무를 태워 없애고 땅을 그을린다', () => {
    const g = blankGame();
    const m = g.map;
    sealPawns(g);
    const i = m.idx(40, 40);
    m.plant[i] = Plant.Tree;
    m.fire[i] = 0.3;
    run(g, 15);
    expect(m.plant[i]).toBe(Plant.None);
    expect(m.terrain[i]).toBe(Terrain.Dirt);
    expect(m.fire[i]).toBe(0);
  });

  it('불은 인접 가연물로 번진다', () => {
    const g = blankGame();
    const m = g.map;
    sealPawns(g);
    // 나무 빽빽한 숲에 불씨 하나
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        m.plant[m.idx(40 + dx, 40 + dy)] = Plant.Tree;
      }
    }
    m.fire[m.idx(40, 40)] = 0.5;
    run(g, 40);
    let trees = 0;
    for (let i = 0; i < m.plant.length; i++) if (m.plant[i] === Plant.Tree) trees++;
    expect(trees).toBeLessThan(25); // 중심 외에도 탔다
  });

  it('정착민이 모든 일을 제쳐두고 불을 끈다', () => {
    const g = blankGame();
    const m = g.map;
    // 벌목 지정도 있지만 불이 우선
    m.plant[m.idx(15, 10)] = Plant.Tree;
    m.designation[m.idx(15, 10)] = 1;
    const i = m.idx(13, 10);
    m.plant[i] = Plant.Bush; // 가연물
    m.growth[i] = 1;
    m.fire[i] = 0.3;
    g.update(0.1);
    expect(g.pawns.some((p) => p.job?.label === '화재 진압 중')).toBe(true);
    run(g, 10);
    expect(m.fire[i]).toBe(0); // 꺼짐
    expect(m.plant[i]).toBe(Plant.Bush); // 다 타기 전에 진압 → 덤불 생존
  });

  it('불 위에 서 있으면 피해를 입는다', () => {
    const g = blankGame();
    const m = g.map;
    const p = g.pawns[0];
    const i = m.idx(p.tileX, p.tileY);
    m.plant[i] = Plant.Bush; // 가연물 위에 서 있음
    m.fire[i] = 0.6;
    g.update(1);
    expect(p.hp).toBeLessThan(p.maxHp);
  });

  it('벽도 타서 무너진다', () => {
    const g = blankGame();
    const m = g.map;
    sealPawns(g);
    const i = m.idx(40, 40);
    m.structure[i] = Structure.Wall;
    m.structureHp[i] = 100;
    m.fire[i] = 0.5;
    run(g, 10);
    expect(m.structure[i]).toBe(Structure.None);
  });
});
