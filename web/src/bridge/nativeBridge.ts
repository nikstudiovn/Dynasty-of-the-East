export type HapticStyle = "light" | "medium" | "heavy" | "success" | "warning";

interface NativePayload {
  type: "haptic" | "music_deck" | "lan_host" | "lan_browse" | "lan_send" | "gamecenter_auth";
  data?: Record<string, unknown>;
}

declare global {
  interface Window {
    webkit?: {
      messageHandlers?: {
        dote?: {
          postMessage: (payload: NativePayload) => void;
        };
      };
    };
    onNativeEvent?: (eventName: string, payload: unknown) => void;
  }
}

export const nativeBridge = {
  isIOSApp(): boolean {
    return Boolean(window.webkit?.messageHandlers?.dote);
  },

  triggerHaptic(style: HapticStyle): void {
    if (this.isIOSApp()) {
      window.webkit?.messageHandlers?.dote?.postMessage({
        type: "haptic",
        data: { style }
      });
    }
  },

  musicDeck(action: string, deck: number, options?: { track?: string; loop?: boolean; volume?: number }): void {
    try {
      window.webkit?.messageHandlers?.dote?.postMessage({ type: "music_deck", data: { action, deck, ...options } });
    } catch {}
  },

  hostLanRoom(roomName: string): void {
    window.webkit?.messageHandlers?.dote?.postMessage({
      type: "lan_host",
      data: { roomName }
    });
  },

  browseLanRooms(): void {
    window.webkit?.messageHandlers?.dote?.postMessage({
      type: "lan_browse"
    });
  },

  sendLanCommand(command: unknown): void {
    window.webkit?.messageHandlers?.dote?.postMessage({
      type: "lan_send",
      data: { command }
    });
  }
};
