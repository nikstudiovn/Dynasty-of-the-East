export interface ShortcutBuilding {
  id: number;
  type: string;
  team: string;
  hp: number;
}

interface ShortcutMatch<B extends ShortcutBuilding> {
  buildings: B[];
  selectedBuildingId: number | null;
}

type Definitions = Readonly<Record<string, { name: string }>>;

interface MenuState<B extends ShortcutBuilding> {
  match: ShortcutMatch<B>;
  definitions: Definitions;
  select: (building: B) => void;
}

export function initBuildingShortcuts<B extends ShortcutBuilding>(top: HTMLElement) {
  const toolbar = top.querySelector<HTMLElement>(".top-right")!;
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.id = "btn-building-shortcuts";
  trigger.className = "icon-btn";
  trigger.textContent = "Công trình";
  trigger.setAttribute("aria-controls", "building-shortcuts");
  trigger.setAttribute("aria-expanded", "false");

  const menu = document.createElement("div");
  menu.id = "building-shortcuts";
  menu.setAttribute("role", "group");
  menu.setAttribute("aria-label", "Chọn nhanh công trình");
  menu.hidden = true;
  const empty = document.createElement("p");
  empty.textContent = "Bạn chưa có công trình.";
  menu.append(empty);
  toolbar.insertBefore(trigger, toolbar.querySelector("#btn-settings"));
  top.append(menu);

  const rows = new Map<string, HTMLButtonElement>();
  let current: MenuState<B> | undefined;
  let lastRefresh = 0;

  function close() {
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }

  function refresh({ match, definitions }: MenuState<B>, now = performance.now()) {
    lastRefresh = now;
    const groups = new Map<string, { count: number; selectedAt: number }>();
    // Building ids are allocated in construction order. Compute the selected index
    // from the same ordering used by the cycle, even if a save reorders the array.
    const selected = match.buildings.find(b => b.id === match.selectedBuildingId && b.team === "player" && b.hp > 0);
    for (const building of match.buildings) {
      if (building.team !== "player" || building.hp <= 0 || !definitions[building.type]) continue;
      let group = groups.get(building.type);
      if (!group) {
        group = { count: 0, selectedAt: 0 };
        groups.set(building.type, group);
      }
      group.count++;
      if (selected?.type === building.type && building.id <= selected.id) group.selectedAt++;
    }

    for (const [type, row] of rows) {
      if (groups.has(type)) continue;
      if (row === document.activeElement) trigger.focus();
      rows.delete(type);
      row.remove();
    }

    // Use the game's building catalogue order, so a destroyed/rebuilt type keeps its usual position.
    let position: Element | null = empty.nextElementSibling;
    for (const [type, { name }] of Object.entries(definitions)) {
      const group = groups.get(type);
      if (!group) continue;
      let row = rows.get(type);
      if (!row) {
        row = document.createElement("button");
        row.type = "button";
        row.className = "icon-btn";
        row.dataset.buildingType = type;
        rows.set(type, row);
      }
      const label = `${name} ${group.selectedAt ? `${group.selectedAt}/${group.count}` : `×${group.count}`}`;
      if (row.textContent !== label) row.textContent = label;
      if (group.selectedAt) row.setAttribute("aria-current", "true");
      else row.removeAttribute("aria-current");
      if (row === position) position = position.nextElementSibling;
      else menu.insertBefore(row, position);
    }
    empty.hidden = groups.size > 0;
  }

  trigger.addEventListener("click", () => {
    if (!current || !menu.hidden) {
      close();
      return;
    }
    refresh(current);
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
  });

  menu.addEventListener("click", event => {
    if (!current || menu.hidden || !(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>("button[data-building-type]");
    if (!button) return;
    const { match, select } = current;
    const buildings = match.buildings
      .filter(b => b.type === button.dataset.buildingType && b.team === "player" && b.hp > 0)
      .sort((a, b) => a.id - b.id);
    if (buildings.length > 0) {
      const index = buildings.findIndex(b => b.id === match.selectedBuildingId);
      select(buildings[(index + 1) % buildings.length]);
    }
    refresh(current);
  });

  document.addEventListener("pointerdown", event => {
    if (!menu.hidden && event.target instanceof Node &&
      !trigger.contains(event.target) && !menu.contains(event.target)) close();
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape" || menu.hidden) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    close();
    trigger.focus();
  }, { capture: true });

  return {
    setMatch(next: MenuState<B> | undefined) {
      close();
      current = next;
    },
    update(now: number) {
      if (current && !menu.hidden && now - lastRefresh >= 120) refresh(current, now);
    }
  };
}
