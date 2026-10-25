# Floating-world asset pack

All art is generated procedurally (original, no third-party material). Use freely, CC0 / public domain.
Everything with transparency is a PNG (WebP copies in `webp/`). Skies are JPG.

## Layout
| Folder | Contents | Use |
|---|---|---|
| `islands/` | 3 hero islands (verdant, ember, frost+waterfall), ~1150-1200 px wide | main parallax layer |
| `islands/far/` | same islands pre-fogged (dusk + day), for distance | back parallax layers |
| `clouds/` | 4 cumulus + 2 wispy, each in `_dusk` and `_day` tint | mid/front layers |
| `mist/` | 2 wide 2400x560 fog bands per tint | blend between depth layers |
| `particles/` | glows, fireflies, sparkles, bokeh, motes, god rays; `particle_atlas.png/.json` (8 sprites, 128 px) | additive blend |
| `backgrounds/` | `sky_dusk.jpg`, `sky_day.jpg` (2560x1600) | scene backdrop |
| `index.html` | working parallax + particle demo (open locally; needs a static server only if your browser blocks file:// images) | reference implementation |
| `preview_dusk.png`, `preview_day.png` | 1920x1080 composites | look reference |

## Suggested depth stack (back to front)
sky -> god rays (screen) -> far islands -> mist -> back clouds -> hero islands -> front clouds -> particles (additive).
Parallax: move each layer by `pointer * depth`, with depth increasing toward the front (see `data-depth` in `index.html`).
Give islands a slow `translateY` bob (8-13 s, ease-in-out, alternate) with different durations per island.

## Particles
White/tinted sprites designed for additive blending: CSS `mix-blend-mode: screen`, canvas `globalCompositeOperation = 'lighter'`,
Three.js `THREE.AdditiveBlending` + `depthWrite:false`. `particle_atlas.json` has the frame rectangles.

## Regenerating
Procedural 3D island and guide-light generators live in `scripts/world-gen/`; rebuild them with `npm run build:assets`.
