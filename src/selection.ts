import { Plant, Designation, spiralTiles } from './map';
import { makeForcedJob, MoveJob, HuntJob } from './jobs';
import { uiState, clearSelection } from './state';
import type { Game } from './game';
import type { Camera } from './camera';

export type Rect = { x0: number; y0: number; x1: number; y1: number };

/** 드래그 영역을 (좌상단, 우하단)으로 정규화 */
export function rectBounds(rect: Rect) {
  return {
    xa: Math.min(rect.x0, rect.x1),
    xb: Math.max(rect.x0, rect.x1),
    ya: Math.min(rect.y0, rect.y1),
    yb: Math.max(rect.y0, rect.y1),
  };
}

/** 선택 도구: 클릭이면 정착민 하나, 드래그면 정착민들 → 나무들 → 바위들 순으로 선택 */
export function applySelection(game: Game, camera: Camera, rect: Rect, sx: number, sy: number) {
  const m = game.map;
  const { xa, xb, ya, yb } = rectBounds(rect);
  clearSelection();

  // 한 칸 클릭: 근처 정착민 하나만
  if (xa === xb && ya === yb) {
    const t = camera.screenToTile(sx, sy);
    let best = null;
    let bestDist = 1.2;
    for (const p of game.pawns) {
      const d = Math.hypot(p.x - (t.x + 0.5), p.y - (t.y + 0.5));
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    if (best) uiState.selectedPawns = [best];
    return;
  }

  // 드래그 박스: 정착민 우선
  const inBox = (p: { tileX: number; tileY: number }) =>
    p.tileX >= xa && p.tileX <= xb && p.tileY >= ya && p.tileY <= yb;
  const pawns = game.pawns.filter(inBox);
  if (pawns.length > 0) {
    uiState.selectedPawns = pawns;
    return;
  }
  // 정착민이 없으면 동물 → 나무 → 바위
  const animals = game.animals.filter((a) => !a.dead && inBox(a));
  if (animals.length > 0) {
    uiState.selectedAnimals = animals;
    return;
  }
  for (const [kind, match] of [
    ['tree', (i: number) => m.plant[i] === Plant.Tree],
    ['rock', (i: number) => m.rock[i] === 1],
  ] as const) {
    const tiles: number[] = [];
    for (let y = ya; y <= yb; y++) {
      for (let x = xa; x <= xb; x++) {
        const i = m.idx(x, y);
        if (match(i)) tiles.push(i);
      }
    }
    if (tiles.length > 0) {
      uiState.selectedTiles = tiles;
      uiState.selectedTileKind = kind;
      return;
    }
  }
}

/** 선택된 정착민 전원 징집/해제 (한 명이라도 미징집이면 전원 징집) */
export function toggleDraftSelected() {
  const sel = uiState.selectedPawns.filter((p) => !p.downed);
  if (sel.length === 0) return;
  const draft = sel.some((p) => !p.drafted);
  for (const p of sel) {
    p.drafted = draft;
    if (!draft) p.draftDest = null;
  }
}

/** 선택된 나무/바위를 일괄 벌목/채굴 지정 */
export function designateSelectedTiles(game: Game) {
  const des = uiState.selectedTileKind === 'tree' ? Designation.Chop : Designation.Mine;
  for (const i of uiState.selectedTiles) game.map.designation[i] = des;
  clearSelection();
}

/** 선택된 동물들을 사냥 지정 */
export function designateSelectedAnimals() {
  for (const a of uiState.selectedAnimals) a.hunted = true;
  clearSelection();
}

/** 우클릭 직접 명령을 선택된 정착민 전원에게 내린다 */
export function issueOrders(game: Game, tx: number, ty: number) {
  // 멘탈 브레이크 중인 정착민은 명령을 받지 않는다 (예약 누수 방지)
  const sel = uiState.selectedPawns.filter(
    (p) => !p.downed && !(p.job && p.job.uninterruptible),
  );
  if (sel.length === 0) return;

  // 산개 배치 지점을 미리 수집 (목표 주변의 통행 가능 타일들)
  const spots: { x: number; y: number }[] = [];
  for (const [x, y] of spiralTiles(tx, ty, 4)) {
    if (game.map.walkable(x, y)) spots.push({ x, y });
    if (spots.length >= sel.length) break;
  }

  // 우클릭한 곳에 동물이 있으면 사냥 명령
  const animal = game.animals.find(
    (a) => !a.dead && Math.hypot(a.x - (tx + 0.5), a.y - (ty + 0.5)) < 1.1,
  );

  for (const p of sel) {
    if (p.drafted) {
      const spot = spots.shift();
      if (spot) p.draftDest = spot;
      continue;
    }
    if (animal) {
      animal.hunted = true;
      if (!animal.targeted) {
        p.assignForcedJob(game, new HuntJob(animal));
        continue;
      }
    }
    const job = makeForcedJob(p, game, tx, ty);
    if (job) {
      p.assignForcedJob(game, job);
    } else {
      // 대상이 이미 예약됐으면(다른 선택 폰이 차지) 근처로 이동
      const spot = spots.shift();
      if (spot) p.assignForcedJob(game, new MoveJob(spot.x, spot.y));
    }
  }
}
