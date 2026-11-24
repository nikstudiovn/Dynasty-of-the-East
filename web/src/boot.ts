// Entry module: exposes the TypeScript subsystems to the classic game script in index.html.
import "./graphics/index";
import * as steering from "./sim/steering";
import * as pinch from "./input/pinchZoom";
import * as render3d from "./render3d/index";
import * as valley from "./sim/valley";
import * as pathfinding from "./sim/pathfinding";

(window as any).PDSim = steering;
(window as any).PDInput = pinch;
(window as any).PD3D = render3d;
(window as any).PDValley = valley;
(window as any).PDPath = pathfinding;
