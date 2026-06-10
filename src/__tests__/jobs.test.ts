import { describe, it, expect } from 'vitest';
import { findJob, makeForcedJob } from '../jobs';
import { Plant, Structure, Designation } from '../types';
import { WALL_HP, WALL_WOOD_COST, WALL_WORK } from '../constants';
import { blankGame, run } from './helpers';

describe('잡 기버 우선순위', () => {
  it('벌목 지정된 나무를 벌목한다', () => {
    const g = blankGame();
    const m = g.map;
    const i = m.idx(15, 10);
    m.plant[i] = Plant.Tree;
    m.designation[i] = Designation.Chop;
    expect(findJob(g.pawns[0], g).label).toBe('벌목 중');
  });

  it('우선순위 숫자가 낮은 작업을 먼저 고른다', () => {
    // 운반과 벌목이 모두 가능한 상황
    const setup = () => {
      const g = blankGame();
      const m = g.map;
      m.plant[m.idx(15, 10)] = Plant.Tree;
      m.designation[m.idx(15, 10)] = Designation.Chop;
      m.dropItem(m.idx(9, 10), 'wood', 5);
      m.stockpile[m.idx(20, 20)] = 1;
      return g;
    };
    const g1 = setup();
    g1.pawns[0].priorities = { construct: 3, grow: 3, mine: 3, chop: 2, haul: 1 };
    expect(findJob(g1.pawns[0], g1).label).toBe('운반 중');

    const g2 = setup();
    g2.pawns[0].priorities = { construct: 3, grow: 3, mine: 3, chop: 1, haul: 2 };
    expect(findJob(g2.pawns[0], g2).label).toBe('벌목 중');
  });

  it('"안 함"(0)으로 둔 작업은 절대 하지 않는다', () => {
    const g = blankGame();
    const m = g.map;
    m.plant[m.idx(15, 10)] = Plant.Tree;
    m.designation[m.idx(15, 10)] = Designation.Chop;
    g.pawns[0].priorities.chop = 0;
    expect(findJob(g.pawns[0], g).label).toBe('서성이는 중');
  });

  it('생존 욕구가 작업 표보다 우선한다', () => {
    const g = blankGame();
    const m = g.map;
    m.plant[m.idx(15, 10)] = Plant.Tree;
    m.designation[m.idx(15, 10)] = Designation.Chop;
    m.dropItem(m.idx(9, 10), 'food', 3);
    g.pawns[0].hunger = 0.1;
    expect(findJob(g.pawns[0], g).label).toBe('식사하러 가는 중');

    const g2 = blankGame();
    g2.pawns[0].rest = 0.05;
    expect(findJob(g2.pawns[0], g2).label).toBe('자러 가는 중');
  });

  it('두 정착민이 같은 작업을 중복으로 잡지 않는다 (예약)', () => {
    const g = blankGame();
    const m = g.map;
    const i = m.idx(15, 10);
    m.plant[i] = Plant.Tree;
    m.designation[i] = Designation.Chop;
    expect(findJob(g.pawns[0], g).label).toBe('벌목 중');
    expect(findJob(g.pawns[1], g).label).toBe('서성이는 중'); // 이미 예약됨
  });
});

describe('우클릭 직접 명령', () => {
  it('나무를 우클릭하면 자동 지정 + 벌목', () => {
    const g = blankGame();
    const m = g.map;
    const i = m.idx(15, 10);
    m.plant[i] = Plant.Tree;
    const job = makeForcedJob(g.pawns[0], g, 15, 10);
    expect(job!.label).toBe('벌목 중');
    expect(m.designation[i]).toBe(Designation.Chop);
  });

  it('빈 땅은 이동, 예약된 대상은 null', () => {
    const g = blankGame();
    expect(makeForcedJob(g.pawns[0], g, 20, 20)!.label).toBe('이동 중');
    const m = g.map;
    m.plant[m.idx(15, 10)] = Plant.Tree;
    g.reserved.add(m.idx(15, 10));
    expect(makeForcedJob(g.pawns[0], g, 15, 10)).toBeNull();
  });
});

describe('통합: 건설/농사 루프', () => {
  it('목재 배달 → 벽 시공까지 완료한다', () => {
    const g = blankGame();
    const m = g.map;
    const bp = m.idx(14, 10);
    m.blueprints.set(bp, { kind: Structure.Wall, woodNeed: WALL_WOOD_COST, woodHas: 0, workLeft: WALL_WORK });
    m.dropItem(m.idx(12, 12), 'wood', 5);
    run(g, 40);
    expect(m.structure[bp]).toBe(Structure.Wall);
    expect(m.structureHp[bp]).toBe(WALL_HP);
  });

  it('경작지에 파종하고, 다 자라면 수확해 식량을 만든다', () => {
    const g = blankGame();
    const m = g.map;
    const f = m.idx(14, 10);
    m.farm[f] = 1;
    run(g, 15);
    expect(m.plant[f]).toBe(Plant.Crop); // 파종됨
    m.growth[f] = 1; // 즉시 성숙
    run(g, 15);
    expect(m.countItems().food).toBeGreaterThanOrEqual(1); // 수확물
  });
});
