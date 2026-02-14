# Elevation Profile + Track Stats Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show elevation profile chart and stats panel for the focused track.

**Architecture:** New `trackStats.ts` utility computes distance/elevation/duration stats via haversine formula. Recharts `AreaChart` renders elevation vs cumulative distance in a bottom panel that slides up when a track is focused. Stats bar is displayed inline above the chart. All integrated into `GpxViewer.tsx` — no new component files (consistent with "one big component" architecture).

**Tech Stack:** recharts (React charting), existing React 19 + TypeScript + Tailwind v4

---

### Task 1: Install recharts

**Files:**
- Modify: `package.json`

**Step 1: Install dependency**

Run: `npm install recharts`

**Step 2: Verify install**

Run: `npx tsc --noEmit`
Expected: PASS (no type errors)

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "add recharts dependency"
```

---

### Task 2: Create trackStats utility

**Files:**
- Create: `src/utils/trackStats.ts`

**Step 1: Write trackStats.ts**

This file exports:
- `haversineDistance(p1, p2)` — distance between two `Waypoint`s in meters
- `TrackStats` interface — `{ distance, elevGain, elevLoss, duration, avgSpeed, maxEle, minEle }`
- `computeTrackStats(track: TrackSegment)` → `TrackStats`
- `ElevationPoint` interface — `{ distance: number; elevation: number }` (for chart data)
- `computeElevationProfile(track: TrackSegment)` → `ElevationPoint[]` (cumulative distance in km vs elevation in m)
- Downsampling: if >5000 points, downsample to ~2000 using Ramer-Douglas-Peucker or simple nth-point sampling

```typescript
import { type Waypoint, type TrackSegment } from './gpxParser';

export interface TrackStats {
  distance: number;      // total distance in meters
  elevGain: number;      // total elevation gain in meters
  elevLoss: number;      // total elevation loss in meters
  duration: number | null; // seconds, null if no timestamps
  avgSpeed: number | null; // m/s, null if no timestamps
  maxEle: number | null;
  minEle: number | null;
}

export interface ElevationPoint {
  distance: number;   // cumulative distance in km
  elevation: number;  // elevation in meters
}

const R = 6371e3; // Earth radius in meters

export const haversineDistance = (p1: Waypoint, p2: Waypoint): number => {
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(p2.lat - p1.lat);
  const dLng = toRad(p2.lng - p1.lng);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const computeTrackStats = (track: TrackSegment): TrackStats => {
  const pts = track.points;
  let distance = 0, elevGain = 0, elevLoss = 0;
  let maxEle: number | null = null, minEle: number | null = null;

  for (let i = 0; i < pts.length; i++) {
    if (i > 0) {
      distance += haversineDistance(pts[i - 1], pts[i]);
      if (pts[i].ele != null && pts[i - 1].ele != null) {
        const diff = pts[i].ele! - pts[i - 1].ele!;
        if (diff > 0) elevGain += diff;
        else elevLoss += Math.abs(diff);
      }
    }
    if (pts[i].ele != null) {
      if (maxEle === null || pts[i].ele! > maxEle) maxEle = pts[i].ele!;
      if (minEle === null || pts[i].ele! < minEle) minEle = pts[i].ele!;
    }
  }

  const first = pts[0]?.time;
  const last = pts[pts.length - 1]?.time;
  const duration = first && last ? (last.getTime() - first.getTime()) / 1000 : null;
  const avgSpeed = duration && duration > 0 ? distance / duration : null;

  return { distance, elevGain, elevLoss, duration, avgSpeed, maxEle, minEle };
};

export const computeElevationProfile = (track: TrackSegment): ElevationPoint[] => {
  const pts = track.points;
  const hasElevation = pts.some(p => p.ele != null);
  if (!hasElevation) return [];

  let cumDist = 0;
  let result: ElevationPoint[] = [];

  for (let i = 0; i < pts.length; i++) {
    if (i > 0) cumDist += haversineDistance(pts[i - 1], pts[i]);
    if (pts[i].ele != null) {
      result.push({ distance: cumDist / 1000, elevation: pts[i].ele! });
    }
  }

  // Downsample if >5000 points — take every nth point, always keep first and last
  if (result.length > 5000) {
    const step = Math.ceil(result.length / 2000);
    const sampled = [result[0]];
    for (let i = step; i < result.length - 1; i += step) {
      sampled.push(result[i]);
    }
    sampled.push(result[result.length - 1]);
    result = sampled;
  }

  return result;
};
```

**Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/utils/trackStats.ts
git commit -m "add trackStats utility: haversine, stats, elevation profile"
```

---

### Task 3: Add elevation panel + stats to GpxViewer

**Files:**
- Modify: `src/components/GpxViewer.tsx`

This is the main integration task. Add the following to GpxViewer:

**Step 1: Add imports and helper at top of file**

After the existing imports, add:

```typescript
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { computeTrackStats, computeElevationProfile, type TrackStats, type ElevationPoint } from '../utils/trackStats';
```

Add a format helper function (before the `GpxViewer` component):

```typescript
const formatDuration = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}` : `${m}m`;
};
```

**Step 2: Compute stats + elevation profile via useMemo**

Inside `GpxViewer` component, after existing `useMemo` hooks, add:

```typescript
const focusedFile = useMemo(() => files.find(f => f.id === focusedFileId) ?? null, [files, focusedFileId]);

const focusedStats = useMemo((): { stats: TrackStats; elevation: ElevationPoint[] } | null => {
  if (!focusedFile) return null;
  // Merge all track segments into one for stats
  const allPoints = focusedFile.data.tracks.flatMap(t => t.points);
  if (allPoints.length === 0) return null;
  const merged = { points: allPoints };
  return {
    stats: computeTrackStats(merged),
    elevation: computeElevationProfile(merged),
  };
}, [focusedFile]);
```

**Step 3: Add the elevation panel JSX**

Add this right before the closing `</div>` of the root element (before `{/* Error toast */}`). The panel slides up from the bottom when a track is focused. Map style switcher needs to shift up when panel is open.

```tsx
{/* Elevation panel */}
{focusedStats && (
  <div className="absolute right-0 bottom-0 left-0 z-[1000] bg-white/95 shadow-[0_-2px_12px_rgba(0,0,0,0.1)] backdrop-blur-lg transition-all">
    {/* Stats bar */}
    <div className="flex items-center gap-4 border-b border-gray-100 px-4 py-2">
      <div className="min-w-0 flex-1 truncate text-xs font-medium text-gray-600">
        {focusedFile?.data.name || focusedFile?.fileName}
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span title="Distance">{(focusedStats.stats.distance / 1000).toFixed(1)} km</span>
        {focusedStats.stats.elevGain > 0 && (
          <span title="Elevation gain" className="text-emerald-600">↑ {Math.round(focusedStats.stats.elevGain)}m</span>
        )}
        {focusedStats.stats.elevLoss > 0 && (
          <span title="Elevation loss" className="text-red-500">↓ {Math.round(focusedStats.stats.elevLoss)}m</span>
        )}
        {focusedStats.stats.maxEle != null && (
          <span title="Max elevation">⬆ {Math.round(focusedStats.stats.maxEle)}m</span>
        )}
        {focusedStats.stats.minEle != null && (
          <span title="Min elevation">⬇ {Math.round(focusedStats.stats.minEle)}m</span>
        )}
        {focusedStats.stats.duration != null && (
          <span title="Duration">⏱ {formatDuration(focusedStats.stats.duration)}</span>
        )}
        {focusedStats.stats.avgSpeed != null && (
          <span title="Average speed">{(focusedStats.stats.avgSpeed * 3.6).toFixed(1)} km/h</span>
        )}
      </div>
      <button
        className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-gray-400 transition-colors hover:text-gray-600"
        onClick={clearFocus}
        title="Close"
      >
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    {/* Elevation chart — only if elevation data exists */}
    {focusedStats.elevation.length > 0 && (
      <div className="h-[150px] w-full px-2 py-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={focusedStats.elevation} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="eleGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={focusedFile?.color || '#3e82f7'} stopOpacity={0.3} />
                <stop offset="100%" stopColor={focusedFile?.color || '#3e82f7'} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="distance"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={v => `${Number(v).toFixed(1)}`}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              axisLine={{ stroke: '#e5e7eb' }}
              tickLine={false}
              label={{ value: 'km', position: 'insideBottomRight', offset: -5, style: { fontSize: 10, fill: '#9ca3af' } }}
            />
            <YAxis
              domain={['dataMin - 20', 'dataMax + 20']}
              tickFormatter={v => `${Math.round(Number(v))}`}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              width={40}
              label={{ value: 'm', position: 'insideTopLeft', offset: -5, style: { fontSize: 10, fill: '#9ca3af' } }}
            />
            <Tooltip
              formatter={(value: number) => [`${Math.round(value)}m`, 'Elevation']}
              labelFormatter={(label: number) => `${label.toFixed(2)} km`}
              contentStyle={{ fontSize: 11, borderRadius: 8, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}
            />
            <Area
              type="monotone"
              dataKey="elevation"
              stroke={focusedFile?.color || '#3e82f7'}
              strokeWidth={1.5}
              fill="url(#eleGradient)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    )}
  </div>
)}
```

**Step 4: Shift map style switcher up when elevation panel is open**

Change the map style switcher div's className from:
```
"absolute bottom-3 right-3 z-[1000] flex gap-1 rounded-full bg-white/90 p-1 shadow-lg backdrop-blur-lg"
```
to:
```tsx
{`absolute right-3 z-[1000] flex gap-1 rounded-full bg-white/90 p-1 shadow-lg backdrop-blur-lg transition-all ${focusedStats ? (focusedStats.elevation.length > 0 ? 'bottom-[195px]' : 'bottom-[50px]') : 'bottom-3'}`}
```

This pushes the switcher above the elevation panel (150px chart + ~45px stats bar = ~195px) or just above the stats bar if no elevation data.

**Step 5: Type-check and dev test**

Run: `npx tsc --noEmit`
Expected: PASS

Run: `npm run dev`
Manual test: Load a GPX file with elevation data, click on its name to focus → elevation panel appears at bottom with stats and chart. Click X to close. Load a GPX without elevation → only stats bar shown.

**Step 6: Commit**

```bash
git add src/components/GpxViewer.tsx
git commit -m "elevation profile panel with stats bar on focused track"
```

---

### Task 4: Polish and edge cases

**Files:**
- Modify: `src/components/GpxViewer.tsx`

**Step 1: Handle multi-segment tracks properly in stats**

The current approach merges all segments' points. If a file has multiple track segments, the haversine distance between the last point of segment N and first point of segment N+1 could be wrong (e.g., separate laps). Fix by computing stats per segment and summing:

In the `focusedStats` useMemo, replace the merged approach:

```typescript
const focusedStats = useMemo((): { stats: TrackStats; elevation: ElevationPoint[] } | null => {
  if (!focusedFile) return null;
  const tracks = focusedFile.data.tracks;
  if (tracks.length === 0) return null;

  // Compute per-segment and merge
  let distance = 0, elevGain = 0, elevLoss = 0;
  let maxEle: number | null = null, minEle: number | null = null;
  let totalDuration: number | null = null;

  const allElevation: ElevationPoint[] = [];
  let cumulativeDistance = 0;

  for (const track of tracks) {
    const s = computeTrackStats(track);
    distance += s.distance;
    elevGain += s.elevGain;
    elevLoss += s.elevLoss;
    if (s.maxEle != null) maxEle = maxEle != null ? Math.max(maxEle, s.maxEle) : s.maxEle;
    if (s.minEle != null) minEle = minEle != null ? Math.min(minEle, s.minEle) : s.minEle;
    if (s.duration != null) totalDuration = (totalDuration ?? 0) + s.duration;

    // Elevation profile: offset cumulative distance by previous segments
    const segProfile = computeElevationProfile(track);
    for (const p of segProfile) {
      allElevation.push({ distance: p.distance + cumulativeDistance / 1000, elevation: p.elevation });
    }
    cumulativeDistance += s.distance;
  }

  const avgSpeed = totalDuration && totalDuration > 0 ? distance / totalDuration : null;

  return {
    stats: { distance, elevGain, elevLoss, duration: totalDuration, avgSpeed, maxEle, minEle },
    elevation: allElevation,
  };
}, [focusedFile]);
```

**Step 2: Move error toast up when panel is open**

Change the error toast positioning to account for the elevation panel. Replace the error toast's className with:

```tsx
{`absolute left-1/2 z-[1000] max-w-md -translate-x-1/2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white shadow-lg ${focusedStats ? (focusedStats.elevation.length > 0 ? 'bottom-[200px]' : 'bottom-[55px]') : 'bottom-4'}`}
```

**Step 3: Type-check and final test**

Run: `npx tsc --noEmit`
Expected: PASS

Run: `npm run dev`
Manual test: Load multiple GPX files, focus different tracks, verify stats update, chart renders correctly, panel doesn't overlap controls.

**Step 4: Commit**

```bash
git add src/components/GpxViewer.tsx
git commit -m "handle multi-segment tracks in stats, fix panel overlaps"
```

---

## Summary of changes

| File | Action | Description |
|------|--------|-------------|
| `package.json` | Modify | Add recharts dependency |
| `src/utils/trackStats.ts` | Create | haversine distance, stats computation, elevation profile data |
| `src/components/GpxViewer.tsx` | Modify | Elevation panel, stats bar, chart rendering, layout adjustments |

## Notes

- No new component files — keeps the "everything in GpxViewer" architecture per CLAUDE.md
- recharts is ~200KB gzipped but is the standard React charting lib; acceptable for this feature
- Downsampling kicks in at >5000 points to keep chart responsive
- Duration/speed stats only shown when timestamps exist in GPX data
- Chart uses the focused track's color for visual consistency
- Panel resize (drag handle) is a stretch goal — not included in this plan
- Hover-highlights-map-point is listed as nice-to-have — not included in this plan
