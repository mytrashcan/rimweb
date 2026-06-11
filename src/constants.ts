export const TILE = 20; // 줌 1배 기준 타일 한 변의 픽셀 크기
export const MAP_W = 64;
export const MAP_H = 64;

export const DAY_SECONDS = 240; // 게임 내 하루 = 1배속 기준 4분
export const SEASON_DAYS = 3; // 계절당 일수
export const SEASONS = ['🌱 봄', '☀️ 여름', '🍂 가을', '❄️ 겨울'] as const;
/** 계절별 작물/덤불 성장 배율 (겨울엔 자라지 않는다) */
export const SEASON_GROWTH = [1, 1.2, 0.7, 0] as const;
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

export const SOW_SECONDS = 1.5;
export const HARVEST_SECONDS = 2;
export const CROP_GROW_SECONDS = 300; // 파종 → 수확까지
export const FOOD_PER_HARVEST = 3;

// 인구
export const MAX_COLONISTS = 6;
export const FIRST_JOIN_TIME = 2.5; // 일 단위
export const JOIN_INTERVAL_MIN = 2; // 일
export const JOIN_INTERVAL_RAND = 1.5;

// 야생동물
export const ANIMAL_HP = 40;
export const MEAT_PER_ANIMAL = 6;
export const MAX_ANIMALS = 5;
export const ANIMAL_FLEE_SECONDS = 6;

// 기분
export const MOOD_BASE = 0.65;
export const MOOD_LERP_SECONDS = 30; // 목표 기분으로 수렴하는 시간 상수
export const MOOD_BREAK_THRESHOLD = 0.25;
export const MOOD_BREAK_DELAY = 25; // 임계 이하로 이만큼 지속되면 멘탈 브레이크
export const BREAK_DURATION = 30;
export const BREAK_CATHARSIS = 0.25; // 브레이크 후 기분 회복량

// 전투
export const COLONIST_HP = 100;
export const RAIDER_HP = 70;
export const SHOOT_RANGE = 7; // 타일
export const SHOOT_COOLDOWN = 1.2;
export const SHOOT_DAMAGE = 12;
export const MELEE_RANGE = 1.5;
export const MELEE_COOLDOWN = 1.0;
export const MELEE_DAMAGE = 8;
export const WALL_HP = 100;
export const RANGED_RAIDER_CHANCE = 0.4;
export const RAIDER_SHOOT_RANGE = 6;
export const RAIDER_SHOOT_COOLDOWN = 1.6;
export const RAIDER_SHOOT_DAMAGE = 9;
export const RAIDER_HOLD_RANGE = 5; // 이 거리 안으로 들어오면 멈춰서 사격
export const DOWNED_RECOVER_SECONDS = 70; // 쓰러진 정착민이 다시 일어나기까지
export const HP_REGEN = 0.6; // 초당 (수면 중엔 3배)
export const FIRST_RAID_TIME = 1.8; // 일 단위
export const RAID_INTERVAL_MIN = 1.2; // 일
export const RAID_INTERVAL_RAND = 1.0;

export const HUNGER_SEEK_FOOD = 0.3; // 이 밑으로 떨어지면 식사 우선
export const REST_COLLAPSE = 0.12; // 이 밑이면 어디서든 잠
export const NIGHT_SLEEP_REST = 0.7; // 밤이고 이 밑이면 취침
