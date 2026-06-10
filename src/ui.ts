import type { Game } from './game';
import type { Tool, WorkType } from './types';
import { WORK_TYPES, WORK_LABELS } from './types';
import { uiState } from './state';
import type { Pawn } from './pawn';

const TOOLS: { id: Tool; label: string }[] = [
  { id: 'select', label: '👆 선택' },
  { id: 'chop', label: '🪓 벌목' },
  { id: 'mine', label: '⛏️ 채굴' },
  { id: 'wall', label: '🧱 벽 (목재 2)' },
  { id: 'bed', label: '🛏️ 침대 (목재 6)' },
  { id: 'stockpile', label: '📦 비축구역' },
  { id: 'farm', label: '🌾 경작지' },
  { id: 'cancel', label: '❌ 취소' },
];

export class UI {
  private topbar = document.getElementById('topbar')!;
  private speedbar = document.getElementById('speedbar')!;
  private toolbar = document.getElementById('toolbar')!;
  private pawnpanel = document.getElementById('pawnpanel')!;
  private workpanel = document.getElementById('workpanel')!;
  private messagesEl = document.getElementById('messages')!;
  private toolButtons = new Map<Tool, HTMLButtonElement>();
  private speedButtons: HTMLButtonElement[] = [];
  private workCells = new Map<Pawn, Map<WorkType, HTMLTableCellElement>>();
  private pawnpanelHtml = '';

  constructor(private game: Game) {
    // 도구 버튼
    for (const t of TOOLS) {
      const btn = document.createElement('button');
      btn.textContent = t.label;
      btn.onclick = () => {
        uiState.tool = t.id;
        if (t.id !== 'select') uiState.selected = null;
      };
      this.toolbar.appendChild(btn);
      this.toolButtons.set(t.id, btn);
    }
    // 배속 버튼
    ['⏸', '▶', '▶▶', '▶▶▶'].forEach((label, i) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.onclick = () => (this.game.speedIdx = i);
      this.speedbar.appendChild(btn);
      this.speedButtons.push(btn);
    });
    // 저장 / 불러오기
    const flash = (btn: HTMLButtonElement, text: string) => {
      const orig = btn.textContent;
      btn.textContent = text;
      setTimeout(() => (btn.textContent = orig), 900);
    };
    const saveBtn = document.createElement('button');
    saveBtn.textContent = '💾';
    saveBtn.title = '저장';
    saveBtn.onclick = () => flash(saveBtn, this.game.save() ? '✔' : '✖');
    const loadBtn = document.createElement('button');
    loadBtn.textContent = '📂';
    loadBtn.title = '불러오기';
    loadBtn.onclick = () => {
      uiState.selected = null;
      flash(loadBtn, this.game.load() ? '✔' : '✖');
    };
    this.speedbar.append(saveBtn, loadBtn);
    // 작업 우선순위 표 토글
    const workBtn = document.createElement('button');
    workBtn.textContent = '📋';
    workBtn.title = '작업 우선순위';
    workBtn.onclick = () => {
      const open = this.workpanel.style.display === 'block';
      this.workpanel.style.display = open ? 'none' : 'block';
    };
    this.speedbar.append(workBtn);
    this.buildWorkPanel();
    // 패널은 innerHTML로 다시 그려지므로 버튼은 위임으로 처리.
    // click은 다시 그리는 사이에 유실될 수 있어 pointerdown 사용.
    this.pawnpanel.addEventListener('pointerdown', (e) => {
      const el = e.target as HTMLElement;
      const p = uiState.selected;
      if (el.dataset.action === 'draft' && p && !p.downed) {
        p.drafted = !p.drafted;
        if (!p.drafted) p.draftDest = null;
      }
    });
  }

  private buildWorkPanel() {
    this.workpanel.innerHTML = '<h3>작업 우선순위</h3>';
    const table = document.createElement('table');
    const head = table.insertRow();
    head.insertCell();
    for (const wt of WORK_TYPES) {
      const th = document.createElement('th');
      th.textContent = WORK_LABELS[wt];
      head.appendChild(th);
    }
    for (const p of this.game.pawns) {
      const row = table.insertRow();
      const nameCell = row.insertCell();
      nameCell.className = 'name';
      nameCell.textContent = p.name;
      const cells = new Map<WorkType, HTMLTableCellElement>();
      for (const wt of WORK_TYPES) {
        const cell = row.insertCell();
        cell.className = 'cell';
        // 1 → 2 → 3 → 4 → 안 함(0) → 1 순환
        cell.onclick = () => {
          p.priorities[wt] = (p.priorities[wt] + 1) % 5;
        };
        cells.set(wt, cell);
      }
      this.workCells.set(p, cells);
    }
    this.workpanel.appendChild(table);
    const note = document.createElement('div');
    note.className = 'note';
    note.textContent = '클릭으로 순환: 1(높음) → 4(낮음) → 안 함';
    this.workpanel.appendChild(note);
  }

  update() {
    const res = this.game.countResources();
    this.topbar.innerHTML =
      `<span class="res"><span class="dot" style="background:#9a6b3f"></span>목재 ${res.wood}</span>` +
      `<span class="res"><span class="dot" style="background:#9b9ba3"></span>석재 ${res.stone}</span>` +
      `<span class="res"><span class="dot" style="background:#c24545"></span>식량 ${res.food}</span>` +
      `<span class="sep"></span>` +
      `<span>${this.game.day}일차 ${this.game.clockText}${this.game.isNight ? ' 🌙' : ' ☀️'}</span>` +
      (this.game.raiders.length > 0
        ? `<span class="sep"></span><span style="color:#e07070">⚔ 습격 중 (${this.game.raiders.length})</span>`
        : '');

    this.speedButtons.forEach((b, i) =>
      b.classList.toggle('active', this.game.speedIdx === i),
    );
    for (const [id, btn] of this.toolButtons) {
      btn.classList.toggle('active', uiState.tool === id);
    }

    // 작업 우선순위 표 셀 갱신
    if (this.workpanel.style.display === 'block') {
      const PRIO_COLORS = ['', '#7ddc7d', '#c9d34b', '#d6a73c', '#8a93a3'];
      for (const [pawn, cells] of this.workCells) {
        for (const [wt, cell] of cells) {
          const v = pawn.priorities[wt];
          cell.textContent = v === 0 ? '–' : String(v);
          cell.style.color = v === 0 ? '#566' : PRIO_COLORS[v];
          cell.style.fontWeight = v === 1 ? 'bold' : 'normal';
        }
      }
    }

    // 메시지 알림
    const active = this.game.messages.filter((msg) => msg.until > this.game.time);
    this.messagesEl.innerHTML = active
      .map((msg) => `<div class="msg" style="opacity:${Math.min(1, (msg.until - this.game.time) / 3).toFixed(2)}">${msg.text}</div>`)
      .join('');

    const p = uiState.selected;
    if (p) {
      const status = p.downed ? '쓰러짐 😵' : p.job ? p.job.label : p.drafted ? '징집됨 (우클릭: 이동)' : '대기 중';
      this.pawnpanel.style.display = 'block';
      const html =
        `<h3><span class="dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#${p.color.toString(16).padStart(6, '0')}"></span> ${p.name}</h3>` +
        `<div class="jobline">${status}</div>` +
        `<div class="barlabel">체력</div>` +
        `<div class="bar"><div style="width:${((p.hp / p.maxHp) * 100).toFixed(0)}%;background:${p.hp < p.maxHp * 0.3 ? '#c24545' : '#6fc46f'}"></div></div>` +
        `<div class="barlabel">포만감</div>` +
        `<div class="bar"><div style="width:${(p.hunger * 100).toFixed(0)}%;background:${p.hunger < 0.3 ? '#c24545' : '#d6a73c'}"></div></div>` +
        `<div class="barlabel">휴식</div>` +
        `<div class="bar"><div style="width:${(p.rest * 100).toFixed(0)}%;background:${p.rest < 0.15 ? '#c24545' : '#5a8ad6'}"></div></div>` +
        `<button data-action="draft" class="${p.drafted ? 'drafted' : ''}">${p.drafted ? '🚩 징집 해제 (R)' : '⚔ 징집 (R)'}</button>`;
      if (html !== this.pawnpanelHtml) {
        this.pawnpanelHtml = html;
        this.pawnpanel.innerHTML = html;
      }
    } else {
      this.pawnpanel.style.display = 'none';
      this.pawnpanelHtml = '';
    }
  }
}
