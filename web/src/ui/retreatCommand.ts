type Destination = { x: number; y: number };
type Movement = Destination & { type: "move"; retreat: true };
type RetreatOrder = Destination & { type: "retreat"; unitIds: number[] };

/** Route the UI order through the engine when available, or through the existing move handler. */
export function issueRetreatFromHud<T extends { id: number }>(
  units: T[],
  destination: Destination,
  engine: ((order: RetreatOrder) => boolean | void) | undefined,
  move: (units: T[], order: Movement) => boolean,
): boolean {
  if (!units.length) return false;
  if (engine) return engine({ ...destination, type: "retreat", unitIds: units.map(unit => unit.id) }) !== false;
  return move(units, { ...destination, type: "move", retreat: true });
}
