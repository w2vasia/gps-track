# GPX Track Viewer

A minimal, full-bleed map app for viewing GPX tracks. Upload multiple files, compare tracks with color coding, switch map styles.

## Features

- Multi-file GPX upload (click or drag & drop anywhere)
- Color-coded tracks rendered on a single map
- Click track name to zoom/focus, remove individual tracks
- 4 map styles: Light, Dark, Standard, Topo
- Waypoint markers with popup details
- Auto-fit bounds across all loaded tracks
- Responsive — works on mobile

## Tech Stack

- React 19, TypeScript, Vite 7
- Leaflet + React-Leaflet
- Tailwind CSS v4
- @mapbox/togeojson (with fallback XML parser)

## Getting Started

```bash
git clone https://github.com/w2vasia/gps-track.git
cd gps-track
npm install
npm run dev
```

Opens at `http://localhost:3000`.

## Build

```bash
npm run build
npm run preview
```

## Project Structure

```
src/
├── components/
│   └── GpxViewer.tsx    # Map, file management, UI overlays
├── styles/
│   └── App.css          # Tailwind + Leaflet overrides
├── utils/
│   └── gpxParser.ts     # GPX parsing (togeojson + fallback)
├── types/
│   └── togeojson.d.ts   # Type declaration
├── App.tsx
└── main.tsx
```

## License

ISC
