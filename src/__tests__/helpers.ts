import { Game } from '../game';

/**
 * 절차 생성된 맵을 전부 초기화한 결정적 테스트용 게임.
 * 맵 전체가 잔디 평지이고, 정착민은 (10,10) 부근에 일렬로 선다.
 */
export function blankGame(): Game {
  const g = new Game();
  const m = g.map;
  m.terrain.fill(0); // 전부 잔디
  m.rock.fill(0);
  m.plant.fill(0);
  m.growth.fill(0);
  m.structure.fill(0);
  m.structureHp.fill(0);
  m.stockpile.fill(0);
  m.farm.fill(0);
  m.designation.fill(0);
  m.blueprints.clear();
  m.items.clear();
  m.recomputeColors();
  g.raiders = [];
  g.reserved.clear();
  g.messages = [];
  g.nextRaidTime = Infinity; // 테스트 도중 습격 방지
  g.pawns.forEach((p, i) => {
    p.x = 10.5 + i;
    p.y = 10.5;
    p.hunger = 1;
    p.rest = 1;
    p.hp = p.maxHp;
    p.job = null;
    p.carrying = null;
    p.stopMoving();
  });
  return g;
}

/** dt=0.1초 단위로 게임을 seconds초만큼 진행 */
export function run(g: Game, seconds: number) {
  for (let k = 0; k < seconds * 10; k++) g.update(0.1);
}
