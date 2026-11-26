export type ChatMessageKind = 'chat' | 'system' | 'dev' | 'error' | 'info';

export interface ChatMessage {
  id: number;
  text: string;
  kind: ChatMessageKind;
  time: number;
}

interface DOTEConsoleBridge {
  isOnline?: () => boolean;
  exec?: (cmd: string, args: string[]) => string | boolean | void;
  sendChat?: (text: string) => void;
  getFps?: () => number;
}

interface DOTEChatAPI {
  push: (text: string, kind?: ChatMessageKind) => void;
  open: () => void;
  close: () => void;
}

declare global {
  interface Window {
    DOTEConsole?: DOTEConsoleBridge;
    DOTEChat?: DOTEChatAPI;
  }
}

const STYLE_ID = 'dote-chat-console-styles';
const TOAST_TTL_MS = 5500;
const MAX_TOAST_LINES = 3;
const MAX_HISTORY = 80;

const ALWAYS_ALLOWED_CMDS = new Set(['help', 'clear', 'fps', 'dev']);
const DEV_CMDS = new Set([
  'res',
  'age',
  'pop',
  'spawn',
  'damage',
  'deplete',
  'fog',
  'speed',
]);

const DEV_QUICK_CHIPS: ReadonlyArray<{ label: string; cmd: string }> = [
  { label: '+5000 Res', cmd: '/res all 5000' },
  { label: 'Age 4', cmd: '/age 4' },
  { label: 'Fog', cmd: '/fog' },
  { label: '5 Samurai', cmd: '/spawn samurai 5' },
  { label: 'Damage', cmd: '/damage' },
  { label: 'Deplete', cmd: '/deplete' },
];

let initialized = false;
let isOpen = false;
let devEnabled = false;
let hasUnread = false;
let msgSeq = 0;

const messages: ChatMessage[] = [];
const toastTimers = new Map<number, number>();

let rootEl: HTMLDivElement | null = null;
let btnEl: HTMLButtonElement | null = null;
let toastBoxEl: HTMLDivElement | null = null;
let drawerEl: HTMLDivElement | null = null;
let logEl: HTMLDivElement | null = null;
let chipsEl: HTMLDivElement | null = null;
let devPillEl: HTMLSpanElement | null = null;
let inputEl: HTMLInputElement | null = null;

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #dote-chat-root {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 9500;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }

    #btn-dote-chat {
      position: fixed;
      top: calc(env(safe-area-inset-top, 0px) + 12px);
      left: calc(env(safe-area-inset-left, 0px) + 188px);
      width: 38px;
      height: 38px;
      border-radius: 10px;
      border: 1px solid rgba(196, 204, 216, 0.45);
      background: rgba(30, 32, 37, 0.88);
      color: #e2e6ec;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      pointer-events: auto;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.08);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      transition: transform 0.14s ease, border-color 0.14s ease, background 0.14s ease;
      padding: 0;
    }

    #btn-dote-chat:hover {
      border-color: rgba(226, 232, 240, 0.8);
      background: rgba(42, 45, 52, 0.94);
    }

    #btn-dote-chat:active {
      transform: scale(0.95);
    }

    #btn-dote-chat .dote-chat-unread {
      position: absolute;
      top: -3px;
      right: -3px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #e5484d;
      border: 1.5px solid #1e2025;
      display: none;
    }

    #btn-dote-chat.has-unread .dote-chat-unread {
      display: block;
    }

    #dote-chat-toasts {
      position: fixed;
      top: calc(env(safe-area-inset-top, 0px) + 56px);
      left: calc(env(safe-area-inset-left, 0px) + 188px);
      width: min(360px, calc(100vw - 208px));
      display: flex;
      flex-direction: column;
      gap: 4px;
      pointer-events: none;
    }

    .dote-chat-toast {
      padding: 5px 9px;
      border-radius: 6px;
      background: rgba(24, 26, 30, 0.58);
      border: 1px solid rgba(196, 204, 216, 0.22);
      color: rgba(236, 240, 245, 0.92);
      font-size: 12px;
      line-height: 1.35;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.75);
      pointer-events: none;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      animation: doteToastIn 0.18s ease-out;
    }

    .dote-chat-toast[data-kind="error"] { color: #fca5a5; }
    .dote-chat-toast[data-kind="dev"] { color: #fcd34d; }
    .dote-chat-toast[data-kind="system"] { color: #93c5fd; }

    @keyframes doteToastIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    #dote-chat-drawer {
      position: fixed;
      top: calc(env(safe-area-inset-top, 0px) + 8px);
      left: 50%;
      transform: translateX(-50%);
      width: min(560px, calc(100vw - 24px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)));
      max-height: 52vh;
      display: none;
      flex-direction: column;
      border-radius: 12px;
      background: rgba(28, 30, 35, 0.9);
      border: 1px solid rgba(203, 213, 225, 0.45);
      box-shadow: 0 14px 36px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      color: #e5e7eb;
      pointer-events: auto;
      overflow: hidden;
    }

    #dote-chat-drawer.open {
      display: flex;
    }

    .dote-chat-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: rgba(38, 41, 48, 0.85);
      border-bottom: 1px solid rgba(196, 204, 216, 0.25);
      font-size: 12.5px;
      font-weight: 600;
      letter-spacing: 0.02em;
    }

    .dote-chat-title-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .dote-dev-pill {
      display: none;
      padding: 2px 7px;
      border-radius: 999px;
      font-size: 10.5px;
      font-weight: 700;
      background: rgba(245, 158, 11, 0.18);
      border: 1px solid rgba(251, 191, 36, 0.55);
      color: #fcd34d;
    }

    .dote-dev-pill.active {
      display: inline-block;
    }

    .dote-chat-close {
      background: transparent;
      border: 1px solid rgba(196, 204, 216, 0.3);
      border-radius: 6px;
      color: #cbd5e1;
      width: 26px;
      height: 26px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      line-height: 1;
    }

    .dote-chat-close:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #ffffff;
    }

    .dote-chat-log {
      flex: 1 1 auto;
      min-height: 110px;
      max-height: 240px;
      overflow-y: auto;
      padding: 8px 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 12.5px;
      line-height: 1.4;
      overscroll-behavior: contain;
    }

    .dote-chat-line {
      word-break: break-word;
      color: #e5e7eb;
    }

    .dote-chat-line[data-kind="system"] { color: #93c5fd; }
    .dote-chat-line[data-kind="dev"] { color: #fcd34d; }
    .dote-chat-line[data-kind="error"] { color: #fca5a5; }
    .dote-chat-line[data-kind="info"] { color: #cbd5e1; }

    .dote-chat-chips {
      display: none;
      flex-wrap: wrap;
      gap: 6px;
      padding: 6px 10px;
      border-top: 1px solid rgba(196, 204, 216, 0.2);
      background: rgba(22, 24, 28, 0.72);
    }

    .dote-chat-chips.active {
      display: flex;
    }

    .dote-chip-btn {
      padding: 4px 8px;
      border-radius: 999px;
      border: 1px solid rgba(196, 204, 216, 0.38);
      background: rgba(45, 49, 57, 0.9);
      color: #e2e8f0;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      white-space: nowrap;
    }

    .dote-chip-btn:hover {
      border-color: rgba(251, 191, 36, 0.75);
      color: #fde68a;
    }

    .dote-chat-input-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-top: 1px solid rgba(196, 204, 216, 0.28);
      background: rgba(24, 26, 31, 0.92);
    }

    .dote-chat-input {
      flex: 1 1 auto;
      min-width: 0;
      padding: 7px 10px;
      border-radius: 8px;
      border: 1px solid rgba(196, 204, 216, 0.35);
      background: rgba(15, 17, 20, 0.85);
      color: #f8fafc;
      font-size: 13px;
      outline: none;
    }

    .dote-chat-input:focus {
      border-color: rgba(226, 232, 240, 0.8);
    }

    .dote-chat-send {
      padding: 7px 13px;
      border-radius: 8px;
      border: 1px solid rgba(203, 213, 225, 0.45);
      background: rgba(63, 68, 78, 0.92);
      color: #f1f5f9;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
    }

    .dote-chat-send:hover {
      background: rgba(82, 88, 100, 0.95);
    }
  body.dote-menu-open #btn-dote-chat, body.dote-menu-open #dote-chat-toasts, body.dote-menu-open #dote-chat-drawer, body.dote-menu-open #dote-chat-drawer.open, body:has(#modal:not(.hidden)) #btn-dote-chat, body:has(#modal:not(.hidden)) #dote-chat-toasts, body:has(#modal:not(.hidden)) #dote-chat-drawer, body:has(#modal:not(.hidden)) #dote-chat-drawer.open { display: none !important; visibility: hidden !important; pointer-events: none !important; }
  `;
  document.head.appendChild(style);
}
function isMenuOpen(): boolean { if (document.body.classList.contains('dote-menu-open')) return true; const modal = document.getElementById('modal'); if (modal && !modal.classList.contains('hidden') && window.getComputedStyle(modal).display !== 'none') return true; const pause = document.getElementById('pause-modal') as HTMLElement | null; if (pause && !pause.hidden && window.getComputedStyle(pause).display !== 'none') return true; return false; }


function stopEventPropagation(el: HTMLElement): void {
  const stop = (e: Event): void => {
    e.stopPropagation();
  };
  el.addEventListener('pointerdown', stop);
  el.addEventListener('touchstart', stop, { passive: true });
  el.addEventListener('wheel', stop, { passive: true });
  el.addEventListener('keydown', stop);
}

function syncVisualViewport(): void {
  if (!drawerEl) return;
  const vv = window.visualViewport;
  if (!vv) {
    drawerEl.style.top = '';
    drawerEl.style.maxHeight = '';
    return;
  }
  const topOffset = Math.max(8, Math.round(vv.offsetTop + 8));
  const maxH = Math.max(160, Math.round(vv.height - 20));
  drawerEl.style.top = `${topOffset}px`;
  drawerEl.style.maxHeight = `${Math.min(maxH, Math.round(window.innerHeight * 0.65))}px`;
}

function syncDevUI(): void {
  if (chipsEl) chipsEl.classList.toggle('active', devEnabled);
  if (devPillEl) devPillEl.classList.toggle('active', devEnabled);
}

function updateUnreadUI(): void {
  if (btnEl) btnEl.classList.toggle('has-unread', hasUnread && !isOpen);
}

function renderLog(): void {
  if (!logEl) return;
  logEl.innerHTML = '';
  for (const msg of messages) {
    const line = document.createElement('div');
    line.className = 'dote-chat-line';
    line.dataset.kind = msg.kind;
    line.textContent = msg.text;
    logEl.appendChild(line);
  }
  logEl.scrollTop = logEl.scrollHeight;
}

function addToast(msg: ChatMessage): void {
  if (!toastBoxEl || isOpen) return;
  const item = document.createElement('div');
  item.className = 'dote-chat-toast';
  item.dataset.kind = msg.kind;
  item.dataset.id = String(msg.id);
  item.textContent = msg.text;
  toastBoxEl.appendChild(item);

  while (toastBoxEl.children.length > MAX_TOAST_LINES) {
    const first = toastBoxEl.firstElementChild as HTMLElement | null;
    if (!first) break;
    const oldId = Number(first.dataset.id);
    const oldTimer = toastTimers.get(oldId);
    if (oldTimer !== undefined) {
      window.clearTimeout(oldTimer);
      toastTimers.delete(oldId);
    }
    first.remove();
  }

  const timer = window.setTimeout(() => {
    toastTimers.delete(msg.id);
    item.remove();
  }, TOAST_TTL_MS);
  toastTimers.set(msg.id, timer);
}

function clearToasts(): void {
  for (const timer of toastTimers.values()) {
    window.clearTimeout(timer);
  }
  toastTimers.clear();
  if (toastBoxEl) toastBoxEl.innerHTML = '';
}

export function pushChatMessage(
  text: string,
  kind: ChatMessageKind = 'chat'
): void {
  const clean = text.trim();
  if (!clean) return;
  const msg: ChatMessage = {
    id: ++msgSeq,
    text: clean,
    kind,
    time: Date.now(),
  };
  messages.push(msg);
  if (messages.length > MAX_HISTORY) {
    messages.splice(0, messages.length - MAX_HISTORY);
  }
  renderLog();
  if (!isOpen) {
    hasUnread = true;
    updateUnreadUI();
    addToast(msg);
  }
}

export function openChatConsole(): void {
  if (!initialized) initChatConsole(); if (isMenuOpen()) return;
  if (isOpen) return;
  isOpen = true;
  hasUnread = false;
  updateUnreadUI();
  clearToasts();
  if (drawerEl) {
    drawerEl.classList.add('open');
    syncVisualViewport();
  }
  window.setTimeout(() => inputEl?.focus(), 0);
}

export function closeChatConsole(): void {
  if (!isOpen) return;
  isOpen = false;
  if (drawerEl) drawerEl.classList.remove('open');
  inputEl?.blur();
}

function measureFps(): void {
  const provided = window.DOTEConsole?.getFps?.();
  if (typeof provided === 'number' && Number.isFinite(provided)) {
    pushChatMessage(`FPS: ${Math.round(provided)}`, 'info');
    return;
  }
  let frames = 0;
  const start = performance.now();
  const tick = (now: number): void => {
    frames += 1;
    if (now - start >= 500) {
      const fps = Math.round((frames * 1000) / (now - start));
      pushChatMessage(`FPS: ${fps}`, 'info');
      return;
    }
    window.requestAnimationFrame(tick);
  };
  window.requestAnimationFrame(tick);
}

function executeSlashCommand(raw: string): void {
  const parts = raw.slice(1).trim().split(/\s+/).filter(Boolean);
  const cmd = (parts[0] ?? '').toLowerCase();
  const args = parts.slice(1);

  if (!cmd) return;

  if (ALWAYS_ALLOWED_CMDS.has(cmd)) {
    if (cmd === 'help') {
      pushChatMessage(
        'Lệnh cơ bản: /help, /clear, /fps, /dev' +
          (devEnabled
            ? ' | Dev: /res, /age, /pop, /spawn, /damage, /deplete, /fog, /speed'
            : ''),
        'system'
      );
      return;
    }
    if (cmd === 'clear') {
      messages.length = 0;
      clearToasts();
      renderLog();
      return;
    }
    if (cmd === 'fps') {
      measureFps();
      return;
    }
    if (cmd === 'dev') {
      if (window.DOTEConsole?.isOnline?.()) {
        devEnabled = false;
        syncDevUI();
        pushChatMessage('Không thể bật /dev trong chế độ Online/LAN.', 'error');
        return;
      }
      devEnabled = !devEnabled;
      syncDevUI();
      pushChatMessage(
        devEnabled ? 'Đã BẬT chế độ /dev.' : 'Đã TẮT chế độ /dev.',
        'dev'
      );
      return;
    }
  }

  if (DEV_CMDS.has(cmd)) {
    if (window.DOTEConsole?.isOnline?.()) {
      devEnabled = false;
      syncDevUI();
      pushChatMessage('Lệnh /dev bị khóa trong chế độ Online/LAN.', 'error');
      return;
    }
    if (!devEnabled) {
      pushChatMessage('Hãy bật /dev trước khi dùng lệnh này.', 'error');
      return;
    }
    const result = window.DOTEConsole?.exec?.(cmd, args);
    if (typeof result === 'string' && result.trim()) {
      pushChatMessage(result, 'dev');
    } else if (result === false) {
      pushChatMessage(`Thực thi /${cmd} thất bại.`, 'error');
    } else {
      pushChatMessage(`Đã chạy: /${cmd}${args.length ? ' ' + args.join(' ') : ''}`, 'dev');
    }
    return;
  }

  pushChatMessage(`Lệnh không hợp lệ: /${cmd}. Gõ /help để xem hướng dẫn.`, 'error');
}

function submitInput(overrideText?: string): void {
  const raw = (overrideText ?? inputEl?.value ?? '').trim();
  if (!overrideText && inputEl) inputEl.value = '';
  if (!raw) return;

  if (raw.startsWith('/')) {
    executeSlashCommand(raw);
    return;
  }

  if (window.DOTEConsole?.sendChat) {
    window.DOTEConsole.sendChat(raw);
  }
  pushChatMessage(raw, 'chat');
}

export function initChatConsole(): void {
  if (initialized) return;
  initialized = true;

  injectStyles();

  rootEl = document.createElement('div');
  rootEl.id = 'dote-chat-root';

  btnEl = document.createElement('button');
  btnEl.id = 'btn-dote-chat';
  btnEl.type = 'button';
  btnEl.title = 'Chat & Console (Enter)';
  btnEl.setAttribute('aria-label', 'Mở khung Chat và Console');
  btnEl.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
    </svg>
    <span class="dote-chat-unread"></span>
  `;
  btnEl.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isOpen) closeChatConsole();
    else openChatConsole();
  });
  stopEventPropagation(btnEl);

  toastBoxEl = document.createElement('div');
  toastBoxEl.id = 'dote-chat-toasts';

  drawerEl = document.createElement('div');
  drawerEl.id = 'dote-chat-drawer';
  stopEventPropagation(drawerEl);

  const header = document.createElement('div');
  header.className = 'dote-chat-header';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'dote-chat-title-wrap';
  const titleText = document.createElement('span');
  titleText.textContent = 'Chat & Console';
  devPillEl = document.createElement('span');
  devPillEl.className = 'dote-dev-pill';
  devPillEl.textContent = 'DEV';
  titleWrap.append(titleText, devPillEl);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'dote-chat-close';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', 'Đóng');
  closeBtn.addEventListener('click', closeChatConsole);

  header.append(titleWrap, closeBtn);

  logEl = document.createElement('div');
  logEl.className = 'dote-chat-log';

  chipsEl = document.createElement('div');
  chipsEl.className = 'dote-chat-chips';
  for (const chip of DEV_QUICK_CHIPS) {
    const cbtn = document.createElement('button');
    cbtn.type = 'button';
    cbtn.className = 'dote-chip-btn';
    cbtn.textContent = chip.label;
    cbtn.addEventListener('click', () => {
      submitInput(chip.cmd);
      inputEl?.focus();
    });
    chipsEl.appendChild(cbtn);
  }

  const inputRow = document.createElement('div');
  inputRow.className = 'dote-chat-input-row';

  inputEl = document.createElement('input');
  inputEl.type = 'text';
  inputEl.className = 'dote-chat-input';
  inputEl.placeholder = 'Nhập tin nhắn hoặc lệnh /help, /dev...';
  inputEl.autocomplete = 'off';
  inputEl.spellcheck = false;
  inputEl.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      submitInput();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeChatConsole();
    }
  });

  const sendBtn = document.createElement('button');
  sendBtn.type = 'button';
  sendBtn.className = 'dote-chat-send';
  sendBtn.textContent = 'Gửi';
  sendBtn.addEventListener('click', () => {
    submitInput();
    inputEl?.focus();
  });

  inputRow.append(inputEl, sendBtn);
  drawerEl.append(header, logEl, chipsEl, inputRow);
  rootEl.append(btnEl, toastBoxEl, drawerEl);
  document.body.appendChild(rootEl);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) {
      e.preventDefault();
      closeChatConsole();
      return;
    }
    if (e.key === 'Enter' && !isOpen) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName; if (isMenuOpen()) return;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        return;
      }
      e.preventDefault();
      openChatConsole();
    }
  });
  const menuObserver = new MutationObserver(() => { if (isOpen && isMenuOpen()) closeChatConsole(); }); menuObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  
  window.visualViewport?.addEventListener('resize', syncVisualViewport);
  window.visualViewport?.addEventListener('scroll', syncVisualViewport);

  window.DOTEChat = {
    push: pushChatMessage,
    open: openChatConsole,
    close: closeChatConsole,
  };

  renderLog();
  syncDevUI();
}
