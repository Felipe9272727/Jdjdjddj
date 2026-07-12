# Floor 7 V2 material atlas

These eight maps were authored specifically for Floor 7 with GPT Images, then
cropped, resized and compressed to WebP for the mobile build. They are bundled
as data URIs by Vite, so the canonical root `index.html` remains fully offline.

- `deck-wood.webp` — warm oak deck planks, 1024²
- `hull-wood.webp` — dark mahogany hull planks, 1024²
- `sailcloth.webp` — patched burgundy canvas, 1024²
- `hemp-rope.webp` — rigging fibre detail, 512²
- `forged-iron.webp` — iron/brass micro-surface, 512²
- `sleeve-cloth.webp` — navy sailor cloth, 512²
- `skin.webp` — restrained viewmodel skin variation, 512²
- `foam-mask.webp` — animated ocean foam breakup, 512²

The color maps are also reused as subtle bump maps. Texture clones share the
same decoded image source, avoiding duplicate download and base64 payloads.
