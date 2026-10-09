# Floor 2 · O Abismo

The diver's conversation becomes a 32.5-second film: the well, an establishing shot of the diver, a reverse toward the water, a face close-up, the rebreather and night-vision insert, and the farewell. The original concierge mesh and PBR textures remain recognizable. The well radius, depth and stone placements come from the current Floor 2 sources.

`scene.py` renders grounded breathing and a small head movement in Blender. The source mesh has no skeleton or speech animation; this edit does not claim lip sync. Slow 3D dollies are sampled at 3 fps and interpolated with FFmpeg optical flow to 24 fps within each shot. Flow never crosses a cut. `opening.py` draws the transparent Manim title. `composition.jsx` assembles the frames, title and vignette in Remotion. The game retains its procedural audio bed.

The shipped asset is `jubileu/public/floor2-mergulhador.mp4`, H.264 4:2:0, 1280×720, 24 fps, with MP4 faststart. `jubileu/src/Floor2/cinematic.json` supplies both film and game timings. Captions are rendered by the game, so touch, Space/Enter and skip remain interactive. Entering the equipment shot still fires beat 3; accepting starts the original mask put-on animation and awards inventory through its existing completion callback.

`previas/floor2-cutscene.mp4` is the review export with captions baked in. It is silent; the game supplies procedural audio.

The covered Canvas loop stops while the film plays. A video load/playback/seek failure restores the original 3D conversation automatically. Hidden tabs pause the sequence. Exit paths stop media and cancel timers. Gameplay cave shaders and geometry are unchanged.

## Rebuild

Blender 4.0.2, Manim Community 0.20.1, FFmpeg 6.1, Node 24 and the locked Remotion dependencies in `tools/carregamento-video`.

```sh
npm ci --prefix jubileu --no-audit --no-fund
sh tools/floor2-cinematic/render.sh
```

Set `CHROMIUM_PATH` for the Remotion browser. On Debian/Ubuntu Blender needs its system Python packages, including NumPy. If another Python runtime is injected, run Blender with `PYTHONHOME=/usr PYTHONPATH=/usr/lib/python3/dist-packages`. Production PNGs, interpolated frames and Manim output remain in ignored `frames/`. Rendering is resumable; set `F2_FORCE=1` when replacing preview samples or changing camera or materials.

`REMOTION_LOOPBACK_ONLY=1` binds Remotion's internal server only to `127.0.0.1` on restricted hosts that cannot enumerate interfaces. The optional helper targets the locked Remotion version.

`F2_WORKERS=2 F2_THREADS=4` distributes disjoint source frames between Blender processes. The default is one process; image quality is identical. Worker logs stay in ignored `frames/`.

## Validate

With Vite, `/floor2-cinematic.html` previews playback and `/floor2.html` still inspects the unchanged cave.

```sh
cd jubileu
npm run lint:types
npm test -- src/__tests__/floor2Cinematic.test.ts src/__tests__/floor2Run.test.ts src/__tests__/floor2Swim.test.ts
F2_CHROMIUM=/path/to/chromium node tools/floor2-cinematic-check.mjs
npm run build
```

Browser checks cover media failure, keyboard skip, seeking, portrait subtitles, uninterrupted completion, real App handover, inventory award and Canvas resumption. `F2_FALLBACK_ONLY=1` blocks the film throughout. `F2_APP_ONLY=1` isolates gameplay and `F2_PREVIEW_ONLY=1` isolates the player. The preview entry and Canvas probes are excluded from production.
