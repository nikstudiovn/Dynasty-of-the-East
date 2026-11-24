// Entry module: exposes the TypeScript subsystems to the classic game script in index.html.
import "./graphics/index";
import * as steering from "./sim/steering";
import * as pinch from "./input/pinchZoom";

(window as any).PDSim = steering;
(window as any).PDInput = pinch;
