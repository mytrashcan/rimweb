import type { Application } from 'pixi.js';
import {
  WALL_WOOD_COST, WALL_WORK, BED_WOOD_COST, BED_WORK,
  STOVE_WOOD_COST, STOVE_WORK, GRAVE_WORK,
  TURRET_WOOD_COST, TURRET_WORK,
} from './constants';
import { Plant, Structure, Designation } from './map';
import type { Game } from './game';
import type { Camera } from './camera';
import type { Renderer } from './renderer';
import { uiState, clearSelection } from './state';
import { applySelection, issueOrders, toggleDraftSelected, rectBounds } from './selection';
import type { Rect } from './selection';

export function setupInput(app: Application, game: Game, camera: Camera, renderer: Renderer) {
  const canvas = app.canvas;
  let panning = false;
  let dragging = false;
  let dragStart = { x: 0, y: 0 };
  let lastPointer = { x: 0, y: 0 };
  let rightDownAt = { x: 0, y: 0 }; // 우클릭 '클릭'과 '드래그 팬' 구분용

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    lastPointer = { x: e.clientX, y: e.clientY };
    if (e.button === 1 || e.button === 2) {
      panning = true;
      rightDownAt = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button === 0) {
      const t = camera.screenToTile(e.clientX, e.clientY);
      if (!game.map.inBounds(t.x, t.y)) return;
      dragging = true;
      dragStart = t;
      renderer.dragRect = { x0: t.x, y0: t.y, x1: t.x, y1: t.y };
      canvas.setPointerCapture(e.pointerId);
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (panning) {
      camera.pan(e.clientX - lastPointer.x, e.clientY - lastPointer.y);
    } else if (dragging) {
      const t = camera.screenToTile(e.clientX, e.clientY);
      renderer.dragRect = {
        x0: dragStart.x, y0: dragStart.y,
        x1: Math.max(0, Math.min(game.map.w - 1, t.x)),
        y1: Math.max(0, Math.min(game.map.h - 1, t.y)),
      };
    }
    lastPointer = { x: e.clientX, y: e.clientY };
  });

  canvas.addEventListener('pointerup', (e) => {
    if (panning && (e.button === 1 || e.button === 2)) {
      panning = false;
      // 거의 움직이지 않은 우클릭 = 선택된 정착민들에게 직접 명령
      const moved = Math.hypot(e.clientX - rightDownAt.x, e.clientY - rightDownAt.y);
      if (e.button === 2 && moved < 6) {
        const t = camera.screenToTile(e.clientX, e.clientY);
        if (game.map.inBounds(t.x, t.y)) issueOrders(game, t.x, t.y);
      }
    }
    if (dragging && e.button === 0) {
      dragging = false;
      const rect = renderer.dragRect;
      renderer.dragRect = null;
      if (!rect) return;
      if (uiState.tool === 'select') applySelection(game, camera, rect, e.clientX, e.clientY);
      else applyTool(game, rect);
    }
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    camera.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 1 / 1.15);
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      game.speedIdx = game.speedIdx === 0 ? 1 : 0;
    } else if (e.key === '1') game.speedIdx = 1;
    else if (e.key === '2') game.speedIdx = 2;
    else if (e.key === '3') game.speedIdx = 3;
    else if (e.code === 'KeyR') toggleDraftSelected();
    else if (e.key === 'Escape') {
      uiState.tool = 'select';
      clearSelection();
    }
  });
}

function applyTool(game: Game, rect: Rect) {
  const m = game.map;
  const { xa, xb, ya, yb } = rectBounds(rect);

  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      if (!m.inBounds(x, y)) continue;
      const i = m.idx(x, y);
      switch (uiState.tool) {
        case 'chop':
          if (m.plant[i] === Plant.Tree) m.designation[i] = Designation.Chop;
          break;
        case 'mine':
          if (m.rock[i]) m.designation[i] = Designation.Mine;
          break;
        case 'wall':
          if (m.buildableClear(i) && !m.stockpile[i]) {
            m.blueprints.set(i, { kind: Structure.Wall, woodNeed: WALL_WOOD_COST, woodHas: 0, workLeft: WALL_WORK });
          }
          break;
        case 'bed':
          if (m.buildableClear(i) && !m.stockpile[i]) {
            m.blueprints.set(i, { kind: Structure.Bed, woodNeed: BED_WOOD_COST, woodHas: 0, workLeft: BED_WORK });
          }
          break;
        case 'stove':
          if (m.buildableClear(i) && !m.stockpile[i]) {
            m.blueprints.set(i, { kind: Structure.Stove, woodNeed: STOVE_WOOD_COST, woodHas: 0, workLeft: STOVE_WORK });
          }
          break;
        case 'grave':
          // 무덤은 자재 없이 파기만 하면 된다
          if (m.buildableClear(i) && !m.stockpile[i]) {
            m.blueprints.set(i, { kind: Structure.Grave, woodNeed: 0, woodHas: 0, workLeft: GRAVE_WORK });
          }
          break;
        case 'turret':
          if (m.buildableClear(i) && !m.stockpile[i]) {
            m.blueprints.set(i, { kind: Structure.Turret, woodNeed: TURRET_WOOD_COST, woodHas: 0, workLeft: TURRET_WORK });
          }
          break;
        case 'stockpile':
          if (m.walkableIdx(i) && m.structure[i] === Structure.None && !m.blueprints.has(i)) {
            m.stockpile[i] = 1;
            m.farm[i] = 0;
          }
          break;
        case 'farm':
          // 경작지: 통행 가능한 빈 땅 (나무·덤불은 먼저 제거해야 함)
          if (m.walkableIdx(i) && m.structure[i] === Structure.None &&
              (m.plant[i] === Plant.None || m.plant[i] === Plant.Crop) && !m.blueprints.has(i)) {
            m.farm[i] = 1;
            m.stockpile[i] = 0;
          }
          break;
        case 'cancel': {
          m.designation[i] = Designation.None;
          m.stockpile[i] = 0;
          m.farm[i] = 0;
          const bp = m.blueprints.get(i);
          if (bp) {
            if (bp.woodHas > 0) m.dropItem(i, 'wood', bp.woodHas); // 배달된 자재 반환
            m.blueprints.delete(i);
          }
          break;
        }
      }
    }
  }
}
