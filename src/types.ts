export const enum Terrain {
  Grass = 0,
  Dirt = 1,
  Water = 2,
}

export const enum Plant {
  None = 0,
  Tree = 1,
  Bush = 2,
}

export const enum Structure {
  None = 0,
  Wall = 1,
  Bed = 2,
}

export const enum Designation {
  None = 0,
  Chop = 1,
  Mine = 2,
}

export type ItemType = 'wood' | 'stone' | 'food';

export interface ItemStack {
  type: ItemType;
  count: number;
}

export interface Blueprint {
  kind: Structure.Wall | Structure.Bed;
  woodNeed: number;
  woodHas: number;
  workLeft: number;
}

export type Tool =
  | 'select'
  | 'chop'
  | 'mine'
  | 'wall'
  | 'bed'
  | 'stockpile'
  | 'cancel';
