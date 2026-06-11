import { describe, it, expect, vi, afterEach } from 'vitest';
import { Structure } from '../types';
import { GRAVE_WORK } from '../constants';
import { blankGame, run } from './helpers';

afterEach(() => vi.restoreAllMocks());

describe('사망과 장례', () => {
  it('운이 나쁘면 다운 대신 사망한다 (시신·유품 드랍, 애도)', () => {
    const g = blankGame();
    const p = g.pawns[0];
    p.weapon = 'rifle';
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // 사망 확률 강제
    p.takeDamage(g, 9999);
    vi.restoreAllMocks();
    expect(p.dead).toBe(true);
    g.update(0.1); // 사망자 정리
    expect(g.pawns.length).toBe(2);
    const items = g.map.countItems();
    expect(items.corpse).toBe(1);
    expect(items.rifle).toBe(1); // 유품
    expect(g.pawns.every((o) => o.griefTimer > 0)).toBe(true);
    expect(g.pawns[0].moodFactors(g).some((f) => f.label === '동료의 죽음')).toBe(true);
    expect(g.pawns[0].moodFactors(g).some((f) => f.label === '방치된 시신')).toBe(true);
  });

  it('운이 좋으면 기존처럼 쓰러지기만 한다', () => {
    const g = blankGame();
    const p = g.pawns[0];
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    p.takeDamage(g, 9999);
    vi.restoreAllMocks();
    expect(p.dead).toBe(false);
    expect(p.downed).toBe(true);
  });

  it('시신을 무덤에 매장하면 사기 저하가 사라진다', () => {
    const g = blankGame();
    const m = g.map;
    m.dropItem(m.idx(15, 10), 'corpse', 1);
    m.structure[m.idx(20, 10)] = Structure.Grave; // 빈 무덤
    run(g, 20);
    expect(m.countItems().corpse).toBe(0);
    expect(m.structureHp[m.idx(20, 10)]).toBe(1); // 봉분
    g.update(0.1);
    expect(g.pawns[0].moodFactors(g).some((f) => f.label === '방치된 시신')).toBe(false);
  });

  it('무덤 청사진은 자재 없이 파기만 하면 완성된다', () => {
    const g = blankGame();
    const m = g.map;
    const i = m.idx(16, 10);
    m.blueprints.set(i, { kind: Structure.Grave, woodNeed: 0, woodHas: 0, workLeft: GRAVE_WORK });
    run(g, 15);
    expect(m.structure[i]).toBe(Structure.Grave);
  });

  it('시신은 비축구역으로 운반되지 않는다', () => {
    const g = blankGame();
    const m = g.map;
    m.dropItem(m.idx(15, 10), 'corpse', 1);
    m.stockpile[m.idx(20, 20)] = 1;
    run(g, 15); // 무덤이 없으므로 방치
    expect(m.items.get(m.idx(15, 10))?.type).toBe('corpse');
  });
});
