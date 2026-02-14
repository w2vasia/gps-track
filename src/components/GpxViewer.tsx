import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, ScaleControl, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { parseGPX, GPXData } from '../utils/gpxParser';
import { WorkerPool } from '../utils/workerPool';
import { computeTrackStats, computeElevationProfile, type TrackStats, type ElevationPoint } from '../utils/trackStats';

const TRACK_COLORS = ['#3e82f7', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'] as const;
const PICKER_COLORS = [...TRACK_COLORS, '#f97316', '#14b8a6', '#a855f7', '#e11d48'] as const;

const markerIcon = (color: string) => L.divIcon({
  className: '',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
  html: `<div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>`,
});
const startIcon = markerIcon('#10b981');
const endIcon = markerIcon('#ef4444');

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
  visible: boolean;
  color: string;
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
  focused: boolean;
  onFocus: (file: LoadedFile) => void;
  onRemove: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onOpenColorPicker: (id: string) => void;
}

const ColorPicker: React.FC<{ name: string; current: string; onChange: (color: string) => void; onClose: () => void }> = ({ name, current, onChange, onClose }) => (
  <div className="absolute inset-0 z-[1002] flex items-center justify-center bg-black/20 backdrop-blur-xs" onClick={onClose}>
    <div className="rounded-xl bg-white/95 px-5 py-4 shadow-2xl backdrop-blur-lg" onClick={e => e.stopPropagation()}>
      <div className="relative mb-3 max-w-56 overflow-hidden whitespace-nowrap text-center text-sm font-medium text-gray-600" style={{ maskImage: 'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)' }}>{name}</div>
      <div className="grid grid-cols-6 gap-2">
        {PICKER_COLORS.map(c => (
          <button
            key={c}
            className="h-7 w-7 cursor-pointer rounded-full border-none p-0 transition-transform hover:scale-110"
            style={{ backgroundColor: c, boxShadow: c === current ? '0 0 0 2px white, 0 0 0 4px #374151' : 'none' }}
            onClick={() => { onChange(c); onClose(); }}
          />
        ))}
      </div>
    </div>
  </div>
);

const FileListItem = React.memo<FileListItemProps>(({ file, focused, onFocus, onRemove, onToggleVisibility, onOpenColorPicker }) => (
    <div
      className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-black/4 ${focused ? 'bg-black/6' : ''} ${!file.visible ? 'opacity-40' : ''}`}
    >
      <span
        className="block h-3 w-3 shrink-0 cursor-pointer rounded-full transition-transform hover:scale-125"
        style={{ backgroundColor: file.color }}
        onClick={() => onOpenColorPicker(file.id)}
        title="Change color"
      />
      <span
        className={`min-w-0 flex-1 cursor-pointer truncate text-sm transition-colors hover:text-[#3e82f7] ${focused ? 'font-medium text-[#3e82f7]' : 'text-gray-600'}`}
        onClick={() => onFocus(file)}
        title="Zoom to track"
      >
        {file.data.name || file.fileName}
      </span>
      <button
        className={`flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent transition-all ${file.visible ? 'text-gray-300 opacity-0 group-hover:opacity-100 hover:text-gray-500' : 'text-gray-400 opacity-100 hover:text-gray-600'}`}
        onClick={() => onToggleVisibility(file.id)}
        title={file.visible ? 'Hide track' : 'Show track'}
      >
        {file.visible ? (
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        ) : (
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        )}
      </button>
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

const formatDuration = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}` : `${m}m`;
};

let pool: WorkerPool | null = null;
const getPool = (): WorkerPool => {
  if (!pool) pool = new WorkerPool();
  return pool;
};

const parseWithWorker = async (content: string): Promise<GPXData> => {
  if (typeof Worker === 'undefined') return parseGPX(content);
  try {
    return await getPool().parse(content, 'gpx');
  } catch {
    return parseGPX(content);
  }
};

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
  const [colorPickerFileId, setColorPickerFileId] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState<{ lat: number; lng: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const nextId = useRef(0);
  const polylineClicked = useRef(false);

  useEffect(() => () => { pool?.terminate(); pool = null; }, []);

  const mapBounds = useMemo(() => {
    const all = files.filter(f => f.visible).map(fileBounds).filter((b): b is L.LatLngBounds => b !== null);
    if (all.length === 0) return null;
    return all.reduce((acc, b) => acc.extend(b.getSouthWest()).extend(b.getNorthEast()), new L.LatLngBounds(all[0].getSouthWest(), all[0].getNorthEast()));
  }, [files]);

  // Pre-compute polyline positions + start/end points
  const filePositions = useMemo(() =>
    files.map(file => ({
      id: file.id,
      tracks: file.data.tracks
        .filter(t => t.points.length > 0)
        .map(t => {
          const positions = t.points.map(p => [p.lat, p.lng] as [number, number]);
          const start = positions[0];
          const end = positions[positions.length - 1];
          const isLoop = Math.abs(start[0] - end[0]) < 0.0005 && Math.abs(start[1] - end[1]) < 0.0005;
          return { positions, start, end, isLoop };
        }),
    })),
    [files]
  );

  const processFiles = async (fileList: File[]) => {
    const gpxFiles = fileList.filter(f => f.name.endsWith('.gpx'));
    if (gpxFiles.length === 0) return;

    setLoading(true);
    try {
      const contents = await Promise.all(gpxFiles.map(f => f.text()));
      const results = await Promise.allSettled(contents.map(c => parseWithWorker(c)));

      const newEntries: Omit<LoadedFile, 'color'>[] = [];
      const failed: string[] = [];
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          newEntries.push({ id: String(++nextId.current), fileName: gpxFiles[i].name, data: r.value, visible: true });
        } else {
          failed.push(gpxFiles[i].name);
        }
      });

      if (failed.length > 0) {
        setErrors(failed.map(n => `Failed to parse ${n}`));
        setTimeout(() => setErrors([]), 4000);
      }
      if (newEntries.length > 0) {
        setFiles(prev => [...prev, ...newEntries.map((e, i) => ({ ...e, color: TRACK_COLORS[(prev.length + i) % TRACK_COLORS.length] }))]);
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
    setFiles(prev => {
      const next = prev.filter(f => f.id !== id);
      if (next.length === 0) setShowPanel(false);
      return next;
    });
    setFocusedFileId(prev => prev === id ? null : prev);
  }, []);

  const toggleVisibility = useCallback((id: string) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, visible: !f.visible } : f));
  }, []);

  const changeColor = useCallback((id: string, color: string) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, color } : f));
  }, []);

  const openColorPicker = useCallback((id: string) => {
    setColorPickerFileId(id);
  }, []);

  const focusFile = useCallback((file: LoadedFile) => {
    setFocusedFileId(prev => prev === file.id ? null : file.id);
    setHoveredPoint(null);
    const bounds = fileBounds(file);
    if (bounds) {
      setFocusBounds(bounds);
      setBoundsVersion(v => v + 1);
    }
    setShowPanel(true);
  }, []);

  const clearFocus = useCallback(() => {
    if (polylineClicked.current) { polylineClicked.current = false; return; }
    setFocusedFileId(null);
    setHoveredPoint(null);
  }, []);

  const clearAll = () => {
    setFiles([]);
    setFocusedFileId(null);
    setShowPanel(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const filteredFiles = useMemo(() => {
    if (!searchQuery) return files;
    const q = searchQuery.toLowerCase();
    return files.filter(f =>
      (f.data.name || f.fileName).toLowerCase().includes(q)
    );
  }, [files, searchQuery]);

  const focusedFile = useMemo(() => files.find(f => f.id === focusedFileId) ?? null, [files, focusedFileId]);

  const focusedStats = useMemo((): { stats: TrackStats; elevation: ElevationPoint[] } | null => {
    if (!focusedFile) return null;
    const tracks = focusedFile.data.tracks;
    if (tracks.length === 0) return null;

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

      const segProfile = computeElevationProfile(track);
      for (const p of segProfile) {
        allElevation.push({ distance: p.distance + cumulativeDistance / 1000, elevation: p.elevation, lat: p.lat, lng: p.lng });
      }
      cumulativeDistance += s.distance;
    }

    const avgSpeed = totalDuration && totalDuration > 0 ? distance / totalDuration : null;

    return {
      stats: { distance, elevGain, elevLoss, duration: totalDuration, avgSpeed, maxEle, minEle },
      elevation: allElevation,
    };
  }, [focusedFile]);

  // Panel visibility: open when toggle is on, has chart when focused track has elevation data
  const panelHasChart = showPanel && focusedStats != null && focusedStats.elevation.length > 0;
  const panelVisible = showPanel;
  const panelClass = panelHasChart ? 'elevation-panel-chart' : panelVisible ? 'elevation-panel-stats' : '';

  // Format errors for toast
  const errorDisplay = useMemo(() => {
    if (errors.length <= 3) return { shown: errors, extra: 0 };
    return { shown: errors.slice(0, 3), extra: errors.length - 3 };
  }, [errors]);

  return (
    <div
      className={`relative h-screen w-screen ${panelClass}`}
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

          {files.filter(f => f.visible).map(file => {
            const fp = filePositions.find(f => f.id === file.id);
            if (!fp) return null;
            const isFocused = focusedFileId === file.id;
            const hasFocus = focusedFileId !== null;
            const opacity = hasFocus ? (isFocused ? 1 : 0.4) : 0.8;
            return fp.tracks.map((track, trackIdx) => {
              const startPt = file.data.tracks[trackIdx]?.points[0];
              const endPt = file.data.tracks[trackIdx]?.points[file.data.tracks[trackIdx].points.length - 1];
              return (
                <React.Fragment key={`${file.id}-t${trackIdx}`}>
                  <Polyline
                    positions={track.positions}
                    pathOptions={{ color: file.color, weight: hasFocus ? (isFocused ? 5 : 3) : 4, opacity }}
                    eventHandlers={{ click: () => { polylineClicked.current = true; focusFile(file); } }}
                  />
                  <Marker position={track.start} icon={startIcon} opacity={opacity}>
                    <Popup>
                      <strong>Start</strong>
                      {startPt?.ele != null && <div className="popup-detail">Elev: {Math.round(startPt.ele)}m</div>}
                      {startPt?.time && <div className="popup-detail">{startPt.time.toLocaleString()}</div>}
                    </Popup>
                  </Marker>
                  {!track.isLoop && (
                    <Marker position={track.end} icon={endIcon} opacity={opacity}>
                      <Popup>
                        <strong>End</strong>
                        {endPt?.ele != null && <div className="popup-detail">Elev: {Math.round(endPt.ele)}m</div>}
                        {endPt?.time && <div className="popup-detail">{endPt.time.toLocaleString()}</div>}
                      </Popup>
                    </Marker>
                  )}
                </React.Fragment>
              );
            });
          })}

          {files.filter(f => f.visible).map(file =>
            file.data.waypoints?.map((wp, i) => (
              <Marker key={`${file.id}-wp${i}`} position={[wp.lat, wp.lng]}>
                <Popup>
                  <div>
                    <strong>{wp.name || `Waypoint ${i + 1}`}</strong>
                    <div className="popup-detail">{wp.lat.toFixed(6)}, {wp.lng.toFixed(6)}</div>
                    {wp.ele != null && <div className="popup-detail">Elev: {Math.round(wp.ele)}m</div>}
                    {wp.time && <div className="popup-detail">{wp.time.toLocaleString()}</div>}
                  </div>
                </Popup>
              </Marker>
            ))
          )}

          {panelHasChart && hoveredPoint && (
            <CircleMarker
              center={[hoveredPoint.lat, hoveredPoint.lng]}
              radius={5}
              pathOptions={{ color: 'white', fillColor: focusedFile?.color || '#3e82f7', fillOpacity: 1, weight: 2 }}
            />
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
                className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-gray-400 transition-colors hover:text-[#3e82f7]"
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
            {filteredFiles.map(file => (
              <FileListItem
                key={file.id}
                file={file}
                focused={focusedFileId === file.id}
                onFocus={focusFile}
                onRemove={removeFile}
                onToggleVisibility={toggleVisibility}
                onOpenColorPicker={openColorPicker}
              />
            ))}
          </div>
        </div>
      )}

      {/* Map style switcher */}
      <div className={`absolute right-3 z-[1000] flex items-center gap-1 rounded-full bg-white/90 p-1 shadow-lg backdrop-blur-lg transition-all ${panelHasChart ? 'bottom-[195px]' : panelVisible ? 'bottom-[50px]' : 'bottom-3'}`}>
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
        {files.length > 0 && (
          <>
            <div className="mx-0.5 h-4 w-px bg-gray-200" />
            <button
              className={`cursor-pointer rounded-full border-none p-1.5 transition-all ${showPanel ? 'bg-[#3e82f7] text-white shadow-sm' : 'bg-transparent text-gray-500 hover:text-gray-700'}`}
              onClick={() => setShowPanel(p => !p)}
              title="Elevation profile"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 6 13 14 9 8 2 18" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Color picker modal */}
      {colorPickerFileId && (() => {
        const target = files.find(f => f.id === colorPickerFileId);
        if (!target) return null;
        return (
          <ColorPicker
            name={target.data.name || target.fileName}
            current={target.color}
            onChange={c => changeColor(colorPickerFileId, c)}
            onClose={() => setColorPickerFileId(null)}
          />
        );
      })()}

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
              <p className="text-sm leading-relaxed text-gray-500">
                Drop your GPX files and see where you've been. Tracks, routes, waypoints — all on one map.
              </p>
              <div className="flex flex-col gap-1 text-xs text-gray-400">
                <span>v1.2.0</span>
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

      {/* Elevation panel */}
      {panelVisible && (
        <div className="absolute right-0 bottom-0 left-0 z-[1000] bg-white/95 shadow-[0_-2px_12px_rgba(0,0,0,0.1)] backdrop-blur-lg">
          {/* Stats bar */}
          <div className="flex items-center gap-4 border-b border-gray-100 px-4 py-2">
            {focusedStats ? (
              <>
                <div className="min-w-0 flex-1 truncate text-xs font-medium text-gray-600">
                  {focusedFile?.data.name || focusedFile?.fileName}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
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
              </>
            ) : (
              <div className="flex-1 text-xs text-gray-400">Click a track to see elevation profile</div>
            )}
            <button
              className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-gray-400 transition-colors hover:text-gray-600"
              onClick={() => setShowPanel(false)}
              title="Close panel"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Elevation chart */}
          {panelHasChart && (
            <div className="h-[150px] w-full px-2 py-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={focusedStats!.elevation}
                  margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
                  onMouseMove={(state) => {
                    if (state && 'activeTooltipIndex' in state && state.activeTooltipIndex != null) {
                      const pt = focusedStats!.elevation[state.activeTooltipIndex as number];
                      if (pt) setHoveredPoint({ lat: pt.lat, lng: pt.lng });
                    }
                  }}
                  onMouseLeave={() => setHoveredPoint(null)}
                >
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
                    formatter={(value) => [`${Math.round(Number(value))}m`, 'Elevation']}
                    labelFormatter={(label) => `${Number(label).toFixed(2)} km`}
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

      {/* Error toast */}
      {errors.length > 0 && (
        <div className={`absolute left-1/2 z-[1000] max-w-md -translate-x-1/2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white shadow-lg ${panelHasChart ? 'bottom-[200px]' : panelVisible ? 'bottom-[55px]' : 'bottom-4'}`}>
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
