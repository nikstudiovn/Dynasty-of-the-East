# Dynasty of the East model catalog

All files are optional. Add the models under these paths so Vite copies them to the game bundle:

- `buildings/{dai_viet,trung_nguyen,bac_cuong,common}/{town_center,imperial_citadel,barracks,archery_range,stable,siege_workshop}.glb`
- `units/{villager,swordsman,spearman,archer,chuko_nu,cavalry,horse_archer,war_elephant,catapult,healer}.glb` (10 land units)
- `units/{fishing_boat,galley,fire_ship}.glb` (3 fleets)
- `wildlife/{deer,boar,goat,cattle,lion,wild_elephant}.glb` (every `AnimalType` in `src/sim/wildlife.ts`)

A building uses its faction's file first, then the matching `common` file, then the procedural model. Units and wildlife keep their procedural models if a file cannot load. Assets load from `./models/`; Draco decoders ship in `./draco/`.

## Authoring

- Use **+Y up** and **+Z forward**. Keep animation in place. The game handles movement and facing. The visible model is centered on its footprint and grounded by its rest bounds.
- Name materials or meshes with a slot from the table below. The game binds its shared PBR library (`src/render3d/pbrMaterials.ts`). The names `team`, `banner` and `flag` also mark team-colored meshes. Keep UVs on foliage, team cloth and sails. Leave the other slots as lightweight color materials.
- Fitting: units and wildlife are scaled to the procedural rig height, so a villager stands **≈0.6 world units** from foot to hat tip (PR #23 building scale). Ships are fitted the same way and lowered by 10% of their height so the keel sits under the waterline (the model's lowest point should be the keel).
- Name clips `idle`, `walk`, `run`, `attack`, `gather`, `build` or `die` (case-insensitive). Use one-shot motion for `die`.
- Export a self-contained GLB with no embedded textures or external URLs. Use simple meshes and keep joints and animation keys within the budget. Aim for roughly **15–60 KB per file** after compression; verify the actual size and playback:

  ```sh
  npx @gltf-transform/cli draco model.glb model-compressed.glb
  ```

  This command is for asset preparation only. The game does not download tools or assets from third-party servers.

## Material slots

| Slot (material or mesh name) | Aliases | Use | Metalness / roughness |
|---|---|---|---|
| `mat_wood` | | ironwood frames, shafts, bows, catapult | 0.02 / texture |
| `mat_ship_wood` | | clinker hull planks with pitch seams | 0.02 / 0.70 |
| `mat_roof` | | roof tiles | 0.03 / texture |
| `mat_stone` | | masonry, boulders, ore | 0.00 / texture |
| `mat_gold` | | gold ore and trims | 0.88 / texture |
| `mat_bamboo` | | bamboo hats, baskets (gùi), straw | 0.00 / texture |
| `mat_foliage` | | leaves | 0.00 / texture |
| `mat_steel` | `mat_iron` | helmets, blades, scale armour, iron straps | 0.78 / 0.30 |
| `mat_bronze` | `mat_copper`, `mat_brass` | shield rims, brow plates, crossbow fittings | 0.72 / 0.36 |
| `mat_leather` | | tanned jerkins, quivers, saddles, boots | 0.00 / 0.78 |
| `mat_skin` | | faces, hands | 0.00 / 0.62 |
| `mat_ivory` | | tusks, bow nocks, horns | 0.00 / 0.42 |
| `mat_fur` | | deer, goat, cattle, lion, horse coats, fur hats (tinted per species) | 0.00 / 0.92 |
| `mat_hide` | | elephant, buffalo hide, hooves, boar snout | 0.00 / 0.86 |
| `mat_sail` | `mat_canvas` | sail canvas (team tint on war fleets) | 0.00 / 0.88 |
| `mat_cloth` | `mat_linen` | tunics, capes, robes | 0.00 / 0.86 |
| `mat_team` | `team`, `banner`, `flag` | team-coloured banners and trims | 0.00 / texture |

Slot colours come from the shared texture; a vertex or material colour is not used once the slot is bound.
