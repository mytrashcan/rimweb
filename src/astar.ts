import type { GameMap } from './map';

interface Node {
  idx: number;
  f: number;
}

// 이진 힙 (최소 f 우선)
class Heap {
  arr: Node[] = [];
  push(n: Node) {
    this.arr.push(n);
    let i = this.arr.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.arr[p].f <= this.arr[i].f) break;
      [this.arr[p], this.arr[i]] = [this.arr[i], this.arr[p]];
      i = p;
    }
  }
  pop(): Node | undefined {
    const top = this.arr[0];
    const last = this.arr.pop();
    if (this.arr.length > 0 && last) {
      this.arr[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.arr.length && this.arr[l].f < this.arr[m].f) m = l;
        if (r < this.arr.length && this.arr[r].f < this.arr[m].f) m = r;
        if (m === i) break;
        [this.arr[m], this.arr[i]] = [this.arr[i], this.arr[m]];
        i = m;
      }
    }
    return top;
  }
  get size() {
    return this.arr.length;
  }
}

const DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

function octile(dx: number, dy: number): number {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  return Math.max(ax, ay) + 0.414 * Math.min(ax, ay);
}

/**
 * 8방향 A*. adjacent=true면 목표 타일의 4방 이웃까지 도달하면 성공
 * (목표 자체가 통행 불가한 바위/벽일 때 사용).
 */
export function findPath(
  map: GameMap,
  sx: number, sy: number,
  tx: number, ty: number,
  adjacent = false,
): { x: number; y: number }[] | null {
  const w = map.w;
  const size = w * map.h;
  if (!map.inBounds(tx, ty)) return null;
  if (!adjacent && !map.walkable(tx, ty)) return null;
  if (sx === tx && sy === ty) return [];

  const g = new Float64Array(size).fill(Infinity);
  const came = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const open = new Heap();

  const start = sy * w + sx;
  g[start] = 0;
  open.push({ idx: start, f: octile(tx - sx, ty - sy) });

  const isGoal = (x: number, y: number) =>
    adjacent
      ? Math.abs(x - tx) + Math.abs(y - ty) <= 1
      : x === tx && y === ty;

  while (open.size > 0) {
    const cur = open.pop()!;
    const ci = cur.idx;
    if (closed[ci]) continue;
    closed[ci] = 1;
    const cx = ci % w;
    const cy = (ci / w) | 0;

    if (isGoal(cx, cy)) {
      const path: { x: number; y: number }[] = [];
      let i = ci;
      while (i !== start) {
        path.push({ x: i % w, y: (i / w) | 0 });
        i = came[i];
      }
      path.reverse();
      return path;
    }

    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!map.inBounds(nx, ny) || !map.walkable(nx, ny)) continue;
      // 대각선 이동은 양쪽 직교 칸이 모두 열려 있어야 허용 (모서리 끼임 방지)
      if (dx !== 0 && dy !== 0) {
        if (!map.walkable(cx + dx, cy) || !map.walkable(cx, cy + dy)) continue;
      }
      const ni = ny * w + nx;
      if (closed[ni]) continue;
      const cost = dx !== 0 && dy !== 0 ? 1.414 : 1;
      const ng = g[ci] + cost;
      if (ng < g[ni]) {
        g[ni] = ng;
        came[ni] = ci;
        open.push({ idx: ni, f: ng + octile(tx - nx, ty - ny) });
      }
    }
  }
  return null;
}

/**
 * 보행 가능 타일을 따라 BFS로 퍼져 나가며 predicate를 만족하는 가장 가까운
 * 타일 인덱스를 반환. 통행 불가 타일(바위 등)도 검사 대상에는 포함되지만
 * 그 너머로 확장하지는 않는다 → 결과는 항상 "걸어서 닿을 수 있는" 타일.
 */
export function bfsNearest(
  map: GameMap,
  sx: number, sy: number,
  pred: (idx: number) => boolean,
): number | null {
  const w = map.w;
  const size = w * map.h;
  const visited = new Uint8Array(size);
  const queue: number[] = [sy * w + sx];
  visited[queue[0]] = 1;
  let head = 0;
  while (head < queue.length) {
    const ci = queue[head++];
    if (pred(ci)) return ci;
    const cx = ci % w;
    const cy = (ci / w) | 0;
    if (ci !== sy * w + sx && !map.walkable(cx, cy)) continue;
    for (const [dx, dy] of DIRS) {
      if (dx !== 0 && dy !== 0) continue; // BFS는 4방향이면 충분
      const nx = cx + dx;
      const ny = cy + dy;
      if (!map.inBounds(nx, ny)) continue;
      const ni = ny * w + nx;
      if (!visited[ni]) {
        visited[ni] = 1;
        queue.push(ni);
      }
    }
  }
  return null;
}
