/**
 * textureImports.ts — Vite-processed texture & model imports.
 *
 * Moving assets from `public/` to `src/assets/` lets Vite's bundler
 * track them. With `assetsInlineLimit` set high in vite.config.ts,
 * Vite inlines every file as a base64 data-URI inside the JS bundle,
 * so the final index.html is fully self-contained (no external files).
 *
 * Source: polyhaven.com (CC0 / Public Domain) — photoscanned, dramatically higher quality
 *   Cave Walls: Rock Face 03 (2K)
 *   Cave Floor: Aerial Rocks 02 (2K)
 *   Cave Rocks: Mossy Rock (2K)
 *   UW Floor: Brown Mud Rocks 01 (2K)
 *   UW Rocks: Seaside Rock (2K)
 *   UW Walls: Rock Face (2K)
 */

// ─── Cave textures ─────────────────────────────────────────────────
export { default as caveFloorColor }     from './textures/cave/floor_color.jpg';
export { default as caveFloorNormal }    from './textures/cave/floor_normal.jpg';
export { default as caveFloorRoughness } from './textures/cave/floor_roughness.jpg';
export { default as caveFloorAO }        from './textures/cave/floor_ao.jpg';

export { default as caveWallColor }      from './textures/cave/wall_color.jpg';
export { default as caveWallNormal }     from './textures/cave/wall_normal.jpg';
export { default as caveWallRoughness }  from './textures/cave/wall_roughness.jpg';
export { default as caveWallAO }         from './textures/cave/wall_ao.jpg';

export { default as caveRockColor }      from './textures/cave/rock_color.jpg';
export { default as caveRockNormal }     from './textures/cave/rock_normal.jpg';
export { default as caveRockRoughness }  from './textures/cave/rock_roughness.jpg';
export { default as caveRockAO }         from './textures/cave/rock_ao.jpg';

// ─── Underwater textures ───────────────────────────────────────────
export { default as uwFloorColor }       from './textures/underwater/floor_color.jpg';
export { default as uwFloorNormal }      from './textures/underwater/floor_normal.jpg';
export { default as uwFloorRoughness }   from './textures/underwater/floor_roughness.jpg';
export { default as uwFloorAO }          from './textures/underwater/floor_ao.jpg';

export { default as uwRockColor }        from './textures/underwater/rock_color.jpg';
export { default as uwRockNormal }       from './textures/underwater/rock_normal.jpg';
export { default as uwRockRoughness }    from './textures/underwater/rock_roughness.jpg';
export { default as uwRockAO }           from './textures/underwater/rock_ao.jpg';

export { default as uwWallColor }        from './textures/underwater/wall_color.jpg';
export { default as uwWallNormal }       from './textures/underwater/wall_normal.jpg';
export { default as uwWallRoughness }    from './textures/underwater/wall_roughness.jpg';
export { default as uwWallAO }           from './textures/underwater/wall_ao.jpg';

// ─── Rock GLB models ──────────────────────────────────────────────
export { default as rockModelA }   from './models/rocks/rock_a.glb';
export { default as rockModelB }   from './models/rocks/rock_b.glb';
export { default as rockModelC }   from './models/rocks/rock_c.glb';
export { default as rockModelD }   from './models/rocks/rock_d.glb';
export { default as boulderModel } from './models/rocks/boulder.glb';
export { default as pebbleModel }  from './models/rocks/pebble.glb';

// ─── NPC models ────────────────────────────────────────────────────
// Hotel concierge — Floor 2 bearded diver NPC. GLB delivered by Felipe.
export { default as hotelConciergeModel } from './models/hotel-concierge.glb';

// ─── Character / floor GLB models (inlined for the single-file build) ─
// These used to be fetched at runtime — local ones from public/ ("/x.glb")
// and several from raw.githubusercontent. A runtime fetch 404s / is blocked
// when the game ships as one self-contained index.html (file:// or a host
// that only serves the HTML), which is why "andares com GLBs externos" broke.
// Imported here so Vite folds each GLB into the bundle as a base64 data-URI
// (same mechanism as the rocks/concierge above) — no network, works offline.
export { default as walkingModel }       from './models/char-walking.glb';   // player walk cycle
export { default as idleModel }          from './models/char-idle.glb';      // player idle
export { default as npcWalkModel }       from './models/npc-walking.glb';    // lobby NPC walk
export { default as npcIdleModel }       from './models/npc-idle.glb';       // lobby NPC idle
export { default as blockyCharModel }    from './models/blocky-character.glb'; // Dussekar (house)
export { default as cashierModel }       from './models/button_pushing.glb'; // lobby cashier
export { default as diabreteModel }      from './models/diabrete.glb';       // Floor 3 rival
export { default as glovesModel }        from './models/cartoon_gloves.glb'; // Floor 3 hands
export { default as sharkModel }         from './models/monster/shark.glb';  // Floor 2 monster fish
