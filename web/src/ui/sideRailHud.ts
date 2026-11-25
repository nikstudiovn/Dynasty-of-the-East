import "./sideRailHud.css";
import { getIconSvg, resolveCommandIconKey, type SideRailIconKey } from "./sideRailIcons";

const LS_COLLAPSED = "pixel_dynasty_rails_collapsed";
const LS_LEFT_HANDED = "pixel_dynasty_left_handed";

type BuildTab = "eco" | "mil" | "def";

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

function readPref(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writePref(key: string, val: boolean): void {
  try {
    window.localStorage.setItem(key, val ? "1" : "0");
  } catch {
    // Ignore storage quota or private mode errors
  }
}

function classifyBuildTab(label: string): BuildTab {
  const t = label.toLowerCase();
  if (t.includes("chòi") || t.includes("tường") || t.includes("cổng") || t.includes("choi") || t.includes("tuong") || t.includes("cong thanh")) {
    return "def";
  }
  if (
    t.includes("trại lính") ||
    t.includes("trại cung") ||
    t.includes("lò rèn") ||
    t.includes("chuồng") ||
    t.includes("công xưởng") ||
    t.includes("hoàng thành")
  ) {
    return "mil";
  }
  return "eco";
}

function detectContextMode(buttons: HTMLButtonElement[]): "build" | "train" | "army" {
  const labels = buttons.map((b) => (b.textContent || "").toLowerCase());
  if (labels.some((l) => l.startsWith("xây ") || l.includes("nhà ở") || l.includes("ruộng") || l.includes("trại lính"))) {
    return "build";
  }
  if (
    labels.some(
      (l) =>
        l.includes("sinh dân") ||
        l.includes("lên ") ||
        l.includes("binh") ||
        l.includes("cung") ||
        l.includes("nỏ") ||
        l.includes("pháo") ||
        l.includes("rèn") ||
        l.includes("bán") ||
        l.includes("mua")
    )
  ) {
    return "train";
  }
  return "army";
}

export function initSideRailHud(): void {
  if (document.body.dataset.pdSideRailInit === "1") return;
  const gameWrap = document.getElementById("game-wrap");
  if (!gameWrap) return;

  document.body.dataset.pdSideRailInit = "1";
  document.body.classList.add("pd-side-rail-active");

  let collapsed = readPref(LS_COLLAPSED);
  let leftHanded = readPref(LS_LEFT_HANDED);
  let drawerOpen = false;
  let activeTab: BuildTab = "eco";

  const applyPrefs = (): void => {
    document.body.classList.toggle("pd-rails-collapsed", collapsed);
    document.body.classList.toggle("pd-left-handed", leftHanded);
    const lhBtn = document.getElementById("pd-btn-left-handed");
    if (lhBtn) {
      lhBtn.textContent = leftHanded ? "Thuận tay trái: BẬT" : "Thuận tay trái: TẮT";
    }
  };

  // Tooltip element for ~400ms long-press
  const tooltipEl = document.createElement("div");
  tooltipEl.className = "pd-rail-tooltip";
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
    if (el.dataset.pdLongPress === "1") return;
    el.dataset.pdLongPress = "1";
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

  // Build Left Rail
  const leftRail = document.createElement("aside");
  leftRail.className = "pd-rail pd-rail-left";
  leftRail.setAttribute("aria-label", "Thanh lệnh toàn cục");
  const leftScroll = document.createElement("div");
  leftScroll.className = "pd-rail-scroll";
  leftRail.appendChild(leftScroll);

  // Build Right Rail
  const rightRail = document.createElement("aside");
  rightRail.className = "pd-rail pd-rail-right";
  rightRail.setAttribute("aria-label", "Thanh lệnh ngữ cảnh");
  const rightScroll = document.createElement("div");
  rightScroll.className = "pd-rail-scroll";
  rightRail.appendChild(rightScroll);

  // Collapse Handle (shown when .pd-rails-collapsed is active)
  const edgeHandle = document.createElement("button");
  edgeHandle.type = "button";
  edgeHandle.className = "pd-rail-handle";
  edgeHandle.setAttribute("aria-label", "Mở thanh lệnh");
  edgeHandle.innerHTML = getIconSvg("expand", 24);
  edgeHandle.addEventListener("click", () => {
    collapsed = false;
    writePref(LS_COLLAPSED, false);
    applyPrefs();
  });

  // Compact Selection Pill at Bottom Center
  const selPill = document.createElement("div");
  selPill.className = "pd-sel-pill";

  // Sliding Contextual Drawer
  const drawer = document.createElement("section");
  drawer.className = "pd-rail-drawer";
  drawer.setAttribute("aria-label", "Bảng lệnh chi tiết");

  const drawerHeader = document.createElement("div");
  drawerHeader.className = "pd-drawer-header";
  const drawerTitle = document.createElement("span");
  drawerTitle.textContent = "Lệnh Ngữ Cảnh";
  const drawerClose = document.createElement("button");
  drawerClose.type = "button";
  drawerClose.className = "pd-drawer-close";
  drawerClose.textContent = "×";
  drawerClose.setAttribute("aria-label", "Đóng ngăn kéo");
  drawerHeader.append(drawerTitle, drawerClose);

  const drawerTabs = document.createElement("div");
  drawerTabs.className = "pd-drawer-tabs";
  const tabDefs: { id: BuildTab; label: string; icon: SideRailIconKey }[] = [
    { id: "eco", label: "Kinh tế", icon: "tab_eco" },
    { id: "mil", label: "Quân sự", icon: "tab_mil" },
    { id: "def", label: "Phòng thủ", icon: "tab_def" },
  ];
  const tabButtons: Record<BuildTab, HTMLButtonElement> = {} as Record<BuildTab, HTMLButtonElement>;

  const drawerBody = document.createElement("div");
  drawerBody.className = "pd-drawer-body";

  drawer.append(drawerHeader, drawerTabs, drawerBody);

  const setDrawerOpen = (open: boolean): void => {
    drawerOpen = open;
    drawer.classList.toggle("pd-drawer-open", open);
    drawerBtn.classList.toggle("pd-active", open);
  };

  drawerClose.addEventListener("click", () => setDrawerOpen(false));

  // Drawer toggle button on Right Rail
  const drawerBtn = document.createElement("button");
  drawerBtn.type = "button";
  drawerBtn.className = "pd-rail-btn";
  drawerBtn.innerHTML = `${getIconSvg("tab_eco", 24)}<span class="pd-btn-lbl">Lệnh</span>`;
  drawerBtn.addEventListener("click", () => setDrawerOpen(!drawerOpen));
  attachLongPress(drawerBtn, () => "Mở/Đóng bảng lệnh chi tiết");

  // Collapse button on Right Rail
  const collapseBtn = document.createElement("button");
  collapseBtn.type = "button";
  collapseBtn.className = "pd-rail-btn pd-rail-collapse-btn";
  collapseBtn.setAttribute("aria-label", "Thu gọn thanh lệnh");
  collapseBtn.innerHTML = `${getIconSvg("collapse", 16)}<span class="pd-btn-lbl">Ẩn</span>`;
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
    el.classList.add("pd-rail-btn");
    el.innerHTML = `${getIconSvg(spec.icon, 24)}<span class="pd-btn-lbl">${spec.shortLabel}</span>`;
    attachLongPress(el, () => el.getAttribute("title") || spec.tooltip);
    return el;
  };

  // Reparent Left Rail global buttons (preserving IDs and click listeners)
  for (const spec of LEFT_RAIL_SPECS) {
    const btn = decorateGlobalBtn(spec);
    if (btn) leftScroll.appendChild(btn);
  }

  // Reparent Right Rail contextual & tactical buttons
  rightScroll.appendChild(drawerBtn);
  for (const spec of RIGHT_TACTIC_SPECS) {
    const btn = decorateGlobalBtn(spec);
    if (btn) rightScroll.appendChild(btn);
  }
  rightRail.appendChild(collapseBtn);

  // Reparent Selection Portrait & Title into .pd-sel-pill
  const selPortrait = document.getElementById("sel-portrait");
  const selTitle = document.getElementById("sel-title");
  if (selPortrait) selPill.appendChild(selPortrait);
  if (selTitle) selPill.appendChild(selTitle);

  // Reparent #cmd-buttons into .pd-drawer-body
  const cmdButtons = document.getElementById("cmd-buttons");
  if (cmdButtons) {
    drawerBody.appendChild(cmdButtons);
  }

  gameWrap.append(leftRail, rightRail, drawer, selPill, edgeHandle);

  // Filter / Decorate #cmd-buttons whenever renderCommandDock() updates it
  let isMutatingCmd = false;
  const applyTabFilter = (): void => {
    if (!cmdButtons) return;
    const btns = Array.from(cmdButtons.querySelectorAll<HTMLButtonElement>("button.act-btn"));
    const mode = detectContextMode(btns);

    drawerTabs.style.display = mode === "build" ? "flex" : "none";
    if (mode === "build") {
      drawerTitle.textContent = "Xây Dựng";
      drawerBtn.innerHTML = `${getIconSvg(activeTab === "eco" ? "tab_eco" : activeTab === "mil" ? "tab_mil" : "tab_def", 24)}<span class="pd-btn-lbl">Xây</span>`;
    } else if (mode === "train") {
      drawerTitle.textContent = "Huấn Luyện & Lên Đời";
      drawerBtn.innerHTML = `${getIconSvg("train", 24)}<span class="pd-btn-lbl">Luyện</span>`;
    } else {
      drawerTitle.textContent = "Quân Đội & Chiến Thuật";
      drawerBtn.innerHTML = `${getIconSvg("attack_move", 24)}<span class="pd-btn-lbl">Quân</span>`;
    }

    for (const tb of Object.values(tabButtons)) {
      tb.classList.toggle("active", tb.dataset.tab === activeTab);
    }

    for (const btn of btns) {
      if (mode === "build") {
        const label = btn.dataset.pdLabel || btn.textContent || "";
        const cat = classifyBuildTab(label);
        btn.classList.toggle("pd-hidden-by-tab", cat !== activeTab);
      } else {
        btn.classList.remove("pd-hidden-by-tab");
      }
    }
  };

  for (const t of tabDefs) {
    const tb = document.createElement("button");
    tb.type = "button";
    tb.className = "pd-drawer-tab";
    tb.dataset.tab = t.id;
    tb.innerHTML = `${getIconSvg(t.icon, 16)}<span>${t.label}</span>`;
    tb.addEventListener("click", () => {
      activeTab = t.id;
      applyTabFilter();
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
        if (btn.dataset.pdDecorated !== "1") {
          const spans = btn.querySelectorAll("span");
          const labelText = (spans[0]?.textContent || btn.textContent || "").trim();
          const costText = (spans[1]?.textContent || "").trim();
          btn.dataset.pdLabel = labelText;
          btn.dataset.pdDecorated = "1";
          const iconKey = resolveCommandIconKey(labelText);
          btn.innerHTML = `<span class="pd-cmd-icon">${getIconSvg(iconKey, 24)}</span><span class="pd-cmd-text"><span>${labelText}</span>${costText ? `<span class="act-cost">${costText}</span>` : ""}</span>`;
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

  // Close drawer when tapping outside
  document.addEventListener("pointerdown", (e) => {
    if (!drawerOpen) return;
    const target = e.target as Node | null;
    if (!target) return;
    if (drawer.contains(target) || rightRail.contains(target)) return;
    setDrawerOpen(false);
  });

  // Add Left-Handed toggle to #hud-settings
  const hudSettings = document.getElementById("hud-settings");
  if (hudSettings && !document.getElementById("pd-btn-left-handed")) {
    const lhBtn = document.createElement("button");
    lhBtn.type = "button";
    lhBtn.id = "pd-btn-left-handed";
    lhBtn.className = "mini-btn pd-lh-toggle";
    lhBtn.addEventListener("click", () => {
      leftHanded = !leftHanded;
      writePref(LS_LEFT_HANDED, leftHanded);
      applyPrefs();
    });
    hudSettings.appendChild(lhBtn);
  }

  applyPrefs();
}
