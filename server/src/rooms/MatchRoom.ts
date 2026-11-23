import { Client, Room } from "colyseus";

interface LockstepCommand {
  tick: number;
  playerId: string;
  action: string;
  unitIds?: number[];
  targetId?: string;
  tileX?: number;
  tileY?: number;
}

export class MatchRoom extends Room {
  maxClients = 4;
  private currentTick = 0;
  private pendingCommands: LockstepCommand[] = [];

  onCreate(options: { mapSeed?: number; maxPlayers?: number }) {
    this.maxClients = Math.min(Math.max(options.maxPlayers ?? 4, 2), 4);
    this.setMetadata({
      mapSeed: options.mapSeed ?? Math.floor(Math.random() * 1_000_000)
    });

    this.onMessage("cmd", (client: Client, payload: Omit<LockstepCommand, "playerId" | "tick">) => {
      this.pendingCommands.push({
        ...payload,
        playerId: client.sessionId,
        tick: this.currentTick + 2
      });
    });

    // 20 Hz deterministic tick relay (50ms intervals)
    this.setSimulationInterval(() => {
      this.currentTick += 1;
      if (this.pendingCommands.length > 0) {
        this.broadcast("tick_batch", {
          tick: this.currentTick,
          commands: this.pendingCommands
        });
        this.pendingCommands = [];
      }
    }, 50);
  }

  onJoin(client: Client) {
    this.broadcast("player_joined", {
      playerId: client.sessionId,
      totalPlayers: this.clients.length
    });
  }

  onLeave(client: Client) {
    this.broadcast("player_left", {
      playerId: client.sessionId
    });
  }
}
