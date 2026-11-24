import { Client, Room } from "colyseus";

export type Faction = "dai_viet" | "trung_nguyen" | "bac_cuong";
export type MapSize = 48 | 64 | 96;
export type MapType = "river_valley" | "open_plains" | "highland_passes" | "random";
export type MatchStatus = "lobby" | "playing";

export interface LobbyPlayer {
  playerId: string;
  name: string;
  faction: Faction;
  ready: boolean;
  slot: number;
  connected: boolean;
  isHost: boolean;
}

interface LockstepCommand {
  tick: number;
  playerId: string;
  action: string;
  unitIds?: number[];
  targetId?: string;
  tileX?: number;
  tileY?: number;
}

interface MatchCreateOptions {
  roomCode?: string;
  mapSize?: MapSize;
  mapType?: MapType;
  mapSeed?: number;
  maxPlayers?: number;
}

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const VALID_FACTIONS: Faction[] = ["dai_viet", "trung_nguyen", "bac_cuong"];
const VALID_MAP_SIZES: MapSize[] = [48, 64, 96];
const VALID_MAP_TYPES: MapType[] = ["river_valley", "open_plains", "highland_passes", "random"];

function generateRoomCode(length = 4): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    const idx = Math.floor(Math.random() * ROOM_CODE_ALPHABET.length);
    code += ROOM_CODE_ALPHABET[idx];
  }
  return code;
}

export class MatchRoom extends Room {
  maxClients = 4;
  private currentTick = 0;
  private pendingCommands: LockstepCommand[] = [];
  private players: Map<string, LobbyPlayer> = new Map();
  private roomCode = "";
  private mapSize: MapSize = 64;
  private mapType: MapType = "river_valley";
  private mapSeed = 0;
  private status: MatchStatus = "lobby";
  private simulationStarted = false;

  onCreate(options: MatchCreateOptions = {}) {
    this.maxClients = Math.min(Math.max(options.maxPlayers ?? 4, 2), 4);
    const providedCode = typeof options.roomCode === "string"
      ? options.roomCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4)
      : "";
    this.roomCode = providedCode.length === 4 ? providedCode : generateRoomCode(4);
    this.mapSize = VALID_MAP_SIZES.includes(options.mapSize as MapSize) ? (options.mapSize as MapSize) : 64;
    this.mapType = VALID_MAP_TYPES.includes(options.mapType as MapType) ? (options.mapType as MapType) : "river_valley";
    this.mapSeed = typeof options.mapSeed === "number" ? options.mapSeed : Math.floor(Math.random() * 1_000_000);
    this.status = "lobby";

    this.syncMetadata();

    this.onMessage("set_profile", (client: Client, payload: { name?: string; faction?: Faction }) => {
      const player = this.players.get(client.sessionId);
      if (!player) return;

      if (typeof payload?.name === "string" && payload.name.trim().length > 0) {
        player.name = payload.name.trim().slice(0, 24);
      }
      if (payload?.faction && VALID_FACTIONS.includes(payload.faction)) {
        player.faction = payload.faction;
      }

      this.broadcastLobbyState();
    });

    this.onMessage("set_ready", (client: Client, payload?: { ready?: boolean }) => {
      const player = this.players.get(client.sessionId);
      if (!player) return;

      player.ready = typeof payload?.ready === "boolean" ? payload.ready : !player.ready;
      this.broadcastLobbyState();
    });

    this.onMessage(
      "set_match_config",
      (client: Client, payload: { mapSize?: MapSize; mapType?: MapType; mapSeed?: number }) => {
        const player = this.players.get(client.sessionId);
        if (!player || !player.isHost || this.status !== "lobby") return;

        if (payload?.mapSize && VALID_MAP_SIZES.includes(payload.mapSize)) {
          this.mapSize = payload.mapSize;
        }
        if (payload?.mapType && VALID_MAP_TYPES.includes(payload.mapType)) {
          this.mapType = payload.mapType;
        }
        if (typeof payload?.mapSeed === "number" && Number.isFinite(payload.mapSeed)) {
          this.mapSeed = Math.floor(payload.mapSeed);
        }

        this.syncMetadata();
        this.broadcastLobbyState();
      }
    );

    this.onMessage("start_match", (client: Client) => {
      const player = this.players.get(client.sessionId);
      if (!player || !player.isHost || this.status === "playing") return;

      this.status = "playing";
      this.syncMetadata();

      this.broadcast("match_started", {
        roomCode: this.roomCode,
        mapSize: this.mapSize,
        mapType: this.mapType,
        mapSeed: this.mapSeed,
        players: this.getPlayersList(),
      });

      this.startLockstepLoop();
    });

    this.onMessage("cmd", (client: Client, payload: Omit<LockstepCommand, "playerId" | "tick">) => {
      if (this.status !== "playing") return;
      this.pendingCommands.push({
        ...payload,
        playerId: client.sessionId,
        tick: this.currentTick + 2,
      });
    });

    this.onMessage("ping", (client: Client, payload?: { clientTime?: number }) => {
      client.send("pong", {
        clientTime: payload?.clientTime ?? Date.now(),
        serverTime: Date.now(),
      });
    });
  }

  onJoin(client: Client, options?: { name?: string; faction?: Faction }) {
    const usedSlots = new Set(Array.from(this.players.values()).map((p) => p.slot));
    let slot = 0;
    while (usedSlots.has(slot)) {
      slot += 1;
    }

    const isHost = this.players.size === 0;
    const defaultFaction = VALID_FACTIONS[slot % VALID_FACTIONS.length];
    const faction = options?.faction && VALID_FACTIONS.includes(options.faction) ? options.faction : defaultFaction;
    const name =
      typeof options?.name === "string" && options.name.trim().length > 0
        ? options.name.trim().slice(0, 24)
        : `Tướng ${slot + 1}`;

    const lobbyPlayer: LobbyPlayer = {
      playerId: client.sessionId,
      name,
      faction,
      ready: false,
      slot,
      connected: true,
      isHost,
    };

    this.players.set(client.sessionId, lobbyPlayer);

    this.broadcast("player_joined", {
      playerId: client.sessionId,
      player: lobbyPlayer,
      totalPlayers: this.players.size,
    });
    this.broadcastLobbyState();
  }

  async onLeave(client: Client, consented: boolean) {
    const player = this.players.get(client.sessionId);
    if (!player) return;

    if (!consented) {
      player.connected = false;
      this.broadcast("player_reconnecting", {
        playerId: client.sessionId,
        timeoutSeconds: 30,
      });
      this.broadcastLobbyState();

      try {
        await this.allowReconnection(client, 30);
        player.connected = true;
        this.broadcast("player_reconnected", {
          playerId: client.sessionId,
        });
        this.broadcastLobbyState();
        return;
      } catch {
        // Reconnection timed out after 30s; fall through to remove player
      }
    }

    const wasHost = player.isHost;
    this.players.delete(client.sessionId);

    if (wasHost && this.players.size > 0) {
      const nextHost = this.players.values().next().value;
      if (nextHost) {
        nextHost.isHost = true;
      }
    }

    this.broadcast("player_left", {
      playerId: client.sessionId,
      totalPlayers: this.players.size,
    });
    this.broadcastLobbyState();
  }

  private startLockstepLoop() {
    if (this.simulationStarted) return;
    this.simulationStarted = true;

    // 20 Hz deterministic tick relay (50ms intervals)
    this.setSimulationInterval(() => {
      this.currentTick += 1;
      this.broadcast("tick_batch", {
        tick: this.currentTick,
        commands: this.pendingCommands,
      });
      if (this.pendingCommands.length > 0) {
        this.pendingCommands = [];
      }
    }, 50);
  }

  private syncMetadata() {
    this.setMetadata({
      roomCode: this.roomCode,
      mapSize: this.mapSize,
      mapType: this.mapType,
      mapSeed: this.mapSeed,
      status: this.status,
    });
  }

  private getPlayersList(): LobbyPlayer[] {
    return Array.from(this.players.values()).sort((a, b) => a.slot - b.slot);
  }

  private broadcastLobbyState() {
    this.broadcast("lobby_state", {
      roomCode: this.roomCode,
      mapSize: this.mapSize,
      mapType: this.mapType,
      mapSeed: this.mapSeed,
      status: this.status,
      players: this.getPlayersList(),
    });
  }
}
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
