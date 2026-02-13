# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Dev server on :3000
npm run build    # tsc + vite build → dist/
npm run preview  # Serve dist/ locally
```

No test suite configured. Type-check with `npx tsc --noEmit`.

## Architecture

Multi-file GPX track viewer. React 19 + TypeScript, Vite 7, Leaflet via react-leaflet, Tailwind CSS v4 (Vite plugin).

Almost all logic lives in `src/components/GpxViewer.tsx` — map rendering, file upload/drag-drop, overlay panels, map style switcher. This is intentional; the app is small and doesn't warrant splitting further.

GPX parsing is in `src/utils/gpxParser.ts` with a two-tier approach: tries `@mapbox/togeojson` first, falls back to a custom DOMParser-based XML parser. Both run client-side.

Styling: Tailwind utility classes inline in JSX. `src/styles/App.css` only contains the Tailwind import and Leaflet control overrides (zoom, scale, attribution) that can't be done with utility classes.

## Key Patterns

- **Additive file loading**: `files` state is `LoadedFile[]`. New uploads append, never replace. Each file gets a cycling color from `TRACK_COLORS`.
- **Two-state UI**: Empty → centered upload card. Loaded → top-right file panel with per-file remove. Panel avoids Leaflet zoom controls (top-left).
- **Bounds management**: `mapBounds` (all files) computed via `useMemo` reusing `fileBounds()`. `focusBounds` set when clicking a track name. `boundsVersion` counter forces re-trigger on same bounds.
- **Map styles**: 4 tile providers in `MAP_STYLES` (`as const`), switcher pill at bottom-right.

## Conventions

- Tailwind utilities only; no custom CSS classes for app components
- Leaflet CSS imported via JS, not CDN
- Concise commit messages
- `as const` for static config arrays
