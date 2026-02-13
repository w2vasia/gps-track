# GPX Track Viewer

A web application built with React, TypeScript, and Leaflet that allows users to upload GPX files and visualize GPS tracks on an interactive map.

## Overview

The GPX Track Viewer is a client-side application that enables users to:
- Upload GPX (GPS Exchange Format) files
- Visualize GPS tracks as colored lines on an interactive map
- View waypoints as markers with detailed information
- Automatically adjust map view to fit the uploaded track

The application uses Leaflet as the mapping library with OpenStreetMap as the base layer. It includes responsive design with Bootstrap CSS for a clean user interface.

## Architecture

The project follows a modern React architecture using TypeScript and Vite as the build tool:

- **Frontend Framework**: React with TypeScript
- **Mapping Library**: Leaflet via react-leaflet
- **Styling**: Bootstrap CSS with custom CSS
- **Build Tool**: Vite
- **GPX Parsing**: Both @mapbox/togeojson library (with fallback) and custom JavaScript parser

### Key Components

- `App.tsx`: Main application component with header
- `GpxViewer.tsx`: Core component handling file upload, parsing, and map display
- `gpxParser.ts`: Utility for parsing GPX files with fallback implementation
- `App.css`: Custom styles for the application

## Building and Running

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### Installation
```bash
npm install
```

### Development Server
```bash
npm run dev
```
The application will start on `http://localhost:3000`

### Build for Production
```bash
npm run build
```
Builds the application to the `dist` directory

### Preview Production Build
```bash
npm run preview
```
Serves the production build locally for testing

## Features

1. **File Upload**: Simple file input for GPX files
2. **Track Visualization**: Displays GPS tracks as blue polylines on the map
3. **Waypoint Markers**: Shows waypoints as interactive markers with popups
4. **Responsive Design**: Works on various screen sizes
5. **Auto-Zoom**: Automatically adjusts map view to fit the entire track
6. **Metadata Display**: Shows track name and file information
7. **Error Handling**: Graceful handling of invalid GPX files

## GPX Parsing

The application uses a robust two-tier approach for GPX parsing:

1. **Primary**: Attempts to use `@mapbox/togeojson` library for parsing
2. **Fallback**: Custom JavaScript XML parser for compatibility

This ensures compatibility even if the external library has export issues in different environments.

## Development Conventions

- **Type Safety**: Extensive use of TypeScript interfaces for data structures
- **Component Structure**: Functional components with React hooks
- **Error Handling**: Try/catch blocks with user-friendly error messages
- **Asynchronous Operations**: Proper handling of async file reading and parsing
- **Responsive UI**: Bootstrap utility classes for responsive layouts

## File Structure

```
src/
├── components/          # React components
│   └── GpxViewer.tsx   # Main GPX viewer component
├── styles/             # CSS styles
│   └── App.css         # Application styles
├── types/              # TypeScript type definitions
├── utils/              # Utility functions
│   └── gpxParser.ts    # GPX parsing logic
├── App.tsx             # Main application component
└── main.tsx            # React entry point
```

## Dependencies

### Runtime Dependencies
- `react` & `react-dom`: UI library
- `leaflet` & `react-leaflet`: Interactive mapping
- `@mapbox/togeojson`: GPX to GeoJSON conversion
- `bootstrap`: CSS framework
- `xmldom`: XML parsing (fallback)

### Dev Dependencies
- `typescript`: Type checking
- `vite`: Build tool and dev server
- `@vitejs/plugin-react`: React plugin for Vite
- Type definitions for all major libraries

## Usage

1. Start the application with `npm run dev`
2. Navigate to `http://localhost:3000`
3. Click "Choose File" and select a GPX file
4. The track will appear on the map automatically
5. Waypoints are displayed as markers that can be clicked for details
6. Use "Clear Data" button to remove the current track

## Testing

The application can be tested by uploading the included `test-track.gpx` file or any valid GPX file containing track points and/or waypoints.