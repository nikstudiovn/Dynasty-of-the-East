type Destination = { x: number; y: number };
type Movement = Destination & { type: "move"; retreat: true };
type RetreatOrder = Destination & { type: "retreat"; unitIds: number[] };
type DoteCommands = { issueRetreatCommand?: (unitIds: number[], x: number, z: number) => number | boolean | void };

/** Route the UI order through the engine when available, or through the existing move handler. */
export function issueRetreatFromHud<T extends { id: number }>(
  units: T[],
  destination: Destination,
  engine: ((order: RetreatOrder) => boolean | void) | undefined,
  move: (units: T[], order: Movement) => boolean,
): boolean {
  if (!units.length) return false;
  const unitIds = units.map(unit => unit.id);
  if (engine) return engine({ ...destination, type: "retreat", unitIds }) !== false;
  const commands = typeof window !== "undefined" ? (window as { DOTECommands?: DoteCommands }).DOTECommands : undefined;
  if (typeof commands?.issueRetreatCommand === "function") {
    const result = commands.issueRetreatCommand(unitIds, destination.x, destination.y);
    if (typeof result === "number" ? result > 0 : result !== false) return true;
  }
  return move(units, { ...destination, type: "move", retreat: true });
}
