import { describe, it, expect } from 'vitest';
import { Pawn } from '../pawn';
import { RAIDER_HP, RIFLE_RANGE, SHOOT_RANGE } from '../constants';
import { blankGame, run } from './helpers';
import type { Game } from '../game';

function addRaider(g: Game, x: number, y: number, ranged = false): Pawn {
  const r = new Pawn(x, y, '약탈자', 0xd64541, 'raider');
  r.hp = r.maxHp = RAIDER_HP;
  r.isRanged = ranged;
  g.raiders.push(r);
  return r;
}

describe('무기 장비', () => {
  it('원거리 약탈자는 죽으면 소총을 떨어뜨린다', () => {
    const g = blankGame();
    const r = addRaider(g, 15, 10, true);
    r.takeDamage(g, 9999);
    expect(g.map.countItems().rifle).toBe(1);
  });

  it('근접 약탈자는 무기를 떨어뜨리지 않는다', () => {
    const g = blankGame();
    const r = addRaider(g, 15, 10, false);
    r.takeDamage(g, 9999);
    expect(g.map.countItems().rifle).toBe(0);
  });

  it('빈손 정착민은 떨어진 소총을 자동으로 장착한다', () => {
    const g = blankGame();
    g.map.dropItem(g.map.idx(14, 10), 'rifle', 1);
    run(g, 10);
    expect(g.pawns.filter((p) => p.weapon === 'rifle').length).toBe(1);
    expect(g.map.countItems().rifle).toBe(0);
    expect(g.messages.some((m) => m.text.includes('소총'))).toBe(true);
  });

  it('소총 장착 시 맨손 사거리 밖에서도 사격한다', () => {
    const g = blankGame();
    // 정착민들을 떨어뜨려 배치하고 한 명만 무장
    g.pawns[1].x = 50.5; g.pawns[1].y = 50.5;
    g.pawns[2].x = 52.5; g.pawns[2].y = 50.5;
    const shooter = g.pawns[0];
    shooter.weapon = 'rifle';
    shooter.drafted = true; // 제자리 고정
    const dist = (SHOOT_RANGE + RIFLE_RANGE) / 2; // 맨손 사거리 밖, 소총 사거리 안
    const r = addRaider(g, shooter.tileX + Math.floor(dist), shooter.tileY, true);
    r.repathCd = 999; // 접근 봉인
    g.update(0.3);
    expect(r.hp).toBeLessThan(RAIDER_HP);
  });
});
