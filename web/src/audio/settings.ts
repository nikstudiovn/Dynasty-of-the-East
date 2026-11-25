const defaults = { music: true, sound: true, haptics: true, musicVolume: 0.65, soundVolume: 0.8 };
type Settings = typeof defaults;
type Key = keyof Settings;
const values = { ...defaults };
const listeners = new Set<() => void>();

for (const key of Object.keys(defaults) as Key[]) {
  try {
    const suffix = key.replace(/[A-Z]/g, c => "_" + c.toLowerCase());
    const raw = localStorage.getItem("dote_" + suffix) ?? localStorage.getItem("pixel_dynasty_" + suffix);
    if (raw === null) continue;
    if (typeof defaults[key] === "boolean") {
      if (["true", "false", "1", "0"].includes(raw)) Object.assign(values, { [key]: raw === "true" || raw === "1" });
    } else if (raw.trim() && Number.isFinite(Number(raw))) {
      Object.assign(values, { [key]: Math.max(0, Math.min(1, Number(raw))) });
    }
  } catch {}
}

export const audioSettings: Readonly<Settings> = values;

export function setAudioSetting<K extends Key>(key: K, value: Settings[K]): void {
  if (values[key] === value) return;
  values[key] = value;
  try {
    localStorage.setItem("dote_" + key.replace(/[A-Z]/g, c => "_" + c.toLowerCase()), String(value));
  } catch {}
  for (const listener of listeners) listener();
}

export function onAudioSettings(listener: () => void): void {
  listeners.add(listener);
  listener();
}

export function bindAudioButtons(): void {
  for (const [key, ids, label] of [
    ["music", ["btn-music", "btn-pause-music"], "Nhạc"],
    ["sound", ["btn-sound", "btn-pause-sound"], "Âm"],
  ] as const) {
    const primary = document.getElementById(ids[0]);
    primary?.addEventListener("click", () => setAudioSetting(key, !values[key]));
    onAudioSettings(() => {
      for (const id of ids) {
        const button = document.getElementById(id);
        if (!button) continue;
        button.textContent = label + (values[key] ? ": Bật" : ": Tắt");
        button.setAttribute("aria-pressed", String(values[key]));
      }
    });
  }
}

export function audioSettingsControls(): HTMLElement[] {
  return ([
    ["music", "musicVolume", "Nhạc nền"],
    ["sound", "soundVolume", "Hiệu ứng âm thanh"],
    ["haptics", null, "Rung phản hồi"],
  ] as const).map(([key, volumeKey, label]) => {
    const row = document.createElement("div");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dote-btn dote-btn--ghost";
    button.addEventListener("click", () => setAudioSetting(key, !values[key]));
    row.append(button);
    const volume = document.createElement("input");
    if (volumeKey) {
      volume.type = "range";
      volume.min = "0"; volume.max = "100";
      volume.setAttribute("aria-label", "Âm lượng " + label);
      volume.addEventListener("input", () => setAudioSetting(volumeKey, Number(volume.value) / 100));
      row.append(volume);
    }
    onAudioSettings(() => {
      button.textContent = label + (values[key] ? ": Bật" : ": Tắt");
      button.setAttribute("aria-pressed", String(values[key]));
      if (volumeKey) volume.value = String(Math.round(values[volumeKey] * 100));
    });
    return row;
  });
}
