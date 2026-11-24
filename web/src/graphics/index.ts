// Pixel Dynasty graphics bundle. Exposes window.PDGfx for the classic (non-module) game script.
import * as vfx from "./vfxPool";
import * as atmosphere from "./atmosphere";
import * as terrain from "./terrainMap";
import * as atlas from "./spriteAtlas";
import * as seamless from "./seamlessTerrain";
import * as villager from "./villagerActions";

const PDGfx = {
  vfx, atmosphere, terrain, atlas, seamless, villager,
  /** Bake sprites for the player + AI colours and reset transient effects. */
  prepare(colors: string[]) {
    atmosphere.init();
    atlas.prepare(colors);
    vfx.reset();
    villager.reset();
  }
};

(window as any).PDGfx = PDGfx;
export default PDGfx;
