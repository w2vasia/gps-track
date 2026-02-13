import React, { useState, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, ScaleControl, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { parseGPX, GPXData } from '../utils/gpxParser';

const TRACK_COLORS = ['#3e82f7', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

const MAP_STYLES = [
  { id: 'positron', label: 'Light', url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>' },
  { id: 'dark', label: 'Dark', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>' },
  { id: 'osm', label: 'Standard', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' },
  { id: 'topo', label: 'Topo', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://opentopomap.org">OpenTopoMap</a>' },
] as const;

interface LoadedFile {
  id: string;
  fileName: string;
  data: GPXData;
}

const MapBoundsUpdater: React.FC<{ bounds: L.LatLngBounds | null; version: number }> = ({ bounds, version }) => {
  const map = useMap();
  React.useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [map, bounds, version]);
  return null;
};

const fileBounds = (file: LoadedFile): L.LatLngBounds | null => {
  let minLat = Infinity, maxLat = -Infinity;
  let minLng = Infinity, maxLng = -Infinity;
  for (const track of file.data.tracks) {
    for (const p of track.points) {
      minLat = Math.min(minLat, p.lat);
      maxLat = Math.max(maxLat, p.lat);
      minLng = Math.min(minLng, p.lng);
      maxLng = Math.max(maxLng, p.lng);
    }
  }
  if (isFinite(minLat) && isFinite(maxLat) && isFinite(minLng) && isFinite(maxLng)) {
    return new L.LatLngBounds([minLat, minLng], [maxLat, maxLng]);
  }
  return null;
};

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const GpxViewer: React.FC = () => {
  const [files, setFiles] = useState<LoadedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [focusBounds, setFocusBounds] = useState<L.LatLngBounds | null>(null);
  const [boundsVersion, setBoundsVersion] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [mapStyle, setMapStyle] = useState<(typeof MAP_STYLES)[number]>(MAP_STYLES[0]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const nextId = useRef(0);

  const mapBounds = useMemo(() => {
    const all = files.map(fileBounds).filter((b): b is L.LatLngBounds => b !== null);
    if (all.length === 0) return null;
    return all.reduce((acc, b) => acc.extend(b.getSouthWest()).extend(b.getNorthEast()), new L.LatLngBounds(all[0].getSouthWest(), all[0].getNorthEast()));
  }, [files]);

  const processFiles = async (fileList: File[]) => {
    const gpxFiles = fileList.filter(f => f.name.endsWith('.gpx'));
    if (gpxFiles.length === 0) return;

    const newEntries: LoadedFile[] = [];
    const failed: string[] = [];
    for (const file of gpxFiles) {
      try {
        const content = await file.text();
        const data = await parseGPX(content);
        newEntries.push({ id: String(++nextId.current), fileName: file.name, data });
      } catch (error) {
        failed.push(file.name);
      }
    }
    if (failed.length > 0) {
      setErrors(failed.map(n => `Failed to parse ${n}`));
      setTimeout(() => setErrors([]), 4000);
    }
    if (newEntries.length > 0) {
      setFiles(prev => [...prev, ...newEntries]);
      setFocusBounds(null);
      setBoundsVersion(v => v + 1);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const list = event.target.files;
    if (list) processFiles(Array.from(list));
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    dragCounter.current = 0;
    setDragging(false);
    processFiles(Array.from(event.dataTransfer.files));
  };

  const handleDragEnter = (event: React.DragEvent) => {
    event.preventDefault();
    dragCounter.current++;
    setDragging(true);
  };

  const handleDragLeave = () => {
    dragCounter.current--;
    if (dragCounter.current === 0) setDragging(false);
  };

  const handleDragOver = (event: React.DragEvent) => event.preventDefault();

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const focusFile = (file: LoadedFile) => {
    const bounds = fileBounds(file);
    if (bounds) {
      setFocusBounds(bounds);
      setBoundsVersion(v => v + 1);
    }
  };

  const clearAll = () => {
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div
      className="relative h-screen w-screen"
      onDrop={handleDrop}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".gpx"
        multiple
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Map */}
      <div className="absolute inset-0">
        <MapContainer
          center={[0, 0]}
          zoom={2}
          style={{ height: '100%', width: '100%' }}
          bounds={mapBounds || undefined}
        >
          <TileLayer
            key={mapStyle.id}
            url={mapStyle.url}
            attribution={mapStyle.attr}
          />
          <ScaleControl position="bottomleft" />
          <MapBoundsUpdater bounds={focusBounds ?? mapBounds} version={boundsVersion} />

          {files.map((file, fileIdx) =>
            file.data.tracks?.map((track, trackIdx) => (
              <Polyline
                key={`${file.id}-t${trackIdx}`}
                positions={track.points.map(p => [p.lat, p.lng])}
                color={TRACK_COLORS[fileIdx % TRACK_COLORS.length]}
                weight={4}
                opacity={0.8}
              />
            ))
          )}

          {files.map(file =>
            file.data.waypoints?.map((wp, i) => (
              <Marker key={`${file.id}-wp${i}`} position={[wp.lat, wp.lng]}>
                <Popup>
                  <div>
                    <strong>Waypoint {i + 1}</strong><br />
                    Lat: {wp.lat.toFixed(6)}<br />
                    Lng: {wp.lng.toFixed(6)}<br />
                    {wp.ele != null && `Elevation: ${wp.ele}m`}
                    {wp.time && <><br />Time: {wp.time.toLocaleString()}</>}
                    {wp.name && <><br />Name: {wp.name}</>}
                  </div>
                </Popup>
              </Marker>
            ))
          )}
        </MapContainer>
      </div>

      {/* Drag overlay */}
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-[1001] flex items-center justify-center bg-black/30 backdrop-blur-xs">
          <div className="rounded-2xl border-2 border-dashed border-white/60 px-10 py-8 text-lg font-medium text-white">
            Drop GPX files
          </div>
        </div>
      )}

      {/* Empty state */}
      {files.length === 0 && !dragging && (
        <div className="pointer-events-none absolute inset-0 z-[1000] flex items-center justify-center">
          <div
            className="pointer-events-auto group cursor-pointer rounded-2xl bg-white/90 px-10 py-8 shadow-xl backdrop-blur-lg transition-all hover:shadow-2xl hover:bg-white/95"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="flex flex-col items-center gap-3 text-gray-400 transition-colors group-hover:text-[#3e82f7]">
              <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span className="text-base font-medium">Open or drop GPX files</span>
              <span className="text-xs text-gray-300">click or drag & drop</span>
            </div>
          </div>
        </div>
      )}

      {/* Loaded state — top-right panel */}
      {files.length > 0 && (
        <div className="absolute top-3 right-3 z-[1000] flex max-h-[50vh] w-64 flex-col rounded-xl bg-white/90 shadow-lg backdrop-blur-lg max-sm:left-3 max-sm:w-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
            <button
              className="cursor-pointer rounded-lg border-none bg-transparent px-2 py-1 text-xs text-[#3e82f7] transition-colors hover:bg-[#3e82f7]/10"
              onClick={() => fileInputRef.current?.click()}
              title="Add more files"
            >
              + Add
            </button>
            <button
              className="cursor-pointer rounded-lg border-none bg-transparent px-2 py-1 text-xs text-gray-400 transition-colors hover:text-red-500 hover:bg-red-50"
              onClick={clearAll}
              title="Clear all"
            >
              Clear all
            </button>
          </div>

          {/* File list */}
          <div className="flex flex-col gap-0.5 overflow-y-auto px-1.5 pb-2">
            {files.map((file, idx) => (
              <div
                key={file.id}
                className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-black/4"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: TRACK_COLORS[idx % TRACK_COLORS.length] }}
                />
                <span
                  className="min-w-0 flex-1 cursor-pointer truncate text-sm text-gray-600 hover:text-[#3e82f7]"
                  onClick={() => focusFile(file)}
                  title="Zoom to track"
                >
                  {file.data.name || file.fileName}
                </span>
                <button
                  className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-gray-300 opacity-0 transition-all group-hover:opacity-100 hover:bg-red-50 hover:text-red-500"
                  onClick={() => removeFile(file.id)}
                  title="Remove"
                >
                  <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Map style switcher */}
      <div className="absolute bottom-3 right-3 z-[1000] flex gap-1 rounded-full bg-white/90 p-1 shadow-lg backdrop-blur-lg">
        {MAP_STYLES.map(style => (
          <button
            key={style.id}
            className={`cursor-pointer rounded-full border-none px-3 py-1 text-xs transition-all ${
              mapStyle.id === style.id
                ? 'bg-[#3e82f7] text-white shadow-sm'
                : 'bg-transparent text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setMapStyle(style)}
          >
            {style.label}
          </button>
        ))}
      </div>

      {/* Error toast */}
      {errors.length > 0 && (
        <div className="absolute bottom-4 left-1/2 z-[1000] -translate-x-1/2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white shadow-lg">
          {errors.join(', ')}
        </div>
      )}
    </div>
  );
};

export default GpxViewer;