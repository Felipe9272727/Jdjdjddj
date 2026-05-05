/**
 * bellhop-sprites.ts — references to PNG assets in main branch.
 *
 * Why URLs (not base64): the previous version inlined all sprites as base64
 * data URLs in this module, which:
 *   • bloated the bundle by ~530KB,
 *   • forced the browser to re-decode the image every time the canvas
 *     remounted, increasing memory pressure and contributing to crashes.
 *
 * The PNGs live in the repo root and are served via raw.githubusercontent.
 * SpriteEngine caches the decoded <img> by URL, so all sprite uses share
 * one bitmap.
 *
 * Source layout (PNG 1 — 1264×843, "NANO BANANA PRO - BELLHOP SPRITESHEET"):
 *   • Top row holds 4 full-body bellhop sprites with the counter.
 *   • Frames are roughly 316×400 starting just below the title bar.
 *   • Order: NEUTRAL 1, NEUTRAL 2, TALK 1, TALK 2.
 *
 * If frame alignment looks off in-game, tune SHEET_FRAME_W / SHEET_FRAME_H
 * / SHEET_SOURCE_Y here (one place, easy to nudge).
 */

const RAW_BASE = 'https://raw.githubusercontent.com/Felipe9272727/Jdjdjddj/main/';

// Master sheet (top row = 4 full-body bellhop poses).
export const BELLHOP_SHEET = `${RAW_BASE}1777606191600.png`;
// Hotel lobby background — used as the shop backdrop.
export const HOTEL_BG = `${RAW_BASE}file_00000000418c71fba698b68adb12948b.png`;

// ── Top-row frame geometry (tunable in one place) ──────────────────────
// 1264px wide / 4 frames = 316. Title strip occupies first ~35px so we
// shift sourceY down to skip it. Frame height = 420 captures the full
// pose plus the counter.
const SHEET_FRAME_W = 316;
const SHEET_FRAME_H = 420;
const SHEET_SOURCE_Y = 35;

// ── Animation strips ───────────────────────────────────────────────────
// All strips read from the SAME source image; the cache decodes once.

// CLEAN — runs during entrance (door open / counter wipe). Uses all 4
// poses in sequence so the bellhop "comes to life" as the doors open.
export const BELLHOP_CLEAN_STRIP = BELLHOP_SHEET;
export const BELLHOP_CLEAN_FRAMES = 4;
export const BELLHOP_CLEAN_FRAME_W = SHEET_FRAME_W;
export const BELLHOP_CLEAN_FRAME_H = SHEET_FRAME_H;
export const BELLHOP_CLEAN_SOURCE_X = 0;
export const BELLHOP_CLEAN_SOURCE_Y = SHEET_SOURCE_Y;

// TALK — alternates between TALK 1 (frame 2) and TALK 2 (frame 3).
// The strip starts at frame 2, two frames wide.
export const BELLHOP_TALK_STRIP = BELLHOP_SHEET;
export const BELLHOP_TALK_FRAMES = 2;
export const BELLHOP_TALK_FRAME_W = SHEET_FRAME_W;
export const BELLHOP_TALK_FRAME_H = SHEET_FRAME_H;
export const BELLHOP_TALK_SOURCE_X = SHEET_FRAME_W * 2;
export const BELLHOP_TALK_SOURCE_Y = SHEET_SOURCE_Y;

// IDLE — single frame (NEUTRAL 1, mouth closed). Static.
export const BELLHOP_IDLE_STRIP = BELLHOP_SHEET;
export const BELLHOP_IDLE_FRAME_W = SHEET_FRAME_W;
export const BELLHOP_IDLE_FRAME_H = SHEET_FRAME_H;
export const BELLHOP_IDLE_SOURCE_X = 0;
export const BELLHOP_IDLE_SOURCE_Y = SHEET_SOURCE_Y;
