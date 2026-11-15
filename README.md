# GIS-Based Urban Tree Mapping & Green-Cover Assessment System

An end-to-end full-stack geospatial platform designed to calculate urban green cover, compute satellite-based **Normalized Difference Vegetation Index (NDVI)** using **Sentinel-2 Surface Reflectance** imagery via **Google Earth Engine (GEE)**, persist spatial boundaries using **Supabase PostGIS**, and generate deterministic **environmental rule-based insights** to combat the Urban Heat Island (UHI) effect.

---

## 🏛️ System Architecture & Directory Layout

The codebase follows a **feature-sliced, modular architecture** that separates the **FastAPI backend** and the **Vanilla/Leaflet frontend**, isolating domain logic, API schemas, and GIS controls into clear feature modules.

```text
urban-tree-mapping/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                     # App factory, CORS middleware, API router mounts, health check
│   │   ├── config.py                   # Pydantic BaseSettings loading .env
│   │   ├── core/                       # Shared backend core
│   │   │   ├── __init__.py
│   │   │   └── database.py             # Supabase client initialization & connection logic
│   │   └── features/                   # FEATURE-BASED MODULES
│   │       ├── analyze/                # Feature 1: Real-time Sentinel-2 & NDVI Processing
│   │       │   ├── __init__.py
│   │       │   ├── router.py           # POST /api/analyze endpoint
│   │       │   ├── schemas.py          # Request/response validation schemas for polygon & NDVI stats
│   │       │   └── service.py          # Google Earth Engine (GEE) query, cloud-mask, and NDVI math
│   │       ├── history/                # Feature 2: PostGIS History & Saved Analysis Runs
│   │       │   ├── __init__.py
│   │       │   ├── router.py           # GET /api/history and GET /api/history/{id}
│   │       │   ├── schemas.py          # History listing and detail schemas
│   │       │   └── service.py          # Supabase PostGIS spatial query operations
│   │       └── insights/               # Feature 3: Rule-Based Environmental Insights
│   │           ├── __init__.py
│   │           ├── service.py          # Deterministic rules (green-deficit, canopy health, recommendations)
│   │           └── schemas.py          # Insight output schemas
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── index.html                      # Single-page application entry point
│   ├── package.json                    # Frontend dependencies & Vite bundler scripts
│   ├── styles/                         # Global styling
│   │   └── main.css                    # Dark glassmorphic GIS dashboard design
│   └── src/                            # FEATURE-BASED MODULES
│       ├── main.js                     # App bootstrap and orchestrator
│       ├── api/                        # Centralized backend API client
│       │   └── apiClient.js            # fetch wrappers for /analyze, /history, /health
│       └── features/
│           ├── map/                    # Feature 1: Global Map & Polygon Drawing Tool
│           │   ├── mapManager.js       # Base map initialization (Leaflet dark & satellite basemaps)
│           │   └── drawTool.js         # Polygon drawing controls and GeoJSON extraction
│           ├── layers/                 # Feature 2: Satellite Overlay & Tile Management
│           │   ├── ndviLayer.js        # GEE dynamic XYZ raster layer renderer
│           │   └── legend.js           # Vegetation density color legend (Red -> Dark Green)
│           ├── dashboard/              # Feature 3: Analysis Statistics Display
│           │   └── statsPanel.js       # Total area, green cover %, mean NDVI, acquisition date
│           ├── insights/               # Feature 4: Green-Deficit Recommendations
│           │   └── insightsCard.js     # Rule-based insight cards and warning banners
│           └── history/                # Feature 5: Analysis History Drawer
│               └── historyDrawer.js    # Sidebar list of past runs, item click-to-recall map bounds
└── README.md
```

---

## 🚀 Getting Started

### 1. Prerequisites
- **Python**: 3.10+
- **Node.js**: 18+ (optional, for running Vite dev server; or use any static HTTP server)

---

### 2. Backend Setup

1. **Navigate to the backend directory**:
   ```bash
   cd backend
   ```

2. **Create and activate a virtual environment**:
   ```bash
   # Windows (PowerShell)
   python -m venv venv
   .\venv\Scripts\Activate.ps1

   # Linux / macOS
   python3 -m venv venv
   source venv/bin/activate
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure Environment Variables**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your Supabase and Google Earth Engine credentials:
   ```ini
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_KEY=your-supabase-service-role-key
   GEE_SERVICE_ACCOUNT=your-gee-sa@project.iam.gserviceaccount.com
   GEE_PRIVATE_KEY_FILE=credentials/gee-key.json
   ```
   > **Note on Mock/Simulation Mode**: If GEE or Supabase credentials are not provided, the backend automatically operates in **development fallback mode** with realistic simulation values and an in-memory history cache, allowing full UI testing without external blockers.

5. **Run the FastAPI Server**:
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```
   The interactive Swagger documentation will be accessible at:
   - **Swagger UI**: [http://localhost:8000/docs](http://localhost:8000/docs)
   - **ReDoc**: [http://localhost:8000/redoc](http://localhost:8000/redoc)

---

### 3. Frontend Setup

1. **Navigate to the frontend directory**:
   ```bash
   cd ../frontend
   ```

2. **Run using Vite** (Recommended):
   ```bash
   npm install
   npm run dev
   ```
   *Or launch directly using any local static web server (e.g., Python `http.server` or VS Code Live Server):*
   ```bash
   python -m http.server 3000
   ```

3. Open your browser to `http://localhost:5173` (or `http://localhost:3000`).

---

## 🛰️ Core Features & Data Flow

### 1. Real-Time Sentinel-2 & NDVI Processing (`backend/app/features/analyze`)
- Accepts a GeoJSON polygon from the frontend.
- Queries the `COPERNICUS/S2_SR` collection on Google Earth Engine.
- Applies QA60 cloud bitmask filtering to eliminate cloud and cirrus noise.
- Computes NDVI via:
  $$\text{NDVI} = \frac{B_8 - B_4}{B_8 + B_4}$$
- Returns mean NDVI, total surface area, canopy tier breakdowns, and an Earth Engine XYZ dynamic raster tile template.

### 2. PostGIS History & Recall (`backend/app/features/history`)
- Automatically captures every completed run with its GeoJSON boundary, computed metrics, and timestamps.
- Integrates with Supabase PostGIS spatial tables.
- Enables the frontend **History Drawer** to list previous runs and perform **click-to-recall**, which zooms the Leaflet map back to the historic bounds and reloads the overlay.

### 3. Deterministic Environmental Insights (`backend/app/features/insights`)
- Benchmarks vegetation coverage against WHO urban forestry standards (minimum 30% urban canopy cover target).
- Computes:
  - **Green Deficit in Hectares**: $\max(0, (0.30 - \text{green\_ratio}) \times \text{area\_ha})$
  - **Tree Planting Target**: Estimated using $\approx 400$ shade trees/hectare.
  - **Urban Heat Island (UHI) Risk Rating**: Critical, Warning, Moderate, or Healthy.
  - **Targeted Interventions**: Recommending bioswales, street canopy infill, and cool corridors.

---

## 📡 API Endpoints Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | System health check and status confirmation |
| `POST` | `/api/analyze` | Processes AOI polygon, executes NDVI math, and saves run |
| `GET` | `/api/history` | Retrieves paginated historical analysis runs |
| `GET` | `/api/history/{id}` | Fetches full run record by UUID including GeoJSON boundary |

---

## 📜 License
MIT License - Designed for Academic and Environmental Research.

