import type { Tool } from './types';
import type { Pawn } from './pawn';

/** UI와 입력 처리가 공유하는 상태 */
export const uiState = {
  tool: 'select' as Tool,
  selected: null as Pawn | null,
};
