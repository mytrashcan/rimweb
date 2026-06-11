import type { Game } from './game';
import type { Tool, WorkType } from './types';
import { WORK_TYPES, WORK_LABELS } from './types';
import { uiState, clearSelection } from './state';
import { toggleDraftSelected, designateSelectedTiles, designateSelectedAnimals } from './selection';
import type { Pawn } from './pawn';

const TOOLS: { id: Tool; label: string }[] = [
  { id: 'select', label: '👆 선택' },
  { id: 'chop', label: '🪓 벌목' },
  { id: 'mine', label: '⛏️ 채굴' },
  { id: 'wall', label: '🧱 벽 (목재 2)' },
  { id: 'bed', label: '🛏️ 침대 (목재 6)' },
  { id: 'stove', label: '🍳 화덕 (목재 4)' },
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
  private knownPawns: Pawn[] = [];

  constructor(private game: Game) {
    // 도구 버튼
    for (const t of TOOLS) {
      const btn = document.createElement('button');
      btn.textContent = t.label;
      btn.onclick = () => {
        uiState.tool = t.id;
        if (t.id !== 'select') clearSelection();
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
      clearSelection();
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
      const action = el.dataset.action;
      if (action === 'draft') {
        toggleDraftSelected();
      } else if (action === 'pick') {
        // 다중 선택 목록에서 한 명 클릭 → 단독 선택
        const p = uiState.selectedPawns[Number(el.dataset.idx)];
        if (p) uiState.selectedPawns = [p];
      } else if (action === 'designate') {
        designateSelectedTiles(this.game);
      } else if (action === 'hunt') {
        designateSelectedAnimals();
      }
    });
  }

  private buildWorkPanel() {
    this.knownPawns = [...this.game.pawns];
    this.workCells.clear();
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
    // 정착민이 합류/교체되면(불러오기 포함) 작업 표를 다시 만든다
    if (
      this.knownPawns.length !== this.game.pawns.length ||
      this.knownPawns.some((p, i) => p !== this.game.pawns[i])
    ) {
      this.buildWorkPanel();
    }

    const res = this.game.countResources();
    this.topbar.innerHTML =
      `<span class="res"><span class="dot" style="background:#9a6b3f"></span>목재 ${res.wood}</span>` +
      `<span class="res"><span class="dot" style="background:#9b9ba3"></span>석재 ${res.stone}</span>` +
      `<span class="res"><span class="dot" style="background:#c24545"></span>식량 ${res.food}</span>` +
      `<span class="res"><span class="dot" style="background:#e8d9b0"></span>요리 ${res.meal}</span>` +
      (res.rifle > 0 ? `<span class="res"><span class="dot" style="background:#4a3826"></span>소총 ${res.rifle}</span>` : '') +
      `<span class="sep"></span>` +
      `<span>${this.game.seasonName} ${this.game.day}일차 ${this.game.clockText}${this.game.isNight ? ' 🌙' : ''}</span>` +
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

    const html = this.buildPawnPanelHtml();
    if (html === '') {
      this.pawnpanel.style.display = 'none';
      this.pawnpanelHtml = '';
    } else {
      this.pawnpanel.style.display = 'block';
      if (html !== this.pawnpanelHtml) {
        this.pawnpanelHtml = html;
        this.pawnpanel.innerHTML = html;
      }
    }
  }

  /** 선택 상태에 따른 패널 내용. 빈 문자열 = 패널 숨김 */
  private buildPawnPanelHtml(): string {
    const sel = uiState.selectedPawns;

    // 단일 정착민: 상세 정보
    if (sel.length === 1) {
      const p = sel[0];
      const status = p.downed ? '쓰러짐 😵' : p.job ? p.job.label : p.drafted ? '징집됨 (우클릭: 이동)' : '대기 중';
      const factors = p
        .moodFactors(this.game)
        .map((f) =>
          `<span style="color:${f.value < 0 ? '#c98080' : '#80c980'}">${f.label} ${f.value > 0 ? '+' : ''}${Math.round(f.value * 100)}</span>`,
        )
        .join(' · ');
      return (
        `<h3>${dot(p.color)} ${p.name}${p.weapon === 'rifle' ? ' 🔫' : ''}</h3>` +
        `<div class="jobline">${status}</div>` +
        `<div class="barlabel">체력</div>` +
        bar(p.hp / p.maxHp, p.hp < p.maxHp * 0.3 ? '#c24545' : '#6fc46f') +
        `<div class="barlabel">기분</div>` +
        bar(p.mood, p.mood < 0.25 ? '#c24545' : p.mood < 0.45 ? '#d6a73c' : '#9b87d6') +
        (factors ? `<div class="barlabel" style="margin:-4px 0 6px;line-height:1.6">${factors}</div>` : '') +
        `<div class="barlabel">포만감</div>` +
        bar(p.hunger, p.hunger < 0.3 ? '#c24545' : '#d6a73c') +
        `<div class="barlabel">휴식</div>` +
        bar(p.rest, p.rest < 0.15 ? '#c24545' : '#5a8ad6') +
        draftButton(p.drafted)
      );
    }

    // 다중 정착민: 요약 목록 + 일괄 징집
    if (sel.length > 1) {
      const rows = sel
        .map((p, i) =>
          `<div class="jobline" data-action="pick" data-idx="${i}" style="cursor:pointer">` +
          `${dot(p.color)} ${p.name} · ${Math.round(p.hp)}HP` +
          `${p.downed ? ' 😵' : p.drafted ? ' ⚔' : ''}</div>`,
        )
        .join('');
      const anyUndrafted = sel.some((p) => !p.downed && !p.drafted);
      return `<h3>정착민 ${sel.length}명</h3>` + rows + draftButton(!anyUndrafted);
    }

    // 동물 선택: 사냥 지정
    if (uiState.selectedAnimals.length > 0) {
      const n = uiState.selectedAnimals.length;
      const marked = uiState.selectedAnimals.filter((a) => a.hunted).length;
      return (
        `<h3>🦌 사슴 ${n}마리${marked > 0 ? ` (사냥 표시 ${marked})` : ''}</h3>` +
        `<button data-action="hunt">🏹 사냥 지정</button>`
      );
    }

    // 나무/바위 선택: 일괄 지정
    if (uiState.selectedTiles.length > 0) {
      const n = uiState.selectedTiles.length;
      const tree = uiState.selectedTileKind === 'tree';
      return (
        `<h3>${tree ? `🌲 나무 ${n}그루` : `🪨 바위 ${n}칸`}</h3>` +
        `<button data-action="designate">${tree ? '🪓 벌목 지정' : '⛏️ 채굴 지정'}</button>`
      );
    }
    return '';
  }
}

function dot(color: number): string {
  return `<span class="dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#${color.toString(16).padStart(6, '0')}"></span>`;
}

function bar(frac: number, color: string): string {
  return `<div class="bar"><div style="width:${(frac * 100).toFixed(0)}%;background:${color}"></div></div>`;
}

function draftButton(drafted: boolean): string {
  return `<button data-action="draft" class="${drafted ? 'drafted' : ''}">${drafted ? '🚩 징집 해제 (R)' : '⚔ 징집 (R)'}</button>`;
}
