// Entry module: exposes the TypeScript subsystems to the classic game script in index.html.
import "./graphics/index";
import "./ui/screens.css";
import { initLobbyUI } from "./ui/lobbyScreen";
import "./ui/sideRailHud.css";
import { initSideRailHud } from "./ui/sideRailHud";;
import { initCombatTextSetting } from "./ui/combatTextSetting";
import * as skirmishAI from "./sim/skirmishAI";
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

(window as any).DOTEAI = skirmishAI;
(window as any).DOTESim = steering;
(window as any).DOTEInput = pinch;
(window as any).DOTE3D = render3d;
(window as any).DOTEValley = valley;
(window as any).DOTEPath = pathfinding;
(window as any).DOTETactics = tactics;
(window as any).DOTEWild = wildlife;
(window as any).DOTENative = nativeBridge;
(window as any).DOTEI18n = i18n;
(window as any).DOTEServerHealth = serverHealth;
(window as any).DOTESelect = touchSelect;
(window as any).DOTEBuild = construction;
(window as any).DOTEGameplay = gameplayExtras;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initLobbyUI);
  document.addEventListener("DOMContentLoaded", initSideRailHud);;
  document.addEventListener("DOMContentLoaded", initCombatTextSetting);
} else {
  initLobbyUI();
  initSideRailHud();
  initCombatTextSetting();
}
