import { createLobbyCombatTextButton } from "./combatTextSetting";
import {
  FACTION_CRESTS,
  MOTIF_DONG_SON_DRUM,
  RANK_MEDALS,
  type FactionKey,
  type RankGrade,
} from "./pixelMotifs";

interface FactionMeta {
  name: string;
  chip: string;
  stat: string;
  svg: string;
}

const FACTION_META: Record<FactionKey, FactionMeta> = {
  dai_viet: {
    name: "Đại Việt",
    chip: "Tượng Binh",
    stat: "+15% Lúa & Tre",
    svg: FACTION_CRESTS.dai_viet,
  },
  trung_nguyen: {
    name: "Trung Nguyên",
    chip: "Nỏ Liên Châu",
    stat: "-15% Lên đời",
    svg: FACTION_CRESTS.trung_nguyen,
  },
  bac_cuong: {
    name: "Bắc Cương",
    chip: "Thiết Kỵ Xạ",
    stat: "Kỵ +10% tốc độ",
    svg: FACTION_CRESTS.bac_cuong,
  },
};

const QUICK_GUIDE_ITEMS: Array<{ title: string; desc: string }> = [
  {
    title: "Khai thác & Xây dựng",
    desc: "Chạm nông dân rồi chạm Lúa, Tre, Đá, Vàng; đặt nhiều móng để xây nối tiếp.",
  },
  {
    title: "Chọn nhanh & Đạo 1–3",
    desc: "Chạm đúp chọn quân cùng loại trong 6 ô; nhấn đúp giữ để kéo khung chọn.",
  },
  {
    title: "Camera 3D cảm ứng",
    desc: "Chụm/mở 2 ngón để thu phóng; chạm nút Xoay để đổi góc nhìn chiến trường.",
  },
  {
    title: "Chuông Báo & Lên 4 Đời",
    desc: "Rung Chuông Báo đưa dân vào Đình Làng khi bị đánh; tích tài nguyên Lên 4 Đời.",
  },
];

type MenuPage = "home" | "solo" | "online" | "settings";

interface SaveSummary {
  factionName: string;
  age: number;
  timeText: string;
}

function readLocalSaveSummary(): SaveSummary | null {
  try {
    let raw = window.localStorage.getItem("dote_save_v1"); if (!raw) { const legacy = window.localStorage.getItem("pixel_dynasty_save_v1"); if (legacy) { raw = legacy; try { window.localStorage.setItem("dote_save_v1", legacy); window.localStorage.removeItem("pixel_dynasty_save_v1"); } catch {} } }
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== "object") return null;
    const fKey = String(parsed.factionId || "dai_viet") as FactionKey;
    const factionName = FACTION_META[fKey]?.name ?? "Đại Việt";
    const age = Number(parsed.age) || 1;
    const sec = Math.max(0, Math.floor(Number(parsed.time) || 0));
    const mm = String(Math.floor(sec / 60)).padStart(2, "0");
    const ss = String(sec % 60).padStart(2, "0");
    return { factionName, age, timeText: `${mm}:${ss}` };
  } catch {
    return null;
  }
}

function syncMenuOpenClass(): void {
  try {
    const modal = document.getElementById("modal");
    const pause = document.getElementById("pause-modal");
    const modalVisible = Boolean(
      modal && !modal.classList.contains("hidden") && window.getComputedStyle(modal).display !== "none",
    );
    const pauseVisible = Boolean(
      pause && !pause.hidden && window.getComputedStyle(pause).display !== "none",
    );
    document.body.classList.toggle("dote-menu-open", modalVisible || pauseVisible);
  } catch {
    /* ignore */
  }
}

function refreshLoadSaveButton(): void {
  const loadSaveBtn = document.getElementById("btn-load-save") as HTMLButtonElement | null;
  if (!loadSaveBtn) return;
  loadSaveBtn.classList.add("dote-btn", "dote-btn--save", "dote-menu-row", "dote-menu-row--save");
  const save = readLocalSaveSummary();
  if (save) {
    loadSaveBtn.innerHTML = `
      <span>Chơi tiếp</span>
      <span class="dote-menu-row-sub">${save.factionName} · Đời ${save.age} · ${save.timeText}</span>
    `;
  } else {
    loadSaveBtn.textContent = "Chơi tiếp";
  }
}

function upgradeBrandHeader(modalCard: HTMLElement): void {
  if (modalCard.querySelector(".dote-brand-header")) return;
  const titleEl = document.getElementById("modal-title");
  if (!titleEl || !modalCard.contains(titleEl)) return;

  if (/sprint/i.test(titleEl.textContent || "")) {
    titleEl.textContent = "DYNASTY OF THE EAST";
  }

  const subEl = document.getElementById("modal-sub");
  if (subEl && /sprint|nhạc ngũ cung/i.test(subEl.textContent || "")) {
    subEl.textContent = "Triều Đại Phương Đông";
  }

  const header = document.createElement("div");
  header.className = "dote-brand-header";

  const row = document.createElement("div");
  row.className = "dote-brand-row";

  const drum = document.createElement("span");
  drum.setAttribute("aria-hidden", "true");
  drum.innerHTML = MOTIF_DONG_SON_DRUM;

  titleEl.insertAdjacentElement("beforebegin", header);
  row.append(drum, titleEl);
  header.appendChild(row);
  if (subEl && modalCard.contains(subEl)) {
    header.appendChild(subEl);
  }
}

function upgradeFactionButtons(): void {
  const row = document.getElementById("opt-faction");
  if (!row) return;

  const buttons = row.querySelectorAll<HTMLButtonElement>(".opt-btn");
  buttons.forEach((btn) => {
    if (btn.dataset.doteEnhanced === "1") return;
    const key = (btn.dataset.val || "") as FactionKey;
    const meta = FACTION_META[key];
    if (!meta) return;

    btn.dataset.doteEnhanced = "1";
    btn.classList.add("dote-faction-card");
    btn.innerHTML = `
      <span class="dote-crest">${meta.svg}</span>
      <span class="dote-faction-info">
        <span class="dote-faction-head">
          <span class="dote-faction-name">${meta.name}</span>
          <span class="dote-chip">${meta.chip}</span>
        </span>
        <span class="dote-faction-stat">${meta.stat}</span>
      </span>
    `;
  });
}

function findDirectChild(root: HTMLElement, id: string): HTMLElement | null {
  const el = document.getElementById(id);
  if (!el || !root.contains(el)) return null;
  let cur: HTMLElement | null = el;
  while (cur && cur.parentElement && cur.parentElement !== root) {
    cur = cur.parentElement;
  }
  return cur;
}

function getActiveOptLabel(containerId: string, fallback: string): string {
  const active = document.querySelector<HTMLElement>(`#${containerId} .opt-btn.active`);
  if (!active) return fallback;
  const name = active.querySelector(".dote-faction-name")?.textContent?.trim();
  if (name) return name;
  const firstNode = Array.from(active.childNodes).find((n) => n.nodeType === Node.TEXT_NODE);
  return firstNode?.textContent?.trim() || active.textContent?.trim() || fallback;
}

function buildSettingProxyButton(targetId: string, fallbackLabel: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "dote-btn dote-btn--ghost";
  const sync = (): void => {
    const src = document.getElementById(targetId);
    const txt = src?.textContent?.trim() || fallbackLabel;
    const parts = txt.split(":");
    if (parts.length >= 2) {
      btn.innerHTML = `<span>${parts[0].trim()}</span><span style="color:var(--dote-gold-light)">${parts.slice(1).join(":").trim()}</span>`;
    } else {
      btn.textContent = txt;
    }
  };
  sync();
  btn.addEventListener("click", () => {
    try {
      document.getElementById(targetId)?.click();
      sync();
    } catch {
      /* ignore */
    }
  });
  return btn;
}

function enhancePauseModal(): void {
  const pauseModal = document.getElementById("pause-modal");
  if (!pauseModal) return;
  const card = pauseModal.querySelector<HTMLElement>(".dote-pause-card");
  if (!card || card.dataset.doteEnhanced === "1") return;
  card.dataset.doteEnhanced = "1";

  const actions = card.querySelector<HTMLElement>(".dote-pause-actions");
  const quick = card.querySelector<HTMLElement>(".dote-pause-quick-settings");

  if (actions && quick && !card.querySelector(".dote-pause-body")) {
    const body = document.createElement("div");
    body.className = "dote-pause-body";

    const quickLabel = document.createElement("div");
    quickLabel.className = "dote-pause-col-label";
    quickLabel.textContent = "Cài đặt nhanh";
    quick.insertAdjacentElement("afterbegin", quickLabel);

    actions.insertAdjacentElement("beforebegin", body);
    body.append(actions, quick);
  }
}

export function enhanceModal(modalCard: HTMLElement): void {
  const setupPanel =
    modalCard.querySelector<HTMLElement>("#setup-panel") ??
    document.getElementById("setup-panel");
  if (!setupPanel || setupPanel.dataset.doteTwoTier === "1") return;
  setupPanel.dataset.doteTwoTier = "1";

  upgradeBrandHeader(modalCard);

  const factionGroup = findDirectChild(setupPanel, "opt-faction");
  const modeGroup = findDirectChild(setupPanel, "opt-mode");
  const diffGroup = findDirectChild(setupPanel, "opt-diff");
  const mapSizeGroup = findDirectChild(setupPanel, "opt-map-size");
  const mapTypeGroup = findDirectChild(setupPanel, "opt-map-type");
  const startBtn = document.getElementById("btn-start") as HTMLButtonElement | null;
  const loadSaveBtn = document.getElementById("btn-load-save") as HTMLButtonElement | null;

  const homeMenu = document.createElement("div");
  homeMenu.className = "dote-home-menu";

  const soloPage = document.createElement("div");
  soloPage.className = "dote-page dote-page-solo";

  const onlinePage = document.createElement("div");
  onlinePage.className = "dote-page dote-page-online";

  const settingsPage = document.createElement("div");
  settingsPage.className = "dote-page dote-page-settings";

  const footerSummary = document.createElement("span");
  footerSummary.className = "dote-footer-summary";

  const updateSummary = (): void => {
    const f = getActiveOptLabel("opt-faction", "Đại Việt");
    const m = getActiveOptLabel("opt-mode", "1 vs 1");
    const d = getActiveOptLabel("opt-diff", "Chiến thuật");
    const s = getActiveOptLabel("opt-map-size", "48×48");
    footerSummary.textContent = `${f} · ${m} · ${d} · ${s}`;
  };

  const setPage = (page: MenuPage): void => {
    homeMenu.hidden = page !== "home";
    soloPage.hidden = page !== "solo";
    onlinePage.hidden = page !== "online";
    settingsPage.hidden = page !== "settings";
    const isSub = page !== "home";
    modalCard.classList.toggle("dote-modal-wide", isSub);
    modalCard.classList.toggle("dote-modal-subpage", isSub);
    if (page === "home") refreshLoadSaveButton();
    if (page === "solo") updateSummary();
  };

  if (loadSaveBtn) {
    refreshLoadSaveButton();
    homeMenu.appendChild(loadSaveBtn);
  }

  const makeRowBtn = (label: string, extraCls: string, onClick: () => void): HTMLButtonElement => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `dote-btn dote-menu-row ${extraCls}`.trim();
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
  };

  homeMenu.append(
    makeRowBtn("Chơi mới", "dote-btn--primary", () => setPage("solo")),
    makeRowBtn("Chơi online", "", () => setPage("online")),
    makeRowBtn("Cài đặt", "dote-btn--ghost", () => setPage("settings")),
  );

  const makeTopbar = (title: string, metaText = ""): HTMLElement => {
    const bar = document.createElement("div");
    bar.className = "dote-page-topbar";

    const back = document.createElement("button");
    back.type = "button";
    back.className = "dote-btn dote-btn--back";
    back.textContent = "← Quay lại";
    back.addEventListener("click", () => setPage("home"));

    const h = document.createElement("h2");
    h.className = "dote-page-title";
    h.textContent = title;

    const meta = document.createElement("span");
    meta.className = "dote-page-meta";
    meta.textContent = metaText;

    bar.append(back, h, meta);
    return bar;
  };

  const soloBody = document.createElement("div");
  soloBody.className = "dote-page-body";
  const soloLeft = document.createElement("div");
  soloLeft.className = "dote-col";
  const soloRight = document.createElement("div");
  soloRight.className = "dote-col";

  const moved = new Set<HTMLElement>();
  const moveTo = (el: HTMLElement | null, target: HTMLElement): void => {
    if (!el || moved.has(el)) return;
    moved.add(el);
    target.appendChild(el);
  };

  moveTo(factionGroup, soloLeft);
  moveTo(modeGroup, soloRight);
  moveTo(diffGroup, soloRight);
  moveTo(mapSizeGroup, soloRight);
  moveTo(mapTypeGroup, soloRight);

  for (const child of Array.from(setupPanel.children)) {
    if (child instanceof HTMLElement && !moved.has(child)) {
      if (child.children.length > 0 || (child.textContent ?? "").trim().length > 0) {
        moveTo(child, soloRight);
      }
    }
  }

  soloBody.append(soloLeft, soloRight);

  const soloFooter = document.createElement("div");
  soloFooter.className = "dote-page-footer";
  soloFooter.appendChild(footerSummary);
  if (startBtn) {
    startBtn.classList.add("dote-btn", "dote-btn--primary");
    soloFooter.appendChild(startBtn);
  }

  soloPage.append(makeTopbar("Chơi mới", "Đấu AI"), soloBody, soloFooter);

  soloBody.addEventListener("click", () => {
    window.setTimeout(() => {
      try {
        updateSummary();
      } catch {
        /* ignore */
      }
    }, 0);
  });

  const onlineBody = document.createElement("div");
  onlineBody.className = "dote-page-body";

  const onlineLeft = document.createElement("div");
  onlineLeft.className = "dote-col";

  const statusPill = document.createElement("span");
  statusPill.className = "dote-status-pill";
  statusPill.textContent = "Trạng thái máy chủ: Sẵn sàng kiểm tra";

  const roomFeedback = document.createElement("p");
  roomFeedback.textContent = "Nhập mã phòng 4 ký tự để tham gia hoặc tạo phòng mới cùng bạn bè.";

  const joinCard = document.createElement("div");
  joinCard.className = "dote-card-box";
  joinCard.innerHTML = `<h3>Phòng trực tuyến</h3>`;
  joinCard.appendChild(statusPill);

  const inputRow = document.createElement("div");
  inputRow.className = "dote-room-input-row";
  const codeInput = document.createElement("input");
  codeInput.type = "text";
  codeInput.maxLength = 4;
  codeInput.placeholder = "ABCD";
  codeInput.className = "dote-input";
  codeInput.setAttribute("aria-label", "Mã phòng 4 ký tự");

  const joinBtn = document.createElement("button");
  joinBtn.type = "button";
  joinBtn.className = "dote-btn dote-btn--primary";
  joinBtn.textContent = "Vào phòng";
  joinBtn.addEventListener("click", () => {
    const code = codeInput.value.trim().toUpperCase();
    if (code.length < 4) {
      roomFeedback.textContent = "Vui lòng nhập đủ 4 ký tự mã phòng.";
      return;
    }
    roomFeedback.textContent = `Đang tìm phòng ${code}... (Cần máy chủ Colyseus đang bật để kết nối).`;
  });

  inputRow.append(codeInput, joinBtn);
  joinCard.append(inputRow, roomFeedback);
  onlineLeft.appendChild(joinCard);

  const onlineRight = document.createElement("div");
  onlineRight.className = "dote-col";
  const createCard = document.createElement("div");
  createCard.className = "dote-card-box";
  createCard.innerHTML = `
    <h3>Tạo phòng mới</h3>
    <p>Hỗ trợ tạo phòng mã mời 4 ký tự qua máy chủ trực tuyến hoặc chơi mạng LAN trên iOS.</p>
  `;
  const createRoomBtn = document.createElement("button");
  createRoomBtn.type = "button";
  createRoomBtn.className = "dote-btn";
  createRoomBtn.textContent = "Tạo mã phòng";
  createRoomBtn.addEventListener("click", () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    codeInput.value = code;
    roomFeedback.textContent = `Đã tạo mã phòng tạm: ${code}. Chia sẻ mã này khi máy chủ trực tuyến sẵn sàng.`;
  });

  const pingBtn = document.createElement("button");
  pingBtn.type = "button";
  pingBtn.className = "dote-btn dote-btn--ghost";
  pingBtn.textContent = "Kiểm tra máy chủ";
  pingBtn.addEventListener("click", () => {
    statusPill.textContent = "Đang kiểm tra máy chủ...";
    try {
      const health = (window as unknown as { DOTEServerHealth?: { checkHealth?: () => Promise<boolean> } }).DOTEServerHealth;
      if (health && typeof health.checkHealth === "function") {
        health.checkHealth()
          .then((ok) => {
            statusPill.textContent = ok ? "Máy chủ: Trực tuyến" : "Máy chủ: Đang ngủ / Ngoại tuyến";
          })
          .catch(() => {
            statusPill.textContent = "Máy chủ: Không phản hồi";
          });
      } else {
        statusPill.textContent = "Máy chủ: Chưa cấu hình URL";
      }
    } catch {
      statusPill.textContent = "Máy chủ: Ngoại tuyến";
    }
  });

  createCard.append(createRoomBtn, pingBtn);
  onlineRight.appendChild(createCard);

  onlineBody.append(onlineLeft, onlineRight);
  onlinePage.append(makeTopbar("Chơi online", "Phòng 4 ký tự"), onlineBody);

  const settingsBody = document.createElement("div");
  settingsBody.className = "dote-page-body";

  const settingsLeft = document.createElement("div");
  settingsLeft.className = "dote-col";
  const settingsCard = document.createElement("div");
  settingsCard.className = "dote-card-box";
  settingsCard.innerHTML = `<h3>Âm thanh & Đồ họa</h3>`;
  const settingsList = document.createElement("div");
  settingsList.className = "dote-settings-list";
  settingsList.append(
    buildSettingProxyButton("btn-music", "Nhạc: Bật"),
    buildSettingProxyButton("btn-sound", "Âm: Bật"),
    buildSettingProxyButton("btn-quality", "Đồ họa: Tự động"),
    buildSettingProxyButton("btn-atmosphere", "Trời: Tự động"),
    createLobbyCombatTextButton(),
  );
  settingsCard.appendChild(settingsList);
  settingsLeft.appendChild(settingsCard);

  const settingsRight = document.createElement("div");
  settingsRight.className = "dote-col";
  const guideCard = document.createElement("div");
  guideCard.className = "dote-card-box";
  guideCard.innerHTML = `
    <h3>Hướng dẫn điều khiển</h3>
    <div class="dote-guide-list">
      ${QUICK_GUIDE_ITEMS.map(
        (item) => `<div class="dote-guide-item"><strong>${item.title}</strong><span>${item.desc}</span></div>`,
      ).join("")}
    </div>
  `;
  settingsRight.appendChild(guideCard);

  settingsBody.append(settingsLeft, settingsRight);
  settingsPage.append(makeTopbar("Cài đặt", "Âm thanh · Đồ họa"), settingsBody);

  setupPanel.append(homeMenu, soloPage, onlinePage, settingsPage);
  setPage("home");
}

function extractMetric(text: string, patterns: RegExp[]): number | null {
  for (const rx of patterns) {
    const m = text.match(rx);
    if (m && m[1]) {
      const n = Number(m[1].replace(/[.,\s]/g, ""));
      if (!Number.isNaN(n)) return n;
    }
  }
  return null;
}

function isSetupHidden(): boolean {
  const setup = document.getElementById("setup-panel");
  if (!setup) return false;
  const style = window.getComputedStyle(setup);
  return setup.hidden || style.display === "none";
}

function renderEndgameScorecard(modalCard: HTMLElement, tipEl: HTMLElement): void {
  const existing = modalCard.querySelector(".dote-rank-banner");
  const endgame = isSetupHidden();
  modalCard.classList.toggle("dote-modal-endgame", endgame);

  const startBtn = document.getElementById("btn-start");
  if (!endgame) {
    if (existing) existing.remove();
    const soloFooter = modalCard.querySelector<HTMLElement>(".dote-page-footer");
    if (startBtn && soloFooter && !soloFooter.contains(startBtn)) {
      soloFooter.appendChild(startBtn);
    }
    return;
  }

  modalCard.classList.remove("dote-modal-subpage", "dote-modal-wide");

  if (startBtn && !modalCard.querySelector(":scope > #btn-start")) {
    tipEl.insertAdjacentElement("afterend", startBtn);
  }

  const rawText = (tipEl.textContent || "").trim();
  if (!rawText) return;

  const numbers = (rawText.match(/\d[\d.,]*/g) || [])
    .map((s) => Number(s.replace(/[.,]/g, "")))
    .filter((n) => !Number.isNaN(n));

  const econ =
    extractMetric(rawText, [/kinh\s*t[eế]\D*(\d[\d.,]*)/i, /t[àa]i\s*nguy[êe]n\D*(\d[\d.,]*)/i]) ??
    numbers[1] ??
    Math.round((numbers[0] ?? 600) * 0.4);

  const mil =
    extractMetric(rawText, [/qu[âa]n\s*s[ựự]\D*(\d[\d.,]*)/i, /ti[êe]u\s*di[ệe]t\D*(\d[\d.,]*)/i]) ??
    numbers[2] ??
    Math.round((numbers[0] ?? 600) * 0.35);

  const bld =
    extractMetric(rawText, [/c[ôo]ng\s*tr[ìi]nh\D*(\d[\d.,]*)/i, /x[âa]y\s*d[ựự]ng\D*(\d[\d.,]*)/i]) ??
    numbers[3] ??
    Math.round((numbers[0] ?? 600) * 0.25);

  const total =
    extractMetric(rawText, [/t[ổo]ng\s*[đd]i[ểe]m\D*(\d[\d.,]*)/i, /[đd]i[ểe]m\D*(\d[\d.,]*)/i]) ??
    econ + mil + bld;

  let rank: RankGrade = "C";
  if (total >= 2400) rank = "S";
  else if (total >= 1500) rank = "A";
  else if (total >= 800) rank = "B";

  const rankTitles: Record<RankGrade, string> = {
    S: "HẠNG S · HOÀNG KIM",
    A: "HẠNG A · BẠC KHẢM",
    B: "HẠNG B · ĐỒNG CỔ",
    C: "HẠNG C · GỖ MỘC",
  };

  const maxVal = Math.max(econ, mil, bld, 1);
  const pct = (v: number): number => Math.max(8, Math.min(100, Math.round((v / maxVal) * 100)));

  const banner = existing ?? document.createElement("div");
  banner.className = "dote-rank-banner";
  banner.innerHTML = `
    <div class="dote-medal-wrap" title="Xếp hạng ${rank}">
      ${RANK_MEDALS[rank]}
      <span class="dote-medal-label">${rankTitles[rank]}</span>
    </div>
    <div class="dote-bars">
      <div class="dote-bar-row">
        <span class="dote-bar-label">Kinh tế</span>
        <div class="dote-bar-track"><div class="dote-bar-fill" style="width:${pct(econ)}%"></div></div>
        <span class="dote-bar-val">${econ}</span>
      </div>
      <div class="dote-bar-row">
        <span class="dote-bar-label">Quân sự</span>
        <div class="dote-bar-track"><div class="dote-bar-fill" style="width:${pct(mil)}%"></div></div>
        <span class="dote-bar-val">${mil}</span>
      </div>
      <div class="dote-bar-row">
        <span class="dote-bar-label">Công trình</span>
        <div class="dote-bar-track"><div class="dote-bar-fill" style="width:${pct(bld)}%"></div></div>
        <span class="dote-bar-val">${bld}</span>
      </div>
    </div>
  `;

  if (!existing) {
    tipEl.insertAdjacentElement("beforebegin", banner);
  }
}

export function initLobbyUI(): void {
  try {
    const modal = document.getElementById("modal");
    const modalCard = document.querySelector<HTMLElement>("#modal .modal-card");
    if (!modal || !modalCard) return;

    upgradeFactionButtons();
    enhanceModal(modalCard);
    enhancePauseModal();
    syncMenuOpenClass();

    const modalStateObserver = new MutationObserver(() => syncMenuOpenClass());
    modalStateObserver.observe(modal, { attributes: true, attributeFilter: ["class", "style"] });

    const pauseModal = document.getElementById("pause-modal");
    if (pauseModal) {
      modalStateObserver.observe(pauseModal, { attributes: true, attributeFilter: ["hidden", "style", "class"] });
    }

    const loadSaveBtn = document.getElementById("btn-load-save");
    if (loadSaveBtn) {
      const saveObserver = new MutationObserver(() => {
        try {
          refreshLoadSaveButton();
        } catch {
          /* ignore */
        }
      });
      saveObserver.observe(loadSaveBtn, { attributes: true, attributeFilter: ["style"] });
    }

    const tipsEl = document.getElementById("modal-tips");
    if (!tipsEl) return;

    const update = (): void => {
      try {
        renderEndgameScorecard(modalCard, tipsEl);
        syncMenuOpenClass();
      } catch {
        /* ignore */
      }
    };
    update();

    const observer = new MutationObserver(() => update());
    observer.observe(tipsEl, { childList: true, characterData: true, subtree: true });

    const setupPanel = document.getElementById("setup-panel");
    if (setupPanel) {
      observer.observe(setupPanel, { attributes: true, attributeFilter: ["style", "hidden", "class"] });
    }
  } catch {
    /* never block game boot */
  }
}
