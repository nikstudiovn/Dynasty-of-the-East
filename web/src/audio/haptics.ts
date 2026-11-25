import { nativeBridge, type HapticStyle } from "../bridge/nativeBridge";
import { audioSettings } from "./settings";

let last = -Infinity;
let lastStrong = -Infinity;
export function haptic(style: HapticStyle): void {
  const now = performance.now();
  const strong = style === "heavy" || style === "warning";
  if (!audioSettings.haptics || document.hidden || now - last < 450 || (strong && now - lastStrong < 2200)) return;
  try {
    if (nativeBridge.isIOSApp()) nativeBridge.triggerHaptic(style);
    else navigator.vibrate?.(style === "light" ? 12 : style === "medium" ? 24 : 38);
    last = now;
    if (strong) lastStrong = now;
  } catch {}
}
