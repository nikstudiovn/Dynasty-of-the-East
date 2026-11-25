// Entry module: exposes the TypeScript subsystems to the classic game script in index.html.
import "./graphics/index";
import "./ui/screens.css";
import { initLobbyUI } from "./ui/lobbyScreen";
import "./ui/sideRailHud.css";
import { initSideRailHud } from "./ui/sideRailHud";;
import * as steering from "./sim/steering";
import * as pinch from "./input/pinchZoom";
import * as render3d from "./render3d/index";
import * as valley from "./sim/valley";
import * as pathfinding from "./sim/pathfinding";
import * as tactics from "./sim/tactics";
import * as wildlife from "./sim/wildlife";
import { nativeBridge } from "./bridge/nativeBridge";
import * as serverHealth from "./bridge/serverHealth";
import * as i18n from "./i18n/index";
import * as touchSelect from "./input/touchSelect";
import * as construction from "./sim/construction";
import * as gameplayExtras from "./sim/gameplayExtras";

(window as any).PDSim = steering;
(window as any).PDInput = pinch;
(window as any).PD3D = render3d;
(window as any).PDValley = valley;
(window as any).PDPath = pathfinding;
(window as any).PDTactics = tactics;
(window as any).PDWild = wildlife;
(window as any).PDNative = nativeBridge;
(window as any).PDI18n = i18n;
(window as any).PDServerHealth = serverHealth;
(window as any).PDSelect = touchSelect;
(window as any).PDBuild = construction;
(window as any).PDGameplay = gameplayExtras;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initLobbyUI);
  document.addEventListener("DOMContentLoaded", initSideRailHud);;
} else {
  initLobbyUI();
  initSideRailHud();
}
