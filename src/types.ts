export const enum Terrain {
  Grass = 0,
  Dirt = 1,
  Water = 2,
}

export const enum Plant {
  None = 0,
  Tree = 1,
  Bush = 2,
  Crop = 3,
}

export const enum Structure {
  None = 0,
  Wall = 1,
  Bed = 2,
  Stove = 3,
  Grave = 4,
  Turret = 5,
}

export const enum Designation {
  None = 0,
  Chop = 1,
  Mine = 2,
}

export type ItemType = 'wood' | 'stone' | 'food' | 'meal' | 'rifle' | 'corpse';

export interface ItemStack {
  type: ItemType;
  count: number;
}

export interface Blueprint {
  kind: Structure.Wall | Structure.Bed | Structure.Stove | Structure.Grave | Structure.Turret;
  woodNeed: number;
  woodHas: number;
  workLeft: number;
}

/** 작업 종류 — 배열 순서가 같은 우선순위 내의 처리 순서 */
export const WORK_TYPES = ['construct', 'cook', 'grow', 'mine', 'chop', 'hunt', 'haul'] as const;
export type WorkType = (typeof WORK_TYPES)[number];

export const WORK_LABELS: Record<WorkType, string> = {
  construct: '건설',
  cook: '요리',
  grow: '농사',
  mine: '채굴',
  chop: '벌목',
  hunt: '사냥',
  haul: '운반',
};

export function defaultPriorities(): Record<WorkType, number> {
  return { construct: 3, cook: 3, grow: 3, mine: 3, chop: 3, hunt: 3, haul: 3 };
}

export type Tool =
  | 'select'
  | 'chop'
  | 'mine'
  | 'wall'
  | 'bed'
  | 'stove'
  | 'grave'
  | 'turret'
  | 'stockpile'
  | 'farm'
  | 'cancel';
