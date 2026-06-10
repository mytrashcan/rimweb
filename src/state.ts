import type { Tool } from './types';
import type { Pawn } from './pawn';

/** UI와 입력 처리가 공유하는 상태 */
export const uiState = {
  tool: 'select' as Tool,
  /** 선택된 정착민들 (드래그 박스로 다중 선택 가능) */
  selectedPawns: [] as Pawn[],
  /** 선택된 타일들 (나무/바위) — 패널에서 일괄 지정용 */
  selectedTiles: [] as number[],
  selectedTileKind: null as 'tree' | 'rock' | null,
};

export function clearSelection() {
  uiState.selectedPawns = [];
  uiState.selectedTiles = [];
  uiState.selectedTileKind = null;
}
