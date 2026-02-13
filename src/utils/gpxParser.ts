// Define the types for our GPX data
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

/**
 * Parse a GPX string using a fallback pure JavaScript parser
 * @param gpxContent The GPX XML content as a string
 * @returns Parsed GPX data
 */
export const parseGPXFallback = (gpxContent: string): GPXData => {
  // Use the browser's built-in DOMParser
  const parser = new DOMParser();
  const gpx = parser.parseFromString(gpxContent, 'text/xml');
  
  // Check for parsing errors
  const parseError = gpx.querySelector('parsererror');
  if (parseError) {
    throw new Error('Error parsing GPX XML');
  }

  const tracks: TrackSegment[] = [];
  const waypoints: Waypoint[] = [];

  // Get GPX metadata
  const name = gpx.querySelector('name')?.textContent || undefined;
  const desc = gpx.querySelector('desc')?.textContent || undefined;

  // Parse tracks (<trk> elements)
  const trackElements = gpx.querySelectorAll('trk');
  trackElements.forEach(trackEl => {
    const trackSegments: TrackSegment[] = [];
    
    // Look for track segments (<trkseg>)
    const trackSegElements = trackEl.querySelectorAll('trkseg');
    trackSegElements.forEach(segEl => {
      const points: Waypoint[] = [];
      
      // Look for track points (<trkpt>)
      const trackPointElements = segEl.querySelectorAll('trkpt');
      trackPointElements.forEach(pointEl => {
        const lat = parseFloat(pointEl.getAttribute('lat') || '0');
        const lon = parseFloat(pointEl.getAttribute('lon') || '0');
        
        if (!isNaN(lat) && !isNaN(lon)) {
          const point: Waypoint = {
            lat,
            lng: lon
          };
          
          // Look for elevation
          const eleEl = pointEl.querySelector('ele');
          if (eleEl && eleEl.textContent) {
            const ele = parseFloat(eleEl.textContent);
            if (!isNaN(ele)) {
              point.ele = ele;
            }
          }
          
          // Look for time
          const timeEl = pointEl.querySelector('time');
          if (timeEl && timeEl.textContent) {
            const time = new Date(timeEl.textContent);
            if (!isNaN(time.getTime())) {
              point.time = time;
            }
          }
          
          points.push(point);
        }
      });
      
      if (points.length > 0) {
        trackSegments.push({ points });
      }
    });
    
    if (trackSegments.length > 0) {
      tracks.push(...trackSegments);
    }
  });

  // Parse waypoints (<wpt> elements)
  const waypointElements = gpx.querySelectorAll('wpt');
  waypointElements.forEach(wpEl => {
    const lat = parseFloat(wpEl.getAttribute('lat') || '0');
    const lon = parseFloat(wpEl.getAttribute('lon') || '0');
    
    if (!isNaN(lat) && !isNaN(lon)) {
      const waypoint: Waypoint = {
        lat,
        lng: lon
      };
      
      // Look for name
      const nameEl = wpEl.querySelector('name');
      if (nameEl && nameEl.textContent) {
        waypoint.name = nameEl.textContent;
      }
      
      // Look for elevation
      const eleEl = wpEl.querySelector('ele');
      if (eleEl && eleEl.textContent) {
        const ele = parseFloat(eleEl.textContent);
        if (!isNaN(ele)) {
          waypoint.ele = ele;
        }
      }
      
      // Look for time
      const timeEl = wpEl.querySelector('time');
      if (timeEl && timeEl.textContent) {
        const time = new Date(timeEl.textContent);
        if (!isNaN(time.getTime())) {
          waypoint.time = time;
        }
      }
      
      waypoints.push(waypoint);
    }
  });

  return {
    name,
    desc,
    tracks,
    waypoints
  };
};

/**
 * Parse a GPX string and extract track and waypoint data
 * @param gpxContent The GPX XML content as a string
 * @returns Parsed GPX data
 */
export const parseGPX = async (gpxContent: string): Promise<GPXData> => {
  try {
    // Try to dynamically import and use toGeoJSON first
    const toGeoJSONModule: any = await import('@mapbox/togeojson');

    let toGeoJSON: any;

    // Try different ways the function might be exported
    if (typeof toGeoJSONModule.default === 'function') {
      toGeoJSON = toGeoJSONModule.default;
    } else if (toGeoJSONModule.toGeoJSON && typeof toGeoJSONModule.toGeoJSON === 'function') {
      toGeoJSON = toGeoJSONModule.toGeoJSON;
    } else if (typeof toGeoJSONModule === 'function') {
      toGeoJSON = toGeoJSONModule;
    } else if (toGeoJSONModule.default?.gpx === 'function') {
      toGeoJSON = toGeoJSONModule.default.gpx;
    } else {
      toGeoJSON = toGeoJSONModule.default || toGeoJSONModule;
    }
    
    // Use the browser's built-in DOMParser
    const parser = new DOMParser();
    const gpx = parser.parseFromString(gpxContent, 'text/xml');
    
    // Check for parsing errors
    const parseError = gpx.querySelector('parsererror');
    if (parseError) {
      throw new Error('Error parsing GPX XML');
    }
    
    // Convert to GeoJSON using togeojson
    if (typeof toGeoJSON === 'function') {
      const geojson = toGeoJSON(gpx);
      
      const tracks: TrackSegment[] = [];
      const waypoints: Waypoint[] = [];
      
      // Process GeoJSON features
      if (geojson && geojson.features) {
        for (const feature of geojson.features) {
          if (feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiLineString') {
            // This is a track/route
            let coordinates: number[][] = [];
            
            if (feature.geometry.type === 'LineString') {
              coordinates = feature.geometry.coordinates;
            } else if (feature.geometry.type === 'MultiLineString') {
              // For MultiLineString, take the first line or flatten all
              coordinates = feature.geometry.coordinates[0] || [];
            }
            
            const points: Waypoint[] = coordinates.map(coord => {
              const point: Waypoint = {
                lng: coord[0], // longitude is first in GeoJSON
                lat: coord[1], // latitude is second
              };
              
              // Elevation might be in the third coordinate for 3D GeoJSON
              if (coord.length > 2) {
                point.ele = coord[2];
              }
              
              return point;
            });
            
            tracks.push({ points });
          } else if (feature.geometry.type === 'Point') {
            // This is a waypoint
            const coord = feature.geometry.coordinates;
            const waypoint: Waypoint = {
              lng: coord[0],
              lat: coord[1],
            };
            
            if (coord.length > 2) {
              waypoint.ele = coord[2];
            }
            
            // Extract properties if available
            if (feature.properties) {
              if (feature.properties.name) {
                waypoint.name = feature.properties.name;
              }
              if (feature.properties.time) {
                waypoint.time = new Date(feature.properties.time);
              }
            }
            
            waypoints.push(waypoint);
          }
        }
      }
      
      return {
        name: geojson.name || undefined,
        desc: geojson.description || undefined,
        tracks,
        waypoints
      };
    } else {
      return parseGPXFallback(gpxContent);
    }
  } catch {
    return parseGPXFallback(gpxContent);
  }
};