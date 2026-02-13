# GPX Track Viewer

A web application that allows users to upload GPX files and visualize GPS tracks on an interactive map.

## Features

- 📁 Upload GPX files with a simple interface
- 🗺️ Display GPS tracks on an interactive Leaflet map
- 📍 Show waypoints as clickable markers with detailed information
- 📏 Automatic map zooming to fit the entire track
- 🎨 Responsive design with Bootstrap styling
- 🛡️ Robust GPX parsing with fallback support

## Technologies Used

- **React** - JavaScript library for building user interfaces
- **TypeScript** - Typed superset of JavaScript
- **Leaflet** - Open-source JavaScript library for mobile-friendly interactive maps
- **React-Leaflet** - React components for Leaflet maps
- **Bootstrap** - CSS framework for responsive design
- **Vite** - Fast build tool and development server
- **@mapbox/togeojson** - Convert GPX to GeoJSON (with custom fallback parser)

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
```

2. Navigate to the project directory:
```bash
cd gpx-track-viewer
```

3. Install dependencies:
```bash
npm install
```

### Running the Application

1. Start the development server:
```bash
npm run dev
```

2. Open your browser and navigate to `http://localhost:3000`

### Building for Production

To create a production build:
```bash
npm run build
```

To preview the production build locally:
```bash
npm run preview
```

## Usage

1. Click the "Choose File" button or drag and drop a GPX file
2. The GPS track will be displayed on the map as a blue line
3. Waypoints will appear as markers that can be clicked for more information
4. The map will automatically adjust to show the entire track
5. Use the "Clear Data" button to remove the current track and load a new one

## Project Structure

```
src/
├── components/
│   └── GpxViewer.tsx    # Main GPX viewer component
├── styles/
│   └── App.css          # Custom styles
├── utils/
│   └── gpxParser.ts     # GPX parsing logic with fallback
├── App.tsx              # Main application component
└── main.tsx             # React entry point
```

## GPX Parsing

The application includes a two-tier approach to GPX parsing:

1. **Primary method**: Uses the `@mapbox/togeojson` library for conversion
2. **Fallback method**: Custom JavaScript XML parser for compatibility

This ensures that GPX files can be parsed even in environments where the external library might have issues.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the ISC License.

## Acknowledgments

- [OpenStreetMap](https://www.openstreetmap.org/) - Map data
- [Leaflet](https://leafletjs.com/) - Interactive maps
- [Mapbox](https://github.com/mapbox/togeojson) - GPX to GeoJSON conversion
- [React](https://reactjs.org/) - Component library