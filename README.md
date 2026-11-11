# The Fourth Dimension

An interactive Three.js visualization of a tesseract. What you see is never the
4D object itself — it is the three-dimensional projection of sixteen points that
are being rotated in four-dimensional space.

## What happens on screen

1. **A cube** — the tesseract with zero extent along `w`.
2. **A second cube** — the `w` extent grows while a distant, oblique 4D eye shows
   two displaced, connected cubes; the eye then moves onto the `w` axis and
   close, giving the cube-within-a-cube perspective view.
3. **Rotation through w** — one half-turn each in the XW, YW and ZW planes.
4. **Continuous rotation** — driven by the controls.

Colour encodes each vertex's current `w` coordinate (blue −w, gold +w). The
eight edges that run along the body's `w` axis are drawn finer and brighter.

## Controls

Drag to orbit, scroll/pinch to zoom, space to pause. The bottom bar has the four
sequence stages, pause, reset, and a settings panel: speed, 4D eye distance, a
toggle and rate for each of the six rotation planes, wireframe/solid, vertex and
edge visibility, and return to the original orientation.

## Structure

- `src/math` — tesseract construction, six-plane 4D rotation, 4D→3D perspective
  projection. No rendering imports; covered by `npm test`.
- `src/app` — settings and the opening sequence as pure functions of time.
- `src/render` — Three.js stage and the instanced tesseract view.
- `src/ui` — the control bar and panel.

## Develop

```
npm install
npm run dev
npm test
npm run build
```
