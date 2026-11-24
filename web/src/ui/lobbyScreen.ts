interface FactionMeta {
  name: string;
  chip: string;
  stat: string;
  svg: string;
}

const FACTION_META: Record<string, FactionMeta> = {
  dai_viet: {
    name: "Đại Việt",
    chip: "Tượng Binh",
    stat: "+15% Lúa & Tre",
    svg: `<svg viewBox="0 0 36 36" aria-hidden="true">
      <defs>
        <linearGradient id="pdDvBg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#D93829"/>
          <stop offset="100%" stop-color="#7F1414"/>
        </linearGradient>
      </defs>
      <path d="M6 5h24v16c0 6.5-12 11-12 11S6 27.5 6 21V5z" fill="url(#pdDvBg)" stroke="#F5B841" stroke-width="2"/>
      <circle cx="18" cy="15.5" r="5.2" fill="none" stroke="#FFE38A" stroke-width="1.6"/>
      <path d="M18 8.5v14M11 15.5h14M13.2 10.7l9.6 9.6M22.8 10.7l-9.6 9.6" stroke="#F5B841" stroke-width="1.4" stroke-linecap="round"/>
      <circle cx="18" cy="15.5" r="2.2" fill="#FFE38A"/>
    </svg>`,
  },
  trung_nguyen: {
    name: "Trung Nguyên",
    chip: "Nỏ Liên Châu",
    stat: "-15% Chi phí Lên đời",
    svg: `<svg viewBox="0 0 36 36" aria-hidden="true">
      <defs>
        <linearGradient id="pdTnBg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#1F9D7A"/>
          <stop offset="100%" stop-color="#0D4F3E"/>
        </linearGradient>
      </defs>
      <path d="M6 5h24v16c0 6.5-12 11-12 11S6 27.5 6 21V5z" fill="url(#pdTnBg)" stroke="#F5B841" stroke-width="2"/>
      <path d="M18 9l5.5 6.5L18 22l-5.5-6.5L18 9z" fill="none" stroke="#FFE38A" stroke-width="1.8"/>
      <path d="M18 12.2l2.6 3.3-2.6 3.3-2.6-3.3 2.6-3.3z" fill="#F5B841"/>
    </svg>`,
  },
  bac_cuong: {
    name: "Bắc Cương",
    chip: "Thiết Kỵ Xạ",
    stat: "Kỵ binh +10% Tốc độ",
    svg: `<svg viewBox="0 0 36 36" aria-hidden="true">
      <defs>
        <linearGradient id="pdBcBg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#2563EB"/>
          <stop offset="100%" stop-color="#162957"/>
        </linearGradient>
      </defs>
      <path d="M6 5h24v16c0 6.5-12 11-12 11S6 27.5 6 21V5z" fill="url(#pdBcBg)" stroke="#E2E8F0" stroke-width="2"/>
      <path d="M11 18c2.2-4.8 5.2-7 7-7s4.8 2.2 7 7c-2.6-.9-4.7-1.1-7-1.1S13.6 17.1 11 18z" fill="#E2E8F0"/>
      <path d="M14.5 21.5c1.8 1.8 5.2 1.8 7 0" fill="none" stroke="#93C5FD" stroke-width="1.8" stroke-linecap="round"/>
    </svg>`,
  },
};

const QUICK_GUIDE_CARDS: Array<{ title: string; desc: string }> = [
  {
    title: "1. Chạm chọn & Khai thác",
    desc: "Chạm nông dân rồi chạm Lúa, Tre, Đá hoặc Bãi Vàng để thu thập tài nguyên tự động.",
  },
  {
    title: "2. Zoom 2 ngón & Xoay 3D",
    desc: "Chụm/mở 2 ngón để thu phóng bản đồ; giữ và kéo nhẹ để xoay góc nhìn 3D chiến trường.",
  },
  {
    title: "3. Kéo chọn cụm & Đạo 1–3",
    desc: "Kéo khung chọn nhiều quân cùng lúc và gán vào Đạo 1–3 để điều phối tấn công nhanh.",
  },
  {
    title: "4. Chuông Báo & Lên 4 Đời",
    desc: "Rung Chuông Báo khi bị tập kích để dân vào nhà chính; tích đủ tài nguyên để Lên 4 Đời.",
  },
];

function upgradeFactionButtons(): void {
  const row = document.getElementById("opt-faction");
  if (!row) return;

  const buttons = row.querySelectorAll<HTMLButtonElement>(".opt-btn");
  buttons.forEach((btn) => {
    if (btn.dataset.pdEnhanced === "1") return;
    const key = btn.dataset.val || "";
    const meta = FACTION_META[key];
    if (!meta) return;

    btn.dataset.pdEnhanced = "1";
    btn.classList.add("pd-faction-card");
    btn.innerHTML = `
      <span class="pd-crest">${meta.svg}</span>
      <span class="pd-faction-name">${meta.name}</span>
      <span class="pd-chip">${meta.chip}</span>
      <span class="pd-faction-stat">${meta.stat}</span>
    `;
  });
}

function injectQuickGuide(modalCard: HTMLElement): void {
  if (modalCard.querySelector(".pd-guide-wrap")) return;

  const wrap = document.createElement("div");
  wrap.className = "pd-guide-wrap";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "pd-guide-toggle";
  toggle.setAttribute("aria-expanded", "false");
  toggle.innerHTML = `<span>Hướng dẫn nhanh</span><span>▾</span>`;

  const grid = document.createElement("div");
  grid.className = "pd-guide-grid";
  grid.innerHTML = QUICK_GUIDE_CARDS.map(
    (card) => `
      <div class="pd-guide-card">
        <div class="pd-guide-title">${card.title}</div>
        <div class="pd-guide-desc">${card.desc}</div>
      </div>
    `
  ).join("");

  toggle.addEventListener("click", () => {
    const open = grid.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    const arrow = toggle.lastElementChild;
    if (arrow) arrow.textContent = open ? "▴" : "▾";
  });

  wrap.appendChild(toggle);
  wrap.appendChild(grid);

  const setupPanel = document.getElementById("setup-panel");
  if (setupPanel && modalCard.contains(setupPanel)) {
    setupPanel.appendChild(wrap);
  } else {
    modalCard.appendChild(wrap);
  }
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

function renderEndgameScorecard(modalCard: HTMLElement, tipsEl: HTMLElement): void {
  const existing = modalCard.querySelector(".pd-rank-banner");
  if (!isSetupHidden()) {
    if (existing) existing.remove();
    return;
  }

  const rawText = (tipsEl.textContent || "").trim();
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

  let rank: "S" | "A" | "B" | "C" = "C";
  if (total >= 2400) rank = "S";
  else if (total >= 1500) rank = "A";
  else if (total >= 800) rank = "B";

  const maxVal = Math.max(econ, mil, bld, 1);
  const pct = (v: number): number => Math.max(8, Math.min(100, Math.round((v / maxVal) * 100)));

  const banner = existing ?? document.createElement("div");
  banner.className = "pd-rank-banner";
  banner.innerHTML = `
    <div class="pd-seal pd-rank-${rank}" title="Xếp hạng ${rank}">${rank}</div>
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
    tipsEl.insertAdjacentElement("beforebegin", banner);
  }
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

function selectModeOption(preferMulti: boolean): void {
  const modeRoot = document.getElementById("opt-mode");
  if (!modeRoot) return;
  const pills = Array.from(modeRoot.querySelectorAll<HTMLElement>(".pill, button"));
  if (pills.length === 0) return;
  const multiRe = /(multi|online|2p|pvp|coop|lan|net)/i;
  const soloRe = /(solo|single|1p|offline|ai)/i;
  const target =
    pills.find((p) => {
      const v = `${p.dataset.v ?? ""} ${p.textContent ?? ""}`;
      return preferMulti ? multiRe.test(v) : soloRe.test(v);
    }) ?? (preferMulti ? pills[pills.length - 1] : pills[0]);
  target?.click();
}

export function enhanceModal(modalCard: HTMLElement): void {
  const setupPanel =
    modalCard.querySelector<HTMLElement>("#setup-panel") ??
    document.getElementById("setup-panel");
  if (!setupPanel || setupPanel.dataset.pdTwoTier === "1") return;
  setupPanel.dataset.pdTwoTier = "1";

  const factionGroup = findDirectChild(setupPanel, "opt-faction");
  const modeGroup = findDirectChild(setupPanel, "opt-mode");
  const mapSizeGroup = findDirectChild(setupPanel, "opt-map-size");
  const mapTypeGroup = findDirectChild(setupPanel, "opt-map-type");
  const diffGroup = findDirectChild(setupPanel, "opt-diff");
  const startGroup = findDirectChild(setupPanel, "btn-start");
  const loadSaveBtn = document.getElementById("btn-load-save") as HTMLButtonElement | null;

  const homeTier = document.createElement("div");
  homeTier.className = "pd-home-actions";

  const setupTier = document.createElement("div");
  setupTier.className = "pd-setup-tier";

  const setTier = (tier: "home" | "setup"): void => {
    homeTier.hidden = tier !== "home";
    setupTier.hidden = tier !== "setup";
    modalCard.classList.toggle("pd-modal-setup", tier === "setup");
  };

  const makeHomeBtn = (
    cls: string,
    icon: string,
    title: string,
    sub: string,
    onClick: () => void,
  ): HTMLButtonElement => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `pd-home-btn ${cls}`;
    btn.innerHTML = `
      <span class="pd-home-btn-icon" aria-hidden="true">${icon}</span>
      <span class="pd-home-btn-text">
        <span class="pd-home-btn-title">${title}</span>
        <span class="pd-home-btn-sub">${sub}</span>
      </span>
    `;
    btn.addEventListener("click", onClick);
    return btn;
  };

  homeTier.appendChild(
    makeHomeBtn("pd-home-btn-primary", "⚔️", "Đấu Đơn", "Chinh phạt AI trên bản đồ chiến thuật", () => {
      selectModeOption(false);
      setTier("setup");
    }),
  );

  homeTier.appendChild(
    makeHomeBtn("pd-home-btn-multi", "🌐", "Đấu Mạng", "Tạo phòng hoặc đối đầu trực tuyến", () => {
      selectModeOption(true);
      setTier("setup");
    }),
  );

  if (loadSaveBtn) {
    loadSaveBtn.classList.add("pd-home-btn", "pd-home-btn-save");
    homeTier.appendChild(loadSaveBtn);
  } else {
    const fallbackSave = makeHomeBtn(
      "pd-home-btn-save",
      "💾",
      "Tiếp tục ván đã lưu",
      "Chưa có dữ liệu lưu",
      () => {},
    );
    fallbackSave.id = "btn-load-save";
    fallbackSave.disabled = true;
    homeTier.appendChild(fallbackSave);
  }

  homeTier.appendChild(
    makeHomeBtn("pd-home-btn-guide", "📜", "Hướng dẫn nhanh", "Xem luật chơi, tài nguyên và mẹo xuất quân", () => {
      const guide = modalCard.querySelector<HTMLDetailsElement>("details.pd-guide");
      if (guide) {
        guide.open = !guide.open;
        if (guide.open) {
          guide.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }
    }),
  );

  const topbar = document.createElement("div");
  topbar.className = "pd-setup-topbar";

  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.className = "pd-btn-back";
  backBtn.textContent = "← Quay lại";
  backBtn.addEventListener("click", () => setTier("home"));
  topbar.appendChild(backBtn);

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
  moveTo(mapSizeGroup, colRight);
  moveTo(mapTypeGroup, colRight);
  moveTo(diffGroup, colRight);

  for (const child of Array.from(setupPanel.children)) {
    if (child instanceof HTMLElement && !moved.has(child) && child !== startGroup) {
      if (child.children.length > 0 || (child.textContent ?? "").trim().length > 0) {
        moveTo(child, colRight);
      } else {
        child.remove();
      }
    }
  }

  moveTo(startGroup, colRight);

  columns.appendChild(colLeft);
  columns.appendChild(colRight);
  setupTier.appendChild(topbar);
  setupTier.appendChild(columns);

  setupPanel.appendChild(homeTier);
  setupPanel.appendChild(setupTier);
  setTier("home");
}

export function initLobbyUI(): void {
  const modalCard = document.querySelector<HTMLElement>("#modal .modal-card");
  if (!modalCard) return;

  upgradeFactionButtons();
  enhanceModal(modalCard);
  injectQuickGuide(modalCard);

  const tipsEl = document.getElementById("modal-tips");
  if (!tipsEl) return;

  const update = (): void => renderEndgameScorecard(modalCard, tipsEl);
  update();

  const observer = new MutationObserver(() => {
    update();
  });
  observer.observe(tipsEl, { childList: true, characterData: true, subtree: true });

  const setupPanel = document.getElementById("setup-panel");
  if (setupPanel) {
    observer.observe(setupPanel, { attributes: true, attributeFilter: ["style", "hidden", "class"] });
  }
}
