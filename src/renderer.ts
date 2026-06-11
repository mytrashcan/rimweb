import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { TILE } from './constants';
import { Terrain, Plant, Structure, Designation } from './map';
import type { Game } from './game';
import type { Pawn } from './pawn';
import { uiState } from './state';

interface PawnView {
  root: Container;
  body: Graphics;
  label: Text;
}

export class Renderer {
  world = new Container();
  private tileG = new Graphics();
  private overlayG = new Graphics();
  private itemG = new Graphics();
  private pawnLayer = new Container();
  private fireG = new Graphics();
  private shotG = new Graphics();
  private weatherG = new Graphics();
  private nightG = new Graphics();
  private pawnViews = new Map<Pawn, PawnView>();
  private labelStyle: TextStyle;
  /** 입력 처리에서 설정하는 드래그 영역 (타일 좌표) */
  dragRect: { x0: number; y0: number; x1: number; y1: number } | null = null;

  constructor(private app: Application, private game: Game) {
    this.world.addChild(this.tileG, this.overlayG, this.itemG, this.pawnLayer, this.fireG, this.shotG);
    app.stage.addChild(this.world, this.weatherG, this.nightG);

    this.labelStyle = new TextStyle({
      fontFamily: 'Segoe UI, sans-serif',
      fontSize: 11,
      fill: 0xffffff,
      stroke: { color: 0x000000, width: 3 },
    });
  }

  update() {
    const m = this.game.map;
    if (m.dirty) {
      this.drawTiles();
      m.dirty = false;
    }
    this.drawOverlay();
    this.drawItems();
    this.syncPawnViews();
    this.drawPawns();
    this.drawFire();
    this.drawShots();
    this.drawWeather();
    this.drawNight();
  }

  /** 비/눈: 화면 공간에 떨어지는 입자들 */
  private drawWeather() {
    const g = this.weatherG;
    g.clear();
    if (!this.game.raining) return;
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const t = performance.now() / 1000;
    const snow = this.game.isWinter;
    const count = 90;
    for (let i = 0; i < count; i++) {
      // 입자별 고정 시드로 균일하게 흩뿌리기
      const seed = (i * 2654435761) >>> 0;
      const x0 = (seed % 1000) / 1000;
      const speed = snow ? 60 + (seed % 40) : 380 + (seed % 120);
      const y = ((seed % 700) / 700 * h + t * speed) % h;
      const x = (x0 * w + (snow ? Math.sin(t * 1.5 + i) * 18 : t * 60)) % w;
      if (snow) {
        g.circle(x, y, 1.6 + (seed % 3) * 0.5).fill({ color: 0xffffff, alpha: 0.7 });
      } else {
        g.moveTo(x, y).lineTo(x - 3, y + 11).stroke({ width: 1.2, color: 0x9cb8d0, alpha: 0.55 });
      }
    }
    // 비 오는 날의 어둑함
    if (!snow) g.rect(0, 0, w, h).fill({ color: 0x202c3a, alpha: 0.12 });
  }

  private drawFire() {
    const m = this.game.map;
    const g = this.fireG;
    g.clear();
    const t = this.game.time;
    for (let i = 0; i < m.fire.length; i++) {
      const f = m.fire[i];
      if (f <= 0) continue;
      const x = (i % m.w) * TILE;
      const y = ((i / m.w) | 0) * TILE;
      const flicker = 0.8 + 0.2 * Math.sin(t * 12 + i * 1.7);
      const h = TILE * (0.35 + 0.5 * Math.min(1, f)) * flicker;
      // 바깥 불꽃
      g.poly([
        x + TILE * 0.2, y + TILE * 0.9,
        x + TILE * 0.5, y + TILE * 0.9 - h,
        x + TILE * 0.8, y + TILE * 0.9,
      ]).fill({ color: 0xe06520, alpha: 0.85 });
      // 속불꽃
      g.poly([
        x + TILE * 0.33, y + TILE * 0.88,
        x + TILE * 0.5, y + TILE * 0.88 - h * 0.55,
        x + TILE * 0.67, y + TILE * 0.88,
      ]).fill({ color: 0xf0c040, alpha: 0.9 });
    }
  }

  /** 정착민 + 약탈자 뷰를 동기화 (스폰/사망 대응) */
  private syncPawnViews() {
    const all = new Set<Pawn>([...this.game.pawns, ...this.game.raiders, ...this.game.animals]);
    for (const p of all) {
      if (this.pawnViews.has(p)) continue;
      const root = new Container();
      const body = new Graphics();
      const label = new Text({ text: p.name, style: this.labelStyle });
      label.anchor.set(0.5, 0);
      label.y = TILE * 0.45;
      root.addChild(body, label);
      this.pawnLayer.addChild(root);
      this.pawnViews.set(p, { root, body, label });
    }
    for (const [p, view] of this.pawnViews) {
      if (!all.has(p)) {
        view.root.destroy({ children: true });
        this.pawnViews.delete(p);
      }
    }
  }

  private drawTiles() {
    const m = this.game.map;
    const g = this.tileG;
    g.clear();
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        const i = m.idx(x, y);
        const px = x * TILE;
        const py = y * TILE;
        g.rect(px, py, TILE, TILE).fill(m.baseColor[i]);

        if (m.farm[i]) {
          // 갈아엎은 밭고랑
          g.rect(px, py, TILE, TILE).fill({ color: 0x4a3826, alpha: 0.75 });
          for (let row = 0; row < 3; row++) {
            g.rect(px + 2, py + 3 + row * 6, TILE - 4, 2).fill({ color: 0x3a2c1e, alpha: 0.8 });
          }
        }
        if (m.terrain[i] === Terrain.Water) {
          // 물결 하이라이트
          if ((x + y) % 3 === 0) g.rect(px + 4, py + TILE / 2, TILE / 2, 2).fill(0x4a7eb0);
        }
        if (m.rock[i]) {
          g.rect(px, py, TILE, TILE).fill(0x5c5c63);
          g.rect(px + 2, py + 2, TILE - 4, TILE - 4).fill(0x6b6b72);
        } else if (m.structure[i] === Structure.Wall) {
          g.rect(px, py, TILE, TILE).fill(0x8a8a92);
          g.rect(px + 1, py + 1, TILE - 2, TILE - 2).stroke({ width: 1, color: 0x70707a });
        } else if (m.structure[i] === Structure.Bed) {
          g.roundRect(px + 2, py + 1, TILE - 4, TILE - 2, 3).fill(0x8c6f4f);
          g.roundRect(px + 4, py + 2, TILE - 8, 6, 2).fill(0xd9d0c0); // 베개
        } else if (m.structure[i] === Structure.Stove) {
          g.roundRect(px + 2, py + 2, TILE - 4, TILE - 4, 2).fill(0x55555c);
          g.circle(px + TILE / 2, py + TILE / 2, TILE * 0.18).fill(0xe07b39); // 불
          g.circle(px + TILE / 2, py + TILE / 2, TILE * 0.09).fill(0xf0c060);
        } else if (m.structure[i] === Structure.Grave) {
          const filled = m.structureHp[i] > 0;
          g.roundRect(px + 3, py + 4, TILE - 6, TILE - 7, 4).fill(filled ? 0x4a3a2c : 0x2c2620);
          if (filled) {
            // 묘비
            g.roundRect(px + TILE / 2 - 2, py + 2, 4, 8, 1.5).fill(0x9b9ba3);
          }
        } else if (m.plant[i] === Plant.Tree) {
          g.rect(px + TILE / 2 - 2, py + TILE / 2, 4, TILE / 2 - 2).fill(0x5b4226);
          g.circle(px + TILE / 2, py + TILE / 2 - 2, TILE * 0.36).fill(0x2e5d2e);
          g.circle(px + TILE / 2 - 3, py + TILE / 2 - 5, TILE * 0.18).fill(0x3a703a);
        } else if (m.plant[i] === Plant.Crop) {
          // 작물: 성장도에 따라 새싹 → 노랗게 익은 이삭
          const gr = m.growth[i];
          const mature = gr >= 1;
          const col = mature ? 0xd6c04a : 0x6abf5a;
          const size = 1.5 + gr * 2.5;
          for (const [ox, oy] of [[5, 6], [12, 9], [7, 14], [14, 15]]) {
            g.circle(px + ox, py + oy, size).fill(col);
          }
        } else if (m.plant[i] === Plant.Bush) {
          const grown = m.growth[i] >= 0.5;
          g.circle(px + TILE / 2, py + TILE / 2, TILE * (0.16 + 0.14 * m.growth[i]))
            .fill(grown ? 0x4a7d3a : 0x44603c);
          if (grown) {
            g.circle(px + TILE / 2 - 3, py + TILE / 2 - 2, 1.5).fill(0xc24545);
            g.circle(px + TILE / 2 + 3, py + TILE / 2 + 2, 1.5).fill(0xc24545);
          }
        }
      }
    }
  }

  private drawOverlay() {
    const m = this.game.map;
    const g = this.overlayG;
    g.clear();

    for (let i = 0; i < m.terrain.length; i++) {
      const [x, y] = m.xy(i);
      const px = x * TILE;
      const py = y * TILE;
      if (m.stockpile[i]) {
        g.rect(px, py, TILE, TILE).fill({ color: 0xc9a227, alpha: 0.13 });
        g.rect(px + 0.5, py + 0.5, TILE - 1, TILE - 1).stroke({ width: 1, color: 0xc9a227, alpha: 0.45 });
      }
      if (m.designation[i] === Designation.Chop) {
        g.rect(px + 1, py + 1, TILE - 2, TILE - 2).stroke({ width: 2, color: 0xe07b39, alpha: 0.9 });
      } else if (m.designation[i] === Designation.Mine) {
        g.rect(px + 1, py + 1, TILE - 2, TILE - 2).stroke({ width: 2, color: 0x39c6e0, alpha: 0.9 });
      }
    }

    for (const [i, bp] of m.blueprints) {
      const [x, y] = m.xy(i);
      const px = x * TILE;
      const py = y * TILE;
      const ready = bp.woodHas >= bp.woodNeed;
      g.rect(px + 1, py + 1, TILE - 2, TILE - 2)
        .fill({ color: ready ? 0x6fa8dc : 0x3d6b9e, alpha: 0.45 })
        .stroke({ width: 1, color: 0x9fc5e8, alpha: 0.9 });
      if (bp.kind === Structure.Bed) {
        g.roundRect(px + 4, py + 3, TILE - 8, TILE - 6, 2).stroke({ width: 1, color: 0xd9d0c0, alpha: 0.8 });
      }
      // 자재/작업 진행 바
      const total = bp.kind === Structure.Wall ? 50 : 100;
      const frac = ready ? 1 - bp.workLeft / total : bp.woodHas / bp.woodNeed;
      g.rect(px + 2, py + TILE - 4, (TILE - 4) * Math.max(0, Math.min(1, frac)), 2)
        .fill(ready ? 0x7ddc7d : 0xe0c739);
    }

    // 선택된 나무/바위 강조
    for (const i of uiState.selectedTiles) {
      const [x, y] = m.xy(i);
      g.rect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2)
        .stroke({ width: 1.5, color: 0xffffff, alpha: 0.85 });
    }

    if (this.dragRect) {
      const { x0, y0, x1, y1 } = this.dragRect;
      const rx = Math.min(x0, x1) * TILE;
      const ry = Math.min(y0, y1) * TILE;
      const rw = (Math.abs(x1 - x0) + 1) * TILE;
      const rh = (Math.abs(y1 - y0) + 1) * TILE;
      g.rect(rx, ry, rw, rh)
        .fill({ color: 0xffffff, alpha: 0.08 })
        .stroke({ width: 1.5, color: 0xffffff, alpha: 0.8 });
    }
  }

  private drawItems() {
    const m = this.game.map;
    const g = this.itemG;
    g.clear();
    for (const [i, stack] of m.items) {
      const [x, y] = m.xy(i);
      const px = x * TILE;
      const py = y * TILE;
      if (stack.type === 'wood') {
        g.roundRect(px + 3, py + 6, TILE - 6, 4, 2).fill(0x9a6b3f);
        g.roundRect(px + 5, py + 11, TILE - 6, 4, 2).fill(0x82572f);
      } else if (stack.type === 'stone') {
        g.circle(px + TILE / 2, py + TILE / 2 + 2, TILE * 0.26).fill(0x9b9ba3);
        g.circle(px + TILE / 2 - 3, py + TILE / 2 - 2, TILE * 0.16).fill(0x86868e);
      } else if (stack.type === 'corpse') {
        g.ellipse(px + TILE / 2, py + TILE / 2, TILE * 0.4, TILE * 0.22)
          .fill(0x8a8276)
          .stroke({ width: 1, color: 0x5c564c });
      } else if (stack.type === 'rifle') {
        g.roundRect(px + 2, py + TILE / 2 - 1, TILE - 4, 3, 1.5).fill(0x4a3826);
        g.roundRect(px + 3, py + TILE / 2 - 4, 5, 4, 1).fill(0x6b4f30); // 개머리판
      } else if (stack.type === 'meal') {
        // 접시에 담긴 요리
        g.circle(px + TILE / 2, py + TILE / 2, TILE * 0.3).fill(0xe8e0d0);
        g.circle(px + TILE / 2 - 2, py + TILE / 2 - 1, 2.5).fill(0xc98f4e);
        g.circle(px + TILE / 2 + 3, py + TILE / 2 + 1, 2.5).fill(0x7d9c4e);
      } else {
        g.circle(px + TILE / 2 - 3, py + TILE / 2, 3).fill(0xc24545);
        g.circle(px + TILE / 2 + 3, py + TILE / 2 - 2, 3).fill(0xd05858);
        g.circle(px + TILE / 2 + 2, py + TILE / 2 + 4, 3).fill(0xb03c3c);
      }
    }
  }

  private drawPawns() {
    for (const [p, view] of this.pawnViews) {
      view.root.position.set(p.x * TILE, p.y * TILE);
      const g = view.body;
      g.clear();

      if (p.downed) {
        // 쓰러진 자세: 납작한 타원
        g.ellipse(0, TILE * 0.12, TILE * 0.42, TILE * 0.2)
          .fill({ color: p.color, alpha: 0.65 })
          .stroke({ width: 1, color: 0x202428 });
        view.label.alpha = 0.5;
        continue;
      }
      view.label.alpha = 1;

      if (uiState.selectedPawns.includes(p) || uiState.selectedAnimals.includes(p)) {
        g.circle(0, 0, TILE * 0.5).stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
      }
      if (p.drafted) {
        g.circle(0, 0, TILE * 0.46).stroke({ width: 2, color: 0xe05050, alpha: 0.95 });
      }
      if (p.hunted) {
        g.circle(0, 0, TILE * 0.46).stroke({ width: 2, color: 0xe0a039, alpha: 0.95 });
      }
      const bodyR = p.faction === 'animal' ? TILE * 0.3 : TILE * 0.38;
      g.circle(0, 0, bodyR).fill(p.color).stroke({ width: 1.5, color: 0x202428 });
      if (p.faction === 'animal') {
        // 사슴 귀
        g.circle(-bodyR * 0.7, -bodyR * 0.8, bodyR * 0.32).fill(0x8a6b48);
        g.circle(bodyR * 0.7, -bodyR * 0.8, bodyR * 0.32).fill(0x8a6b48);
      }
      if (p.isRanged || p.weapon === 'rifle') {
        // 어깨에 멘 총신
        g.roundRect(-TILE * 0.42, -TILE * 0.1, TILE * 0.84, 3, 1.5).fill(0x4a3826);
        g.roundRect(TILE * 0.1, -TILE * 0.16, TILE * 0.26, 2, 1).fill(0x2e2620);
      }
      if (p.sleeping) {
        g.circle(0, -TILE * 0.05, TILE * 0.38).fill({ color: 0x101418, alpha: 0.45 });
      }
      if (p.carrying) {
        const c = p.carrying.type === 'wood' ? 0x9a6b3f : p.carrying.type === 'stone' ? 0x9b9ba3 : 0xc24545;
        g.circle(TILE * 0.28, -TILE * 0.3, TILE * 0.16).fill(c).stroke({ width: 1, color: 0x202428 });
      }
      // 체력바 (가득이면 숨김)
      if (p.hp < p.maxHp) {
        const w = TILE * 0.9;
        const frac = Math.max(0, p.hp / p.maxHp);
        g.rect(-w / 2, -TILE * 0.62, w, 3).fill({ color: 0x101418, alpha: 0.8 });
        g.rect(-w / 2, -TILE * 0.62, w * frac, 3)
          .fill(frac > 0.5 ? 0x6fc46f : frac > 0.25 ? 0xd6a73c : 0xd64541);
      }
    }
  }

  private drawShots() {
    const g = this.shotG;
    g.clear();
    for (const s of this.game.shots) {
      g.moveTo(s.x0 * TILE, s.y0 * TILE)
        .lineTo(s.x1 * TILE, s.y1 * TILE)
        .stroke({ width: 2, color: s.color, alpha: Math.min(1, s.ttl / 0.1) });
    }
  }

  private drawNight() {
    const g = this.nightG;
    g.clear();
    if (this.game.isWinter) {
      // 겨울: 차가운 색조
      g.rect(0, 0, this.app.screen.width, this.app.screen.height)
        .fill({ color: 0xbcd4e8, alpha: 0.14 });
    }
    const dark = this.game.darkness;
    if (dark > 0.01) {
      g.rect(0, 0, this.app.screen.width, this.app.screen.height)
        .fill({ color: 0x0a1430, alpha: dark * 0.5 });
    }
  }
}
