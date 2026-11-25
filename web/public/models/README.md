# Pixel Dynasty model catalog

All files are optional. Add the models under these paths so Vite copies them to the game bundle:

- `buildings/{dai_viet,trung_nguyen,bac_cuong,common}/{town_center,imperial_citadel,barracks,archery_range,stable,siege_workshop}.glb`
- `units/{villager,swordsman,spearman,archer,chuko_nu,cavalry,war_elephant,horse_archer,catapult}.glb`
- `wildlife/{deer,goat,cattle,lion,wild_elephant}.glb`

A building uses its faction's file first, then the matching `common` file, then the procedural model. Units and wildlife keep their procedural models if a file cannot load. Assets load from `./models/`; Draco decoders ship in `./draco/`.

## Authoring

- Use **+Y up** and **+Z forward**. Keep animation in place. The game handles movement and facing. The visible model is centered on its footprint and grounded by its rest bounds.
- Name materials or meshes `mat_wood`, `mat_roof`, `mat_stone`, `mat_gold`, `mat_foliage`, or `mat_team`. The game binds its shared PBR library. The names `team`, `banner` and `flag` also mark team-colored meshes. Keep UVs on foliage and team cloth. Leave the other slots as lightweight color materials.
- Name clips `idle`, `walk`, `run`, `attack`, `gather`, `build` or `die` (case-insensitive). Use one-shot motion for `die`.
- Export a self-contained GLB with no embedded textures or external URLs. Use simple meshes and keep joints and animation keys within the budget. Aim for roughly **15–60 KB per file** after compression; verify the actual size and playback:

  ```sh
  npx @gltf-transform/cli draco model.glb model-compressed.glb
  ```

This command is for asset preparation only. The game does not download tools or assets from third-party servers.
