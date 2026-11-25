type TeamMember = { team?: string; aiIndex?: number };
const enemyHealth = ["#ff635c", "#63afff", "#d893ff"];

export function healthColor(entity: TeamMember): string {
  const index = Math.max(0, entity.aiIndex ?? 0);
  return entity.team === "player" ? "#4bdf79" : enemyHealth[index % enemyHealth.length] ?? enemyHealth[0];
}

export function updateCommandTimer(
  element: HTMLElement, label: string, remaining: number, total: number, waiting = false,
): void {
  const fraction = Math.max(0, Math.min(1, remaining / Math.max(total, 0.1)));
  element.hidden = false;
  const seconds = Math.ceil(Math.max(0, remaining));
  const text = waiting ? label + " · Chờ dân" : `${label} · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const caption = element.querySelector("span");
  const progress = element.querySelector("progress");
  if (caption && caption.textContent !== text) caption.textContent = text;
  if (progress) {
    if (progress.value !== fraction) progress.value = fraction;
    if (progress.getAttribute("aria-label") !== text) progress.setAttribute("aria-label", text);
  }
}
