import { describe, it, expect } from 'vitest';
import { TRADE_OFFERS } from '../trader';
import { DAY_SECONDS, TRADER_STAY } from '../constants';
import { blankGame, run } from './helpers';

describe('거래 캐러밴', () => {
  it('상인이 도착해 콜로니 중앙으로 다가온다', () => {
    const g = blankGame();
    g.spawnTrader();
    expect(g.trader).not.toBeNull();
    expect(g.messages.some((m) => m.text.includes('상인'))).toBe(true);
    const cx = g.map.w / 2;
    const cy = g.map.h / 2;
    const before = Math.hypot(g.trader!.x - cx, g.trader!.y - cy);
    run(g, 10);
    expect(Math.hypot(g.trader!.x - cx, g.trader!.y - cy)).toBeLessThan(before);
  });

  it('자원이 충분하면 거래가 성사된다 (목재 → 식량)', () => {
    const g = blankGame();
    g.spawnTrader();
    const [giveType, giveCount] = TRADE_OFFERS[0].give;
    const [getType, getCount] = TRADE_OFFERS[0].get;
    // 두 스택에 나눠 놓아도 합산 차감되는지 확인
    g.map.dropItem(g.map.idx(10, 14), giveType, giveCount - 3);
    g.map.dropItem(g.map.idx(12, 14), giveType, 3);
    expect(g.trade(0)).toBe(true);
    const items = g.map.countItems();
    expect(items[giveType]).toBe(0);
    expect(items[getType]).toBe(getCount);
  });

  it('자원이 부족하면 거래가 거부되고 아무것도 차감되지 않는다', () => {
    const g = blankGame();
    g.spawnTrader();
    const [giveType, giveCount] = TRADE_OFFERS[0].give;
    g.map.dropItem(g.map.idx(10, 14), giveType, giveCount - 1);
    expect(g.trade(0)).toBe(false);
    expect(g.map.countItems()[giveType]).toBe(giveCount - 1);
  });

  it('상인이 없으면 거래할 수 없다', () => {
    const g = blankGame();
    g.map.dropItem(g.map.idx(10, 14), 'wood', 99);
    expect(g.trade(0)).toBe(false);
  });

  it('체류 시간이 끝나면 떠난다', () => {
    const g = blankGame();
    g.spawnTrader();
    g.traderUntil = g.time; // 즉시 떠나기 시작
    run(g, TRADER_STAY * DAY_SECONDS); // 가장자리까지 걸어갈 시간
    expect(g.trader).toBeNull();
    expect(g.messages.some((m) => m.text.includes('떠났다'))).toBe(true);
  });
});
