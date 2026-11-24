// Entry module: exposes the TypeScript subsystems to the classic game script in index.html.
import "./graphics/index";
import * as steering from "./sim/steering";
import * as pinch from "./input/pinchZoom";
import * as render3d from "./render3d/index";

(window as any).PDSim = steering;
(window as any).PDInput = pinch;
(window as any).PD3D = render3d;
