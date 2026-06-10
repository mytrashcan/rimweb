import { describe, it, expect } from 'vitest';
import { MOOD_BASE } from '../constants';
import { Pawn } from '../pawn';
import { blankGame, run } from './helpers';
import type { Game } from '../game';

/** 도망가지 못하게 바위로 봉인된 약탈자 (습격 공포 요인용) */
function addTrappedRaider(g: Game) {
  const m = g.map;
  const r = new Pawn(50, 50, '약탈자', 0xd64541, 'raider');
  g.raiders.push(r);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    m.rock[m.idx(50 + dx, 50 + dy)] = 1;
  }
}

describe('기분', () => {
  it('굶주리면 기분 목표치가 낮아진다', () => {
    const g = blankGame();
    const p = g.pawns[0];
    const fed = p.moodTarget(g);
    p.hunger = 0;
    expect(p.moodTarget(g)).toBeLessThan(fed);
    expect(p.moodFactors(g).some((f) => f.label === '굶주림')).toBe(true);
  });

  it('상황이 나쁘면 기분이 목표치를 향해 떨어진다', () => {
    const g = blankGame();
    const p = g.pawns[0];
    p.hunger = 0;
    addTrappedRaider(g);
    run(g, 60);
    expect(p.mood).toBeLessThan(MOOD_BASE - 0.15);
  });

  it('기분이 임계 이하로 지속되면 멘탈 브레이크가 온다', () => {
    const g = blankGame();
    const p = g.pawns[0];
    p.hunger = 0; // 굶주림 -0.30
    addTrappedRaider(g); // 습격 공포 -0.10 (침대 부족 -0.08 포함 → 목표 0.17)
    p.mood = 0.1; // 이미 한계 근처
    run(g, 30); // 임계 이하 25초 누적
    expect(g.messages.some((m) => m.text.includes('한계'))).toBe(true);
    expect(p.job?.label).toBe('멘탈 브레이크 🤯');
  });

  it('브레이크 중에는 명령으로 중단할 수 없고, 끝나면 기분이 회복된다', () => {
    const g = blankGame();
    const p = g.pawns[0];
    p.hunger = 0;
    addTrappedRaider(g);
    p.mood = 0.1;
    run(g, 30);
    expect(p.job?.uninterruptible).toBe(true);
    const before = p.job;
    // 강제 명령 시도 → 무시되어야 함
    p.assignForcedJob(g, before!); // 자기 자신이라도 교체 시도
    expect(p.job).toBe(before);
    const moodDuringBreak = p.mood;
    run(g, 35); // 브레이크(30초) 종료
    expect(p.job?.label).not.toBe('멘탈 브레이크 🤯');
    expect(p.mood).toBeGreaterThan(moodDuringBreak); // 카타르시스
  });
});
