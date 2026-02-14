import { type Waypoint, type TrackSegment } from './gpxParser';

export interface TrackStats {
  distance: number;        // total distance in meters
  elevGain: number;        // total elevation gain in meters
  elevLoss: number;        // total elevation loss in meters
  duration: number | null;  // seconds, null if no timestamps
  avgSpeed: number | null;  // m/s, null if no timestamps
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

  // Downsample if >5000 points — take every nth point, keep first and last
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
