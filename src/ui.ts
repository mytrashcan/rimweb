import type { Game } from './game';
import type { Tool } from './types';
import { uiState } from './state';

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
  private toolButtons = new Map<Tool, HTMLButtonElement>();
  private speedButtons: HTMLButtonElement[] = [];

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
  }

  update() {
    const res = this.game.countResources();
    this.topbar.innerHTML =
      `<span class="res"><span class="dot" style="background:#9a6b3f"></span>목재 ${res.wood}</span>` +
      `<span class="res"><span class="dot" style="background:#9b9ba3"></span>석재 ${res.stone}</span>` +
      `<span class="res"><span class="dot" style="background:#c24545"></span>식량 ${res.food}</span>` +
      `<span class="sep"></span>` +
      `<span>${this.game.day}일차 ${this.game.clockText}${this.game.isNight ? ' 🌙' : ' ☀️'}</span>`;

    this.speedButtons.forEach((b, i) =>
      b.classList.toggle('active', this.game.speedIdx === i),
    );
    for (const [id, btn] of this.toolButtons) {
      btn.classList.toggle('active', uiState.tool === id);
    }

    const p = uiState.selected;
    if (p) {
      this.pawnpanel.style.display = 'block';
      this.pawnpanel.innerHTML =
        `<h3><span class="dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#${p.color.toString(16).padStart(6, '0')}"></span> ${p.name}</h3>` +
        `<div class="jobline">${p.job ? p.job.label : '대기 중'}</div>` +
        `<div class="barlabel">포만감</div>` +
        `<div class="bar"><div style="width:${(p.hunger * 100).toFixed(0)}%;background:${p.hunger < 0.3 ? '#c24545' : '#d6a73c'}"></div></div>` +
        `<div class="barlabel">휴식</div>` +
        `<div class="bar"><div style="width:${(p.rest * 100).toFixed(0)}%;background:${p.rest < 0.15 ? '#c24545' : '#5a8ad6'}"></div></div>`;
    } else {
      this.pawnpanel.style.display = 'none';
    }
  }
}
