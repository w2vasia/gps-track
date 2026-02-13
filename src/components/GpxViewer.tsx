import React, { useState, useRef, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, ScaleControl, useMap, useMapEvents } from 'react-leaflet';
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

const MapClickHandler: React.FC<{ onMapClick: () => void }> = ({ onMapClick }) => {
  useMapEvents({ click: onMapClick });
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

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface FileListItemProps {
  file: LoadedFile;
  color: string;
  focused: boolean;
  onFocus: (file: LoadedFile) => void;
  onRemove: (id: string) => void;
}

const FileListItem = React.memo<FileListItemProps>(({ file, color, focused, onFocus, onRemove }) => (
  <div
    className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-black/4 ${focused ? 'bg-black/6' : ''}`}
  >
    <span
      className="h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
    <span
      className={`min-w-0 flex-1 cursor-pointer truncate text-sm transition-colors hover:text-[#3e82f7] ${focused ? 'font-medium text-[#3e82f7]' : 'text-gray-600'}`}
      onClick={() => onFocus(file)}
      title="Zoom to track"
    >
      {file.data.name || file.fileName}
    </span>
    <button
      className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-gray-300 opacity-0 transition-all group-hover:opacity-100 hover:bg-red-50 hover:text-red-500"
      onClick={() => onRemove(file.id)}
      title="Remove"
    >
      <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  </div>
));

const Spinner: React.FC<{ className?: string }> = ({ className = 'h-5 w-5' }) => (
  <svg className={`animate-spin text-[#3e82f7] ${className}`} viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

const GpxViewer: React.FC = () => {
  const [files, setFiles] = useState<LoadedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusBounds, setFocusBounds] = useState<L.LatLngBounds | null>(null);
  const [boundsVersion, setBoundsVersion] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [mapStyle, setMapStyle] = useState<(typeof MAP_STYLES)[number]>(MAP_STYLES[0]);
  const [focusedFileId, setFocusedFileId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAbout, setShowAbout] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const nextId = useRef(0);

  const mapBounds = useMemo(() => {
    const all = files.map(fileBounds).filter((b): b is L.LatLngBounds => b !== null);
    if (all.length === 0) return null;
    return all.reduce((acc, b) => acc.extend(b.getSouthWest()).extend(b.getNorthEast()), new L.LatLngBounds(all[0].getSouthWest(), all[0].getNorthEast()));
  }, [files]);

  // Pre-compute polyline positions
  const filePositions = useMemo(() =>
    files.map(file => ({
      id: file.id,
      tracks: file.data.tracks
        .filter(t => t.points.length > 0)
        .map(t => t.points.map(p => [p.lat, p.lng] as [number, number])),
    })),
    [files]
  );

  const processFiles = async (fileList: File[]) => {
    const gpxFiles = fileList.filter(f => f.name.endsWith('.gpx'));
    if (gpxFiles.length === 0) return;

    setLoading(true);
    try {
      const newEntries: LoadedFile[] = [];
      const failed: string[] = [];
      for (const file of gpxFiles) {
        try {
          const content = await file.text();
          const data = await parseGPX(content);
          newEntries.push({ id: String(++nextId.current), fileName: file.name, data });
        } catch {
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
    } finally {
      setLoading(false);
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

  const removeFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
    setFocusedFileId(prev => prev === id ? null : prev);
  }, []);

  const focusFile = useCallback((file: LoadedFile) => {
    setFocusedFileId(prev => {
      if (prev === file.id) {
        // Deselect
        return null;
      }
      const bounds = fileBounds(file);
      if (bounds) {
        setFocusBounds(bounds);
        setBoundsVersion(v => v + 1);
      }
      return file.id;
    });
  }, []);

  const clearFocus = useCallback(() => {
    setFocusedFileId(null);
  }, []);

  const clearAll = () => {
    setFiles([]);
    setFocusedFileId(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const filteredFiles = useMemo(() => {
    if (!searchQuery) return files;
    const q = searchQuery.toLowerCase();
    return files.filter(f =>
      (f.data.name || f.fileName).toLowerCase().includes(q)
    );
  }, [files, searchQuery]);

  // Format errors for toast
  const errorDisplay = useMemo(() => {
    if (errors.length <= 3) return { shown: errors, extra: 0 };
    return { shown: errors.slice(0, 3), extra: errors.length - 3 };
  }, [errors]);

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
          <MapClickHandler onMapClick={clearFocus} />

          {files.map((file, fileIdx) => {
            const positions = filePositions.find(fp => fp.id === file.id);
            if (!positions) return null;
            const isFocused = focusedFileId === file.id;
            const hasFocus = focusedFileId !== null;
            return positions.tracks.map((pos, trackIdx) => (
              <Polyline
                key={`${file.id}-t${trackIdx}`}
                positions={pos}
                color={TRACK_COLORS[fileIdx % TRACK_COLORS.length]}
                weight={hasFocus ? (isFocused ? 5 : 3) : 4}
                opacity={hasFocus ? (isFocused ? 1 : 0.4) : 0.8}
              />
            ));
          })}

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

      {/* Loading spinner — first load */}
      {loading && files.length === 0 && !dragging && (
        <div className="pointer-events-none absolute inset-0 z-[1000] flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-white/90 px-10 py-8 shadow-xl backdrop-blur-lg">
            <Spinner className="h-8 w-8" />
            <span className="text-sm font-medium text-gray-400">Loading tracks…</span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {files.length === 0 && !dragging && !loading && (
        <div className="pointer-events-none absolute inset-0 z-[1000] flex items-center justify-center">
          <div
            className="pointer-events-auto group cursor-pointer rounded-2xl bg-white/90 px-10 py-8 shadow-xl backdrop-blur-lg transition-all hover:shadow-2xl hover:bg-white/95"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="flex flex-col items-center gap-3 text-gray-400 transition-colors group-hover:text-[#3e82f7]">
              <div className="mb-1 text-xl font-semibold tracking-tight text-gray-700">Drift</div>
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
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold tracking-tight text-gray-700">Drift</span>
              <button
                className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-gray-300 transition-colors hover:text-[#3e82f7]"
                onClick={() => setShowAbout(true)}
                title="About Drift"
              >
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              </button>
              {loading && <Spinner className="h-3.5 w-3.5" />}
            </div>
            <div className="flex items-center gap-1">
              <button
                className="cursor-pointer rounded-lg border-none bg-transparent px-2 py-1 text-xs text-[#3e82f7] transition-colors hover:bg-[#3e82f7]/10"
                onClick={() => fileInputRef.current?.click()}
                title="Add more files"
              >
                + Add
              </button>
              <span className="text-gray-200">|</span>
              <button
                className="cursor-pointer rounded-lg border-none bg-transparent px-2 py-1 text-xs text-gray-400 transition-colors hover:text-red-500 hover:bg-red-50"
                onClick={clearAll}
                title="Clear all"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Search (visible when > 5 files) */}
          {files.length > 5 && (
            <div className="px-2 pb-1">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search files…"
                className="w-full rounded-lg border border-gray-200 bg-white/80 px-2.5 py-1 text-xs text-gray-600 outline-none placeholder:text-gray-300 focus:border-[#3e82f7]/40"
              />
            </div>
          )}

          {/* File list */}
          <div className="flex flex-col gap-0.5 overflow-y-auto px-1.5 pb-2">
            {filteredFiles.map(file => {
              const globalIdx = files.indexOf(file);
              return (
                <FileListItem
                  key={file.id}
                  file={file}
                  color={TRACK_COLORS[globalIdx % TRACK_COLORS.length]}
                  focused={focusedFileId === file.id}
                  onFocus={focusFile}
                  onRemove={removeFile}
                />
              );
            })}
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

      {/* About modal */}
      {showAbout && (
        <div
          className="absolute inset-0 z-[1002] flex items-center justify-center bg-black/30 backdrop-blur-xs"
          onClick={() => setShowAbout(false)}
        >
          <div
            className="w-72 rounded-2xl bg-white/95 px-8 py-7 shadow-2xl backdrop-blur-lg"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="text-2xl font-semibold tracking-tight text-gray-800">Drift</div>
              <p className="text-sm leading-relaxed text-gray-400">
                Drop your GPX files and see where you've been. Tracks, routes, waypoints — all on one map.
              </p>
              <div className="flex flex-col gap-1 text-xs text-gray-300">
                <span>v1.0.0</span>
                <span>by w2vasia</span>
              </div>
              <button
                className="mt-1 cursor-pointer rounded-lg border-none bg-[#3e82f7]/10 px-4 py-1.5 text-xs font-medium text-[#3e82f7] transition-colors hover:bg-[#3e82f7]/20"
                onClick={() => setShowAbout(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error toast */}
      {errors.length > 0 && (
        <div className="absolute bottom-4 left-1/2 z-[1000] max-w-md -translate-x-1/2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white shadow-lg">
          <div className="max-h-24 overflow-y-auto">
            {errorDisplay.shown.map((e, i) => (
              <div key={i}>{e}</div>
            ))}
            {errorDisplay.extra > 0 && (
              <div className="mt-1 text-red-200">and {errorDisplay.extra} more</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default GpxViewer;
