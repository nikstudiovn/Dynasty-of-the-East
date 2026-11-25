import "./sideRailHud.css";
import { getIconSvg, resolveCommandIconKey, type SideRailIconKey } from "./sideRailIcons";

const LS_COLLAPSED = "dote_rails_collapsed";
const LEGACY_COLLAPSED = "pixel_dynasty_rails_collapsed";
const LS_LEFT_HANDED = "dote_left_handed";
const LEGACY_LEFT_HANDED = "pixel_dynasty_left_handed";

type BuildTab = "eco" | "mil" | "special";

interface GlobalBtnSpec {
  id: string;
  icon: SideRailIconKey;
  shortLabel: string;
  tooltip: string;
}

const LEFT_RAIL_SPECS: GlobalBtnSpec[] = [
  { id: "btn-grp-1", icon: "grp_1", shortLabel: "Đạo 1", tooltip: "Chọn Đạo 1" },
  { id: "btn-grp-2", icon: "grp_2", shortLabel: "Đạo 2", tooltip: "Chọn Đạo 2" },
  { id: "btn-grp-3", icon: "grp_3", shortLabel: "Đạo 3", tooltip: "Chọn Đạo 3" },
  { id: "btn-grp-assign", icon: "grp_assign", shortLabel: "Gán", tooltip: "Gán đơn vị vào đạo" },
  { id: "btn-all-army", icon: "all_army", shortLabel: "Toàn quân", tooltip: "Chọn toàn bộ quân đội" },
  { id: "btn-idle-vil", icon: "idle_vil", shortLabel: "Dân rảnh", tooltip: "Tìm dân làng đang rảnh" },
  { id: "btn-town-bell", icon: "town_bell", shortLabel: "Chuông", tooltip: "Chuông Báo động dân trú ẩn" },
];

const RIGHT_TACTIC_SPECS: GlobalBtnSpec[] = [
  { id: "btn-focus-tc", icon: "focus_tc", shortLabel: "Về Đình", tooltip: "Đưa camera về Đình Làng" },
  { id: "btn-attack-move", icon: "attack_move", shortLabel: "Đánh tiến", tooltip: "Lệnh Đánh tiến (Attack Move)" },
  { id: "btn-stance", icon: "stance", shortLabel: "Chủ động", tooltip: "Đổi thế trận quân" },
];

function readPref(key: string, legacyKey: string): boolean {
  try {
    const cur = window.localStorage.getItem(key);
    if (cur !== null) return cur === "1";
    const legacy = window.localStorage.getItem(legacyKey);
    if (legacy !== null) {
      window.localStorage.setItem(key, legacy);
      window.localStorage.removeItem(legacyKey);
      return legacy === "1";
    }
    return false;
  } catch {
    return false;
  }
}

function writePref(key: string, val: boolean): void {
  try {
    window.localStorage.setItem(key, val ? "1" : "0");
  } catch {
  }
}

const SPECIAL_BUILDINGS = new Set(["dock", "temple"]);
const MILITARY_BUILDINGS = new Set([
  "barracks", "archery_range", "watch_tower", "wall", "gate", "blacksmith",
  "stable", "siege_workshop", "imperial_citadel",
]);

function classifyBuildTab(type: string): BuildTab {
  if (SPECIAL_BUILDINGS.has(type)) return "special";
  if (MILITARY_BUILDINGS.has(type)) return "mil";
  return "eco";
}

function detectContextMode(buttons: HTMLButtonElement[]): "build" | "train" | "army" {
  const labels = buttons.map((b) => (b.textContent || "").toLowerCase());
  if (buttons.some(button => button.dataset.buildType)) {
    return "build";
  }
  if (
    labels.some(
      (l) =>
        l.includes("sinh dân") || l.includes("lên ") || l.includes("binh") ||
        l.includes("cung") || l.includes("nỏ") || l.includes("pháo") ||
        l.includes("rèn") || l.includes("bán") || l.includes("mua"),
    )
  ) {
    return "train";
  }
  return "army";
}

export function initSideRailHud(): void {
  if (document.body.dataset.doteSideRailInit === "1") return;
  const gameWrap = document.getElementById("game-wrap");
  if (!gameWrap) return;

  document.body.dataset.doteSideRailInit = "1";
  document.body.classList.add("dote-side-rail-active");

  let collapsed = readPref(LS_COLLAPSED, LEGACY_COLLAPSED);
  let leftHanded = readPref(LS_LEFT_HANDED, LEGACY_LEFT_HANDED);
  let drawerOpen = false;
  let activeTab: BuildTab = "eco";

  const applyPrefs = (): void => {
    document.body.classList.toggle("dote-rails-collapsed", collapsed);
    document.body.classList.toggle("dote-left-handed", leftHanded);
    const lhBtn = document.getElementById("dote-btn-left-handed");
    if (lhBtn) {
      lhBtn.textContent = leftHanded ? "Thuận tay trái: BẬT" : "Thuận tay trái: TẮT";
    }
  };

  const tooltipEl = document.createElement("div");
  tooltipEl.className = "dote-rail-tooltip";
  gameWrap.appendChild(tooltipEl);

  let pressTimer: number | null = null;
  const hideTooltip = (): void => {
    if (pressTimer !== null) {
      window.clearTimeout(pressTimer);
      pressTimer = null;
    }
    tooltipEl.classList.remove("visible");
  };

  const attachLongPress = (el: HTMLElement, getText: () => string): void => {
    if (el.dataset.doteLongPress === "1") return;
    el.dataset.doteLongPress = "1";
    el.addEventListener("pointerdown", () => {
      hideTooltip();
      pressTimer = window.setTimeout(() => {
        const msg = getText().trim();
        if (!msg) return;
        tooltipEl.textContent = msg;
        const rect = el.getBoundingClientRect();
        tooltipEl.style.top = `${Math.max(8, Math.min(window.innerHeight - 36, rect.top + rect.height / 2 - 14))}px`;
        const showOnLeft = rect.left > window.innerWidth / 2;
        if (showOnLeft) {
          tooltipEl.style.left = "auto";
          tooltipEl.style.right = `${Math.max(8, window.innerWidth - rect.left + 8)}px`;
        } else {
          tooltipEl.style.right = "auto";
          tooltipEl.style.left = `${Math.min(window.innerWidth - 160, rect.right + 8)}px`;
        }
        tooltipEl.classList.add("visible");
      }, 400);
    });
    el.addEventListener("pointerup", hideTooltip);
    el.addEventListener("pointercancel", hideTooltip);
    el.addEventListener("pointerleave", hideTooltip);
  };

  const leftRail = document.createElement("aside");
  leftRail.className = "dote-rail dote-rail-left";
  leftRail.setAttribute("aria-label", "Thanh lệnh toàn cục");
  const leftScroll = document.createElement("div");
  leftScroll.className = "dote-rail-scroll";
  leftRail.appendChild(leftScroll);

  const rightRail = document.createElement("aside");
  rightRail.className = "dote-rail dote-rail-right";
  rightRail.setAttribute("aria-label", "Thanh lệnh ngữ cảnh");
  const rightScroll = document.createElement("div");
  rightScroll.className = "dote-rail-scroll";
  rightRail.appendChild(rightScroll);

  const edgeHandle = document.createElement("button");
  edgeHandle.type = "button";
  edgeHandle.className = "dote-rail-handle";
  edgeHandle.setAttribute("aria-label", "Mở thanh lệnh");
  edgeHandle.innerHTML = getIconSvg("expand", 24);
  edgeHandle.addEventListener("click", () => {
    collapsed = false;
    writePref(LS_COLLAPSED, false);
    applyPrefs();
  });

  const selPill = document.createElement("div");
  selPill.className = "dote-sel-pill";

  const drawer = document.createElement("section");
  drawer.className = "dote-rail-drawer";
  drawer.setAttribute("aria-label", "Bảng lệnh chi tiết");

  const drawerHeader = document.createElement("div");
  drawerHeader.className = "dote-drawer-header";
  const drawerTitle = document.createElement("span");
  drawerTitle.textContent = "Lệnh Ngữ Cảnh";
  const drawerClose = document.createElement("button");
  drawerClose.type = "button";
  drawerClose.className = "dote-drawer-close";
  drawerClose.innerHTML = getIconSvg("close", 16);
  drawerClose.setAttribute("aria-label", "Đóng ngăn kéo");
  drawerHeader.append(drawerTitle, drawerClose);

  const drawerTabs = document.createElement("div");
  drawerTabs.className = "dote-drawer-tabs";
  const tabDefs: { id: BuildTab; label: string; icon: SideRailIconKey }[] = [
    { id: "eco", label: "Kinh tế", icon: "tab_eco" },
    { id: "mil", label: "Quân sự", icon: "tab_mil" },
    { id: "special", label: "Đặc biệt", icon: "temple" },
  ];
  const tabButtons: Record<BuildTab, HTMLButtonElement> = {} as Record<BuildTab, HTMLButtonElement>;

  const drawerBody = document.createElement("div");
  drawerBody.className = "dote-drawer-body";

  drawer.append(drawerHeader, drawerTabs, drawerBody);

  const setDrawerOpen = (open: boolean): void => {
    drawerOpen = open;
    drawer.classList.toggle("dote-drawer-open", open);
    drawer.inert = !open;
    drawerBtn.setAttribute("aria-expanded", String(open));
    drawerBtn.classList.toggle("dote-active", open);
  };

  drawer.inert = true;
  drawerClose.addEventListener("click", () => setDrawerOpen(false));

  const drawerBtn = document.createElement("button");
  drawerBtn.type = "button";
  drawerBtn.className = "dote-rail-btn";
  drawerBtn.setAttribute("aria-label", "Mở bảng lệnh chi tiết");
  drawerBtn.setAttribute("aria-expanded", "false");
  drawerBtn.innerHTML = `${getIconSvg("tab_eco", 24)}<span class="dote-btn-lbl">Lệnh</span>`;
  drawerBtn.addEventListener("click", () => setDrawerOpen(!drawerOpen));
  attachLongPress(drawerBtn, () => "Mở/Đóng bảng lệnh chi tiết");

  const collapseBtn = document.createElement("button");
  collapseBtn.type = "button";
  collapseBtn.className = "dote-rail-btn dote-rail-collapse-btn";
  collapseBtn.setAttribute("aria-label", "Thu gọn thanh lệnh");
  collapseBtn.innerHTML = `${getIconSvg("collapse", 16)}<span class="dote-btn-lbl">Ẩn</span>`;
  collapseBtn.addEventListener("click", () => {
    collapsed = true;
    setDrawerOpen(false);
    writePref(LS_COLLAPSED, true);
    applyPrefs();
  });
  attachLongPress(collapseBtn, () => "Thu gọn thanh lệnh hai bên");

  const decorateGlobalBtn = (spec: GlobalBtnSpec): HTMLElement | null => {
    const el = document.getElementById(spec.id);
    if (!el) return null;
    el.classList.add("dote-rail-btn");
    el.setAttribute("aria-label", spec.tooltip);
    el.innerHTML = `${getIconSvg(spec.icon, 24)}<span class="dote-btn-lbl">${spec.shortLabel}</span>`;
    attachLongPress(el, () => el.getAttribute("title") || spec.tooltip);
    return el;
  };

  for (const spec of LEFT_RAIL_SPECS) {
    const btn = decorateGlobalBtn(spec);
    if (btn) leftScroll.appendChild(btn);
  }

  rightScroll.appendChild(drawerBtn);
  for (const spec of RIGHT_TACTIC_SPECS) {
    const btn = decorateGlobalBtn(spec);
    if (btn) rightScroll.appendChild(btn);
  }
  rightRail.appendChild(collapseBtn);

  const selPortrait = document.getElementById("sel-portrait");
  const selTitle = document.getElementById("sel-title");
  if (selPortrait) selPill.appendChild(selPortrait);
  if (selTitle) selPill.appendChild(selTitle);

  const cmdButtons = document.getElementById("cmd-buttons");
  if (cmdButtons) {
    drawerBody.appendChild(cmdButtons);
  }

  gameWrap.append(leftRail, rightRail, drawer, selPill, edgeHandle);

  const scrollRegions = [leftScroll, rightScroll, drawerBody];
  const refreshScrollHints = (): void => {
    for (const region of scrollRegions) {
      region.toggleAttribute("data-dote-more", region.scrollHeight - region.scrollTop > region.clientHeight + 2);
    }
  };
  const scrollResize = new ResizeObserver(refreshScrollHints);
  if (cmdButtons) scrollResize.observe(cmdButtons);
  for (const region of scrollRegions) {
    scrollResize.observe(region);
    region.addEventListener("scroll", () => { hideTooltip(); refreshScrollHints(); }, { passive: true });
  }
  for (const panel of [leftRail, rightRail, drawer]) {
    for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel",
      "touchstart", "touchmove", "touchend", "touchcancel", "wheel"]) {
      panel.addEventListener(type, event => event.stopPropagation(), { passive: true });
    }
  }

  let isMutatingCmd = false;
  const applyTabFilter = (): void => {
    if (!cmdButtons) return;
    const btns = Array.from(cmdButtons.querySelectorAll<HTMLButtonElement>("button.act-btn"));
    const mode = detectContextMode(btns);

    drawerTabs.style.display = mode === "build" ? "flex" : "none";
    if (mode === "build") {
      drawerTitle.textContent = "Xây Dựng";
      drawerBtn.innerHTML = `${getIconSvg(tabDefs.find(tab => tab.id === activeTab)!.icon, 24)}<span class="dote-btn-lbl">Xây</span>`;
    } else if (mode === "train") {
      drawerTitle.textContent = "Huấn Luyện & Lên Đời";
      drawerBtn.innerHTML = `${getIconSvg("train", 24)}<span class="dote-btn-lbl">Luyện</span>`;
    } else {
      drawerTitle.textContent = "Quân Đội & Chiến Thuật";
      drawerBtn.innerHTML = `${getIconSvg("attack_move", 24)}<span class="dote-btn-lbl">Quân</span>`;
    }

    for (const tb of Object.values(tabButtons)) {
      tb.classList.toggle("active", tb.dataset.tab === activeTab);
    }

    for (const btn of btns) {
      if (mode === "build") {
        const type = btn.dataset.buildType;
        btn.classList.toggle("dote-hidden-by-tab", Boolean(type && classifyBuildTab(type) !== activeTab));
      } else {
        btn.classList.remove("dote-hidden-by-tab");
      }
    }
  };

  for (const t of tabDefs) {
    const tb = document.createElement("button");
    tb.type = "button";
    tb.className = "dote-drawer-tab";
    tb.dataset.tab = t.id;
    tb.innerHTML = `${getIconSvg(t.icon, 16)}<span>${t.label}</span>`;
    tb.addEventListener("click", () => {
      activeTab = t.id;
      applyTabFilter();
      drawerBody.scrollTop = 0;
      refreshScrollHints();
    });
    tabButtons[t.id] = tb;
    drawerTabs.appendChild(tb);
  }

  const decorateCmdButtons = (): void => {
    if (!cmdButtons || isMutatingCmd) return;
    isMutatingCmd = true;
    try {
      const btns = Array.from(cmdButtons.querySelectorAll<HTMLButtonElement>("button.act-btn"));
      for (const btn of btns) {
        if (btn.dataset.doteDecorated !== "1") {
          const spans = btn.querySelectorAll("span");
          const labelText = (spans[0]?.textContent || btn.textContent || "").trim();
          const costText = (spans[1]?.textContent || "").trim();
          btn.dataset.doteLabel = labelText;
          btn.dataset.doteDecorated = "1";
          const iconKey = resolveCommandIconKey(labelText);
          btn.innerHTML = `<span class="dote-cmd-icon">${getIconSvg(iconKey, 24)}</span><span class="dote-cmd-text"><span>${labelText}</span>${costText ? `<span class="act-cost">${costText}</span>` : ""}</span>`;
          attachLongPress(btn, () => (costText ? `${labelText} (${costText})` : labelText));
        }
      }
      applyTabFilter();
    } finally {
      isMutatingCmd = false;
    }
  };

  if (cmdButtons) {
    decorateCmdButtons();
    const observer = new MutationObserver(() => {
      decorateCmdButtons();
    });
    observer.observe(cmdButtons, { childList: true });
  }

  document.addEventListener("pointerdown", (e) => {
    if (!drawerOpen) return;
    const target = e.target as Node | null;
    if (!target) return;
    if (drawer.contains(target) || rightRail.contains(target)) return;
    setDrawerOpen(false);
  });

  const hudSettings = document.getElementById("hud-settings");
  if (hudSettings && !document.getElementById("dote-btn-left-handed")) {
    const lhBtn = document.createElement("button");
    lhBtn.type = "button";
    lhBtn.id = "dote-btn-left-handed";
    lhBtn.className = "mini-btn dote-lh-toggle";
    lhBtn.addEventListener("click", () => {
      leftHanded = !leftHanded;
      writePref(LS_LEFT_HANDED, leftHanded);
      applyPrefs();
    });
    hudSettings.appendChild(lhBtn);
  }

  applyPrefs();
}
