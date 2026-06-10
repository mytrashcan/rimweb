export const TILE = 20; // 줌 1배 기준 타일 한 변의 픽셀 크기
export const MAP_W = 64;
export const MAP_H = 64;

export const DAY_SECONDS = 240; // 게임 내 하루 = 1배속 기준 4분
export const HUNGER_SECONDS = 260; // 만복 → 굶주림까지 걸리는 시간
export const REST_SECONDS = 420; // 완전 휴식 → 탈진까지 걸리는 시간

export const PAWN_SPEED = 3.4; // 타일/초

export const WOOD_PER_TREE = 4;
export const STONE_PER_ROCK = 3;

export const WALL_WOOD_COST = 2;
export const WALL_WORK = 50;
export const BED_WOOD_COST = 6;
export const BED_WORK = 100;
export const CONSTRUCT_SPEED = 35; // 작업량/초

export const CHOP_SECONDS = 2.5;
export const MINE_SECONDS = 3.5;
export const EAT_SECONDS = 2;
export const BUSH_EAT_SECONDS = 3.5;
export const BUSH_REGROW_SECONDS = 280;

export const HUNGER_SEEK_FOOD = 0.3; // 이 밑으로 떨어지면 식사 우선
export const REST_COLLAPSE = 0.12; // 이 밑이면 어디서든 잠
export const NIGHT_SLEEP_REST = 0.7; // 밤이고 이 밑이면 취침
