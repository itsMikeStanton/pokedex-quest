// ─────────────────────────────────────────────────────────────────────────
// Hand-authored zone maps, exported from editor.html.
// Each key is a zone id (0–7); each value is a rows×cols grid of tile ids:
//   0 Path  1 Grass  2 Tree  3 Water  4 Sand  5 City  6 Shop  7 Lava  8 Ice
//
// game.js uses any zone defined here (correct dimensions) and falls back to the
// procedural generator for the rest. Set to null to use procedural for all.
// ─────────────────────────────────────────────────────────────────────────
const CUSTOM_MAPS = null;
