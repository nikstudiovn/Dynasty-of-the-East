import {
  FACTION_CRESTS,
  MOTIF_CORNER_CLOUD,
  MOTIF_DIVIDER_LOTUS,
  MOTIF_DONG_SON_DRUM,
  MOTIF_LANTERN,
  PIXEL_ICONS,
  RANK_MEDALS,
  type FactionKey,
  type RankGrade,
} from "./pixelMotifs";
interface FactionMeta {
  name: string;
  chip: string;
  stat: string;
  lore: string;
  svg: string;
}

const FACTION_META: Record<FactionKey, FactionMeta> = {
  dai_viet: {
    name: "Đại Việt",
    chip: "Tượng Binh",
    stat: "+15% Lúa & Tre",
    lore: "Đình Làng vững chãi, Tượng Binh thiện chiến, kinh tế lúa nước & tre dồi dào.",
    svg: FACTION_CRESTS.dai_viet,
  },
  trung_nguyen: {
    name: "Trung Nguyên",
    chip: "Nỏ Liên Châu",
    stat: "-15% Lên đời",
    lore: "Nỏ Liên Châu bắn loạt dày đặc, tiết kiệm tài nguyên khi Phục Hưng & Lên 4 Đời.",
    svg: FACTION_CRESTS.trung_nguyen,
  },
  bac_cuong: {
    name: "Bắc Cương",
    chip: "Thiết Kỵ Xạ",
    stat: "Kỵ +10% tốc độ",
    lore: "Thiết Kỵ Xạ cơ động cao, Ưu Tiên đột kích cánh và kiểm soát bãi tài nguyên sớm.",
    svg: FACTION_CRESTS.bac_cuong,
  },
};

const QUICK_GUIDE_CARDS: Array<{ title: string; desc: string }> = [
  {
    title: "1. Khai thác & Xây dựng",
    desc: "Chạm nông dân rồi chạm Lúa, Tre, Đá hoặc Vàng; đặt nhiều móng để xây nối tiếp.",
  },
  {
    title: "2. Chọn nhanh & Đạo 1–3",
    desc: "Chạm đúp chọn quân cùng loại trong 6 ô; nhấn đúp giữ để kéo khung chọn cụm.",
  },
  {
    title: "3. Camera 3D Cảm ứng",
    desc: "Chụm/mở 2 ngón thu phóng chiến trường; kéo góc nhìn để quan sát địa hình.",
  },
  {
    title: "4. Chuông Báo & 4 Đời",
    desc: "Rung Chuông Báo đưa dân vào Đình Làng khi bị tập kích; tích tài nguyên Lên 4 Đời.",
  },
];

interface SaveSummary {
  factionName: string;
  age: number;
  timeText: string;
}

function readLocalSaveSummary(): SaveSummary | null {
  try {
    const raw = window.localStorage.getItem("pixel_dynasty_save_v1");
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

function refreshLoadSaveButton(): void {
  const loadSaveBtn = document.getElementById("btn-load-save") as HTMLButtonElement | null;
  if (!loadSaveBtn) return;
  loadSaveBtn.classList.add("pd-btn", "pd-home-btn", "pd-btn--save");
  const save = readLocalSaveSummary();
  if (save) {
    loadSaveBtn.innerHTML = `
      ${PIXEL_ICONS.save}
      <span class="pd-home-btn-text">
        <span class="pd-home-btn-title">Tiếp tục ván</span>
        <span class="pd-home-btn-sub">${save.factionName} · Đời ${save.age} · ${save.timeText}</span>
      </span>
    `;
  }
}
function attachPanelOrnaments(panel: HTMLElement): void {
  if (panel.dataset.pdOrnamented === "1") return;
  panel.dataset.pdOrnamented = "1";
  panel.classList.add("pd-panel");

  const corners: Array<string> = ["tl", "tr", "bl", "br"];
  for (const pos of corners) {
    const c = document.createElement("span");
    c.className = `pd-corner pd-corner--${pos}`;
    c.setAttribute("aria-hidden", "true");
    c.innerHTML = MOTIF_CORNER_CLOUD;
    panel.appendChild(c);
  }
}

function attachAmbientLanterns(panel: HTMLElement): void {
  if (panel.querySelector(".pd-lantern")) return;
  for (const side of ["l", "r"] as const) {
    const l = document.createElement("span");
    l.className = `pd-lantern pd-lantern--${side}`;
    l.setAttribute("aria-hidden", "true");
    l.innerHTML = MOTIF_LANTERN;
    panel.appendChild(l);
  }
}

function upgradeTitleBanner(modalCard: HTMLElement): void {
  if (modalCard.querySelector(".pd-title-bar")) return;
  const titleEl = document.getElementById("modal-title");
  if (!titleEl || !modalCard.contains(titleEl)) return;

  const subEl = document.getElementById("modal-sub");
  const bar = document.createElement("div");
  bar.className = "pd-title-bar";

  const drum = document.createElement("span");
  drum.setAttribute("aria-hidden", "true");
  drum.innerHTML = MOTIF_DONG_SON_DRUM;

  const textWrap = document.createElement("div");
  textWrap.style.minWidth = "0";
  titleEl.insertAdjacentElement("beforebegin", bar);
  textWrap.appendChild(titleEl);
  if (subEl && modalCard.contains(subEl)) {
    textWrap.appendChild(subEl);
  }

  bar.appendChild(drum);
  bar.appendChild(textWrap);

  const divider = document.createElement("div");
  divider.className = "pd-divider";
  divider.setAttribute("aria-hidden", "true");
  divider.innerHTML = MOTIF_DIVIDER_LOTUS;
  bar.insertAdjacentElement("afterend", divider);
}

function upgradeFactionButtons(): void {
  const row = document.getElementById("opt-faction");
  if (!row) return;

  const buttons = row.querySelectorAll<HTMLButtonElement>(".opt-btn");
  buttons.forEach((btn) => {
    if (btn.dataset.pdEnhanced === "1") return;
    const key = (btn.dataset.val || "") as FactionKey;
    const meta = FACTION_META[key];
    if (!meta) return;

    btn.dataset.pdEnhanced = "1";
    btn.classList.add("pd-faction-card");
    btn.innerHTML = `
      <span class="pd-crest">${meta.svg}</span>
      <span class="pd-faction-info">
        <span class="pd-faction-head">
          <span class="pd-faction-name">${meta.name}</span>
          <span class="pd-chip">${meta.chip}</span>
        </span>
        <span class="pd-faction-stat">${meta.stat}</span>
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

function getSelectedFaction(): FactionKey {
  const active = document.querySelector<HTMLElement>("#opt-faction .opt-btn.active");
  const val = (active?.dataset.val || "dai_viet") as FactionKey;
  return FACTION_META[val] ? val : "dai_viet";
}

function buildLobbySettingButton(targetId: string, fallbackLabel: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "pd-btn pd-btn--ghost";
  const sync = (): void => {
    const src = document.getElementById(targetId);
    btn.textContent = src?.textContent?.trim() || fallbackLabel;
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
  const card = pauseModal.querySelector<HTMLElement>(".pd-pause-card");
  if (!card || card.dataset.pdEnhanced === "1") return;
  card.dataset.pdEnhanced = "1";

  attachPanelOrnaments(card);

  const actions = card.querySelector<HTMLElement>(".pd-pause-actions");
  const quick = card.querySelector<HTMLElement>(".pd-pause-quick-settings");

  if (actions && quick && !card.querySelector(".pd-pause-body")) {
    const body = document.createElement("div");
    body.className = "pd-pause-body";

    const quickLabel = document.createElement("div");
    quickLabel.className = "pd-pause-col-label";
    quickLabel.textContent = "Cài đặt nhanh";
    quick.insertAdjacentElement("afterbegin", quickLabel);

    actions.insertAdjacentElement("beforebegin", body);
    body.appendChild(actions);
    body.appendChild(quick);
  }
}
export function enhanceModal(modalCard: HTMLElement): void {
  const setupPanel =
    modalCard.querySelector<HTMLElement>("#setup-panel") ??
    document.getElementById("setup-panel");
  if (!setupPanel || setupPanel.dataset.pdTwoTier === "1") return;
  setupPanel.dataset.pdTwoTier = "1";

  attachPanelOrnaments(modalCard);
  attachAmbientLanterns(modalCard);
  upgradeTitleBanner(modalCard);

  const factionGroup = findDirectChild(setupPanel, "opt-faction");
  const modeGroup = findDirectChild(setupPanel, "opt-mode");
  const mapSizeGroup = findDirectChild(setupPanel, "opt-map-size");
  const mapTypeGroup = findDirectChild(setupPanel, "opt-map-type");
  const diffGroup = findDirectChild(setupPanel, "opt-diff");
  const startBtn = document.getElementById("btn-start") as HTMLButtonElement | null;
  const loadSaveBtn = document.getElementById("btn-load-save") as HTMLButtonElement | null;

  const homeLayout = document.createElement("div");
  homeLayout.className = "pd-home-layout";

  const homeLeft = document.createElement("div");
  homeLeft.className = "pd-home-left";

  const homeActions = document.createElement("div");
  homeActions.className = "pd-home-actions";

  const homeRight = document.createElement("div");
  homeRight.className = "pd-home-right";

  const setupTier = document.createElement("div");
  setupTier.className = "pd-setup-tier";

  const setTier = (tier: "home" | "setup"): void => {
    homeLayout.hidden = tier !== "home";
    setupTier.hidden = tier !== "setup";
    modalCard.classList.toggle("pd-modal-setup", tier === "setup");
  };

  const tabsBar = document.createElement("div");
  tabsBar.className = "pd-preview-tabs";
  const paneOverview = document.createElement("div");
  paneOverview.className = "pd-preview-pane is-active";
  const paneGuide = document.createElement("div");
  paneGuide.className = "pd-preview-pane";
  const paneSettings = document.createElement("div");
  paneSettings.className = "pd-preview-pane";

  const tabOverviewBtn = document.createElement("button");
  tabOverviewBtn.type = "button";
  tabOverviewBtn.className = "pd-tab-btn is-active";
  tabOverviewBtn.textContent = "Quốc gia";

  const tabGuideBtn = document.createElement("button");
  tabGuideBtn.type = "button";
  tabGuideBtn.className = "pd-tab-btn";
  tabGuideBtn.textContent = "Hướng dẫn";

  const tabSettingsBtn = document.createElement("button");
  tabSettingsBtn.type = "button";
  tabSettingsBtn.className = "pd-tab-btn";
  tabSettingsBtn.textContent = "Cài đặt";

  const setRightTab = (tab: "overview" | "guide" | "settings"): void => {
    tabOverviewBtn.classList.toggle("is-active", tab === "overview");
    tabGuideBtn.classList.toggle("is-active", tab === "guide");
    tabSettingsBtn.classList.toggle("is-active", tab === "settings");
    paneOverview.classList.toggle("is-active", tab === "overview");
    paneGuide.classList.toggle("is-active", tab === "guide");
    paneSettings.classList.toggle("is-active", tab === "settings");
  };

  tabOverviewBtn.addEventListener("click", () => setRightTab("overview"));
  tabGuideBtn.addEventListener("click", () => setRightTab("guide"));
  tabSettingsBtn.addEventListener("click", () => setRightTab("settings"));
  tabsBar.append(tabOverviewBtn, tabGuideBtn, tabSettingsBtn);

  const renderOverviewPane = (): void => {
    const fKey = getSelectedFaction();
    const meta = FACTION_META[fKey];
    const save = readLocalSaveSummary();
    const saveBadge = save
      ? `<span class="pd-badge pd-badge--jade">Đã lưu: ${save.factionName} · Đời ${save.age} · ${save.timeText}</span>`
      : `<span class="pd-badge">Sẵn sàng xuất quân</span>`;

    paneOverview.innerHTML = `
      <div class="pd-hero-card">
        <span class="pd-crest">${meta.svg}</span>
        <div class="pd-hero-meta">
          <div class="pd-hero-heading">${meta.name} · ${meta.chip}</div>
          <p class="pd-hero-copy">${meta.lore}</p>
          <div>${saveBadge}</div>
        </div>
      </div>
      <div class="pd-motto-strip">Đình Làng · Ấp Ủ · Tượng Binh · Phục Hưng · Ưu Tiên · Nỗ Liên Châu</div>
    `;
  };

  renderOverviewPane();

  paneGuide.innerHTML = `
    <div class="pd-guide-grid">
      ${QUICK_GUIDE_CARDS.map(
        (card) => `
        <div class="pd-guide-card">
          <div class="pd-guide-title">${card.title}</div>
          <div class="pd-guide-desc">${card.desc}</div>
        </div>`,
      ).join("")}
    </div>
  `;

  const settingsGrid = document.createElement("div");
  settingsGrid.className = "pd-lobby-settings-grid";
  settingsGrid.append(
    buildLobbySettingButton("btn-music", "Nhạc: Bật"),
    buildLobbySettingButton("btn-sound", "Âm: Bật"),
    buildLobbySettingButton("btn-quality", "Đồ họa: Tự động"),
    buildLobbySettingButton("btn-atmosphere", "Trời: Tự động"),
  );
  paneSettings.appendChild(settingsGrid);

  homeRight.append(tabsBar, paneOverview, paneGuide, paneSettings);
  
  const makeHomeBtn = (
    cls: string,
    iconSvg: string,
    title: string,
    sub: string,
    onClick: () => void,
  ): HTMLButtonElement => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `pd-btn pd-home-btn ${cls}`;
    btn.innerHTML = `
      ${iconSvg}
      <span class="pd-home-btn-text">
        <span class="pd-home-btn-title">${title}</span>
        <span class="pd-home-btn-sub">${sub}</span>
      </span>
    `;
    btn.addEventListener("click", onClick);
    return btn;
  };

  if (loadSaveBtn) {
    refreshLoadSaveButton();
    homeActions.appendChild(loadSaveBtn);
  }

  homeActions.appendChild(
    makeHomeBtn("pd-btn--primary", PIXEL_ICONS.swords, "Trận mới", "Chọn phe, bản đồ & AI", () => {
      setTier("setup");
    }),
  );

  homeActions.appendChild(
    makeHomeBtn("pd-btn--ghost", PIXEL_ICONS.multi, "Nhiều người chơi", "Đấu mạng hoặc phòng LAN", () => {
      setTier("setup");
    }),
  );

  const pairRow = document.createElement("div");
  pairRow.className = "pd-home-row-pair";

  const guideBtn = document.createElement("button");
  guideBtn.type = "button";
  guideBtn.className = "pd-btn pd-btn--ghost";
  guideBtn.innerHTML = `${PIXEL_ICONS.guide}<span>Hướng dẫn</span>`;
  guideBtn.addEventListener("click", () => setRightTab("guide"));

  const settingsBtn = document.createElement("button");
  settingsBtn.type = "button";
  settingsBtn.className = "pd-btn pd-btn--ghost";
  settingsBtn.innerHTML = `${PIXEL_ICONS.settings}<span>Cài đặt</span>`;
  settingsBtn.addEventListener("click", () => setRightTab("settings"));

  pairRow.append(guideBtn, settingsBtn);
  homeActions.appendChild(pairRow);

  homeLeft.appendChild(homeActions);
  homeLayout.append(homeLeft, homeRight);

  const topbar = document.createElement("div");
  topbar.className = "pd-setup-topbar";

  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.className = "pd-btn pd-btn--ghost";
  backBtn.textContent = "← Quay lại";
  backBtn.addEventListener("click", () => {
    refreshLoadSaveButton();
    renderOverviewPane();
    setTier("home");
  });

  const setupHeading = document.createElement("span");
  setupHeading.className = "pd-setup-heading";
  setupHeading.textContent = "Thiết lập trận đấu";

  topbar.append(backBtn, setupHeading);
  if (startBtn) {
    startBtn.classList.add("pd-btn", "pd-btn--primary");
    topbar.appendChild(startBtn);
  }

  const columns = document.createElement("div");
  columns.className = "pd-setup-columns";
  const colLeft = document.createElement("div");
  colLeft.className = "pd-setup-col-left";
  const colRight = document.createElement("div");
  colRight.className = "pd-setup-col-right";

  const moved = new Set<HTMLElement>();
  const moveTo = (el: HTMLElement | null, target: HTMLElement): void => {
    if (!el || moved.has(el)) return;
    moved.add(el);
    target.appendChild(el);
  };

  moveTo(factionGroup, colLeft);
  moveTo(modeGroup, colRight);
  moveTo(diffGroup, colRight);
  moveTo(mapSizeGroup, colRight);
  moveTo(mapTypeGroup, colRight);

  for (const child of Array.from(setupPanel.children)) {
    if (child instanceof HTMLElement && !moved.has(child)) {
      if (child.children.length > 0 || (child.textContent ?? "").trim().length > 0) {
        moveTo(child, colRight);
      }
    }
  }

  columns.append(colLeft, colRight);
  setupTier.append(topbar, columns);
  setupPanel.append(homeLayout, setupTier);

  const factionRow = document.getElementById("opt-faction");
  factionRow?.addEventListener("click", () => {
    window.setTimeout(() => {
      try {
        renderOverviewPane();
      } catch {
        /* ignore */
      }
    }, 0);
  });

  setTier("home");
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
  const existing = modalCard.querySelector(".pd-rank-banner");
  const endgame = isSetupHidden();
  modalCard.classList.toggle("pd-modal-endgame", endgame);

  const startBtn = document.getElementById("btn-start");
  if (!endgame) {
    if (existing) existing.remove();
    const topbar = modalCard.querySelector<HTMLElement>(".pd-setup-topbar");
    if (startBtn && topbar && !topbar.contains(startBtn)) {
      topbar.appendChild(startBtn);
    }
    return;
  }

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
  banner.className = "pd-rank-banner";
  banner.innerHTML = `
    <div class="pd-medal-wrap" title="Xếp hạng ${rank}">
      ${RANK_MEDALS[rank]}
      <span class="pd-medal-label">${rankTitles[rank]}</span>
    </div>
    <div class="pd-bars">
      <div class="pd-bar-row">
        <span class="pd-bar-label">Kinh tế</span>
        <div class="pd-bar-track"><div class="pd-bar-fill" style="width:${pct(econ)}%"></div></div>
        <span class="pd-bar-val">${econ}</span>
      </div>
      <div class="pd-bar-row">
        <span class="pd-bar-label">Quân sự</span>
        <div class="pd-bar-track"><div class="pd-bar-fill" style="width:${pct(mil)}%"></div></div>
        <span class="pd-bar-val">${mil}</span>
      </div>
      <div class="pd-bar-row">
        <span class="pd-bar-label">Công trình</span>
        <div class="pd-bar-track"><div class="pd-bar-fill" style="width:${pct(bld)}%"></div></div>
        <span class="pd-bar-val">${bld}</span>
      </div>
    </div>
  `;

  if (!existing) {
    tipEl.insertAdjacentElement("beforebegin", banner);
  }
}

export function initLobbyUI(): void {
  try {
    const modalCard = document.querySelector<HTMLElement>("#modal .modal-card");
    if (!modalCard) return;

    upgradeFactionButtons();
    enhanceModal(modalCard);
    enhancePauseModal();

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
      } catch {
        /* guard against render-blocking errors */
      }
    };
    update();

    const observer = new MutationObserver(() => {
      update();
    });
    observer.observe(tipsEl, { childList: true, characterData: true, subtree: true });

    const setupPanel = document.getElementById("setup-panel");
    if (setupPanel) {
      observer.observe(setupPanel, { attributes: true, attributeFilter: ["style", "hidden", "class"] });
    }
  } catch {
    /* never block main game boot */
  }
}
