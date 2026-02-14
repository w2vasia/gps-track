export interface Waypoint {
  lat: number;
  lng: number;
  ele?: number;
  time?: Date;
  name?: string;
}

export interface TrackSegment {
  points: Waypoint[];
}

export interface GPXData {
  name?: string;
  desc?: string;
  author?: string;
  tracks: TrackSegment[];
  waypoints: Waypoint[];
}

const parsePoint = (el: Element): Waypoint | null => {
  const latAttr = el.getAttribute('lat');
  const lonAttr = el.getAttribute('lon');
  if (latAttr == null || lonAttr == null) return null;
  const lat = parseFloat(latAttr);
  const lon = parseFloat(lonAttr);
  if (isNaN(lat) || isNaN(lon)) return null;

  const point: Waypoint = { lat, lng: lon };

  const eleEl = el.querySelector('ele');
  if (eleEl?.textContent) {
    const ele = parseFloat(eleEl.textContent);
    if (!isNaN(ele)) point.ele = ele;
  }

  const timeEl = el.querySelector('time');
  if (timeEl?.textContent) {
    const time = new Date(timeEl.textContent);
    if (!isNaN(time.getTime())) point.time = time;
  }

  const nameEl = el.querySelector('name');
  if (nameEl?.textContent) point.name = nameEl.textContent;

  return point;
};

export const parseGPXFallback = (gpxContent: string): GPXData => {
  const parser = new DOMParser();
  const gpx = parser.parseFromString(gpxContent, 'text/xml');

  const parseError = gpx.querySelector('parsererror');
  if (parseError) throw new Error('Error parsing GPX XML');

  const tracks: TrackSegment[] = [];
  const waypoints: Waypoint[] = [];

  const name = gpx.querySelector('name')?.textContent || undefined;
  const desc = gpx.querySelector('desc')?.textContent || undefined;

  // Parse tracks (<trk> elements)
  gpx.querySelectorAll('trk').forEach(trackEl => {
    trackEl.querySelectorAll('trkseg').forEach(segEl => {
      const points: Waypoint[] = [];
      segEl.querySelectorAll('trkpt').forEach(ptEl => {
        const p = parsePoint(ptEl);
        if (p) points.push(p);
      });
      if (points.length > 0) tracks.push({ points });
    });
  });

  // Parse routes (<rte> elements)
  gpx.querySelectorAll('rte').forEach(rteEl => {
    const points: Waypoint[] = [];
    rteEl.querySelectorAll('rtept').forEach(ptEl => {
      const p = parsePoint(ptEl);
      if (p) points.push(p);
    });
    if (points.length > 0) tracks.push({ points });
  });

  // Parse waypoints (<wpt> elements)
  gpx.querySelectorAll('wpt').forEach(wpEl => {
    const p = parsePoint(wpEl);
    if (p) waypoints.push(p);
  });

  return { name, desc, tracks, waypoints };
};

export const parseGPX = async (gpxContent: string): Promise<GPXData> => {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(gpxContent, 'text/xml');

    const parseError = doc.querySelector('parsererror');
    if (parseError) throw new Error('Error parsing GPX XML');

    const toGeoJSON = await import('@mapbox/togeojson');
    const geojson = toGeoJSON.gpx(doc);

    const tracks: TrackSegment[] = [];
    const waypoints: Waypoint[] = [];

    for (const feature of geojson.features) {
      const geom = feature.geometry;
      if (geom.type === 'LineString') {
        const points = (geom.coordinates as number[][]).map(coordToWaypoint);
        tracks.push({ points });
      } else if (geom.type === 'MultiLineString') {
        for (const coords of geom.coordinates as number[][][]) {
          const points = coords.map(coordToWaypoint);
          tracks.push({ points });
        }
      } else if (geom.type === 'Point') {
        const coord = geom.coordinates as number[];
        const wp = coordToWaypoint(coord);
        if (feature.properties?.name) wp.name = feature.properties.name as string;
        if (feature.properties?.time) wp.time = new Date(feature.properties.time as string);
        waypoints.push(wp);
      }
    }

    return {
      name: (geojson as unknown as Record<string, unknown>).name as string | undefined,
      desc: (geojson as unknown as Record<string, unknown>).description as string | undefined,
      tracks,
      waypoints
    };
  } catch {
    return parseGPXFallback(gpxContent);
  }
};

const coordToWaypoint = (coord: number[]): Waypoint => {
  const wp: Waypoint = { lng: coord[0], lat: coord[1] };
  if (coord.length > 2) wp.ele = coord[2];
  return wp;
};

// Serialized types for Web Worker postMessage (Date → ISO string)
export interface SerializedWaypoint {
  lat: number;
  lng: number;
  ele?: number;
  time?: string;
  name?: string;
}

export interface SerializedGPXData {
  name?: string;
  desc?: string;
  author?: string;
  tracks: { points: SerializedWaypoint[] }[];
  waypoints: SerializedWaypoint[];
}

const serializeWaypoint = (wp: Waypoint): SerializedWaypoint => {
  const s: SerializedWaypoint = { lat: wp.lat, lng: wp.lng };
  if (wp.ele !== undefined) s.ele = wp.ele;
  if (wp.time) s.time = wp.time.toISOString();
  if (wp.name) s.name = wp.name;
  return s;
};

const deserializeWaypoint = (sw: SerializedWaypoint): Waypoint => {
  const wp: Waypoint = { lat: sw.lat, lng: sw.lng };
  if (sw.ele !== undefined) wp.ele = sw.ele;
  if (sw.time) wp.time = new Date(sw.time);
  if (sw.name) wp.name = sw.name;
  return wp;
};

export const serializeGPXData = (data: GPXData): SerializedGPXData => ({
  name: data.name,
  desc: data.desc,
  author: data.author,
  tracks: data.tracks.map(t => ({ points: t.points.map(serializeWaypoint) })),
  waypoints: data.waypoints.map(serializeWaypoint),
});

export const deserializeGPXData = (data: SerializedGPXData): GPXData => ({
  name: data.name,
  desc: data.desc,
  author: data.author,
  tracks: data.tracks.map(t => ({ points: t.points.map(deserializeWaypoint) })),
  waypoints: data.waypoints.map(deserializeWaypoint),
});
