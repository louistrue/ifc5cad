# IFChili

A browser-based 3D CAD application for authoring IFC5 (IFCX) building models.

![Screenshot](./screenshots/screenshot.png)

## Overview

IFChili is an open-source, browser-based CAD application for creating and editing building information models following the [buildingSMART IFC5 standard](https://github.com/buildingSMART/IFC5-development). Built on [Chili3D](https://github.com/xiangechen/chili3d), it compiles OpenCascade (OCCT) to WebAssembly and integrates with Three.js for near-native 3D modeling performance — all in the browser, with no local installation required.

## Features

### IFC5 Authoring

- **IFCX Document Model**: Entity-Component system aligned with the buildingSMART IFC5 TypeSpec standard
- **Spatial Hierarchy**: Automatic wrapping of geometry in standard IFC structure (Project / Site / Building / Storey)
- **IFC Spatial Panel**: Visual hierarchy display with inline editing of level names
- **Schema Registry**: Bundled schemas including Swiss BIM standards (SIA 416, eBKP-H, KBOB LCA, Building Permit)
- **IFCX Export**: Serialize documents to the IFCX format with default IFC class assignment and USD mesh tessellation

### 3D Modeling Tools

- **Basic Shapes**: Boxes, cylinders, cones, spheres, pyramids
- **2D Sketching**: Lines, arcs, circles, ellipses, rectangles, polygons, Bezier curves
- **Boolean Operations**: Union, difference, intersection
- **Advanced Operations**: Extrusion, revolution, sweep, loft, offset surfaces, sections
- **Editing**: Chamfer, fillet, trim, break, split, move, rotate, mirror

### Snapping and Tracking

- Object snapping to geometric features (points, edges, faces)
- Workplane snapping for accurate planar operations
- Axis tracking for precise alignment
- Automatic feature point detection with visual tracking guides

### Measurement

- Angle and length measurement
- Sum of length, area, and volume calculations

### Document Management

- Create, open, and save documents
- Full undo/redo stack with transaction history
- Import/export of STEP, IGES, and BREP formats

### User Interface

- Office-style ribbon interface with contextual command organization
- Hierarchical assembly management
- Dynamic workplane support
- 3D viewport with camera controls and position recall
- Multi-language support (English and Chinese)

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript |
| 3D Rendering | Three.js |
| Geometry Kernel | OpenCascade (WebAssembly) |
| Bundler | Rspack |
| Testing | Rstest + Happy-DOM |
| Linting/Formatting | Biome |
| Deployment | Vercel / Docker + Nginx |

## Project Structure

```
packages/
  chili-core/       Core interfaces, document model, shapes, materials
  chili/            CAD commands and operations (66+ commands)
  chili-three/      Three.js rendering integration
  chili-wasm/       OpenCascade WebAssembly bindings
  chili-ui/         UI components (panels, ribbon, dialogs)
  chili-builder/    Application builder and dependency injection
  chili-controls/   User input and interaction
  chili-geo/        Geometry utilities
  chili-vis/        Visualization layer
  chili-i18n/       Internationalization
  chili-storage/    Document persistence
  chili-web/        Web application entry point
  ifcx-core/        IFCX document model, serializer, and bridge
  ifcx-schemas/     Schema registry with bundled BIM standards
cpp/                OpenCascade WebAssembly module (C++/CMake)
```

## Getting Started

### Prerequisites

- Node.js >= 22
- npm

### Installation

```bash
git clone https://github.com/louistrue/ifc5cad.git
cd ifc5cad
npm install
```

### Development

```bash
npm run dev       # Start dev server at http://localhost:8080
```

### Building

```bash
npm run build     # Production build
```

### Building WebAssembly

To rebuild the OpenCascade WebAssembly module from source:

```bash
npm run setup:wasm   # Install WASM build dependencies (first time only)
npm run build:wasm   # Build the WebAssembly module
```

### Testing

```bash
npm run test      # Run all tests
npm run testc     # Run tests with coverage
```

### Code Quality

```bash
npm run check     # Biome linting and auto-fix
npm run format    # Format all code (Biome + clang-format)
```

## Development Status

**Early Development** — IFChili is in active alpha development.

- Core CAD modeling features are functional (inherited from Chili3D)
- IFC5 authoring support is at Phase 0: spatial hierarchy, document model, and basic IFCX serialization
- APIs may undergo breaking changes
- Documentation is being progressively developed

## Acknowledgments

IFChili is built on [Chili3D](https://github.com/xiangechen/chili3d) by [xiangechen](https://github.com/xiangechen). The 3D CAD engine, modeling tools, and application framework are from the upstream Chili3D project.

## Contributing

Contributions are welcome — code, bug reports, or feedback. Please submit pull requests or open issues.

## License

Distributed under the GNU Affero General Public License v3.0 (AGPL-3.0). The C++ WebAssembly code is licensed under LGPL-3.0. See [LICENSE](LICENSE) for details.
