# Urban GreenWatch — GIS-Based Urban Tree Mapping & Green-Cover Assessment System

An interactive, on-demand web GIS application for mapping urban green cover and assessing vegetation health using **Sentinel-2** optical satellite imagery, **Google Earth Engine (GEE)**, **FastAPI**, and **Supabase (PostgreSQL + PostGIS)**.

---

## 🌐 Live Deployment URLs

- **Frontend (Vercel):** [https://gis-based-urban-tree-mapping-system.vercel.app](https://gis-based-urban-tree-mapping-system.vercel.app)
- **Backend API (Render):** [https://gis-based-urban-tree-mapping-system.onrender.com](https://gis-based-urban-tree-mapping-system.onrender.com)
- **Backend Health Check:** [https://gis-based-urban-tree-mapping-system.onrender.com/health](https://gis-based-urban-tree-mapping-system.onrender.com/health)

---

## 🔍 How the System Works

1. **Landing & Navigation:** Open the Vercel frontend (`About` view), navigate to the interactive global map, or open **DASHBOARD** and **METHODOLOGY**.
2. **Custom Boundary Selection:** Zoom/pan across the world map and draw a custom polygon around the target area.
3. **On-Demand Satellite Analysis:** Clicking **Analyze Area** sends the polygon to the FastAPI backend, which queries Sentinel-2 imagery via Google Earth Engine, masks clouds, computes **NDVI** ($\frac{\text{NIR} - \text{Red}}{\text{NIR} + \text{Red}}$), and returns vegetation statistics and map layers.
4. **Insights, Exports & History:** View summary metrics, generate insights, download reports, and save/recall past polygons and statistics stored in **Supabase PostGIS**.

> **Scope Note:** NDVI computed from 10-meter Sentinel-2 bands indicates broad green-cover patterns and vegetation density—it is a remote-sensing index, not a machine-learning individual tree-trunk counter or species classifier.

---

## ⏱️ How to Run & Use the Live Website Every Time

You can open **`https://gis-based-urban-tree-mapping-system.vercel.app`** anytime without redeploying:

- **Opening the Frontend:** Vercel serves the static frontend quickly from its CDN. Opening the webpage alone does **not** start Render's 15-minute inactivity clock.
- **First Backend Request After Idle Time (15+ Minutes):** Render's free tier spins down after **15 minutes without backend requests**. If you return after a few hours or a couple of days, the **first** backend call (such as **Analyze Area**, loading **DASHBOARD** history, or **AI Insights**) can take roughly **30–60 seconds** while Render wakes up.
- **Subsequent Requests:** Once Render is awake, follow-up requests run at normal speed as long as requests keep arriving within 15-minute intervals.
- **Demo / Presentation Tip:** About 1 minute before a demo or review, open [https://gis-based-urban-tree-mapping-system.onrender.com/health](https://gis-based-urban-tree-mapping-system.onrender.com/health) in a browser tab until it returns `{"status":"ok"}` so the backend is already warm.

---

## ⚙️ Environment Variables & Deployment Checklist

### 1. Render Backend (`Environment` Tab)
Set your live values in Render (never commit real secrets or `.env` files to Git):

```env
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_KEY=YOUR_SUPABASE_KEY
SUPABASE_SECRET_KEY=YOUR_SUPABASE_SECRET_KEY
GEE_SERVICE_ACCOUNT=YOUR_SERVICE_ACCOUNT_EMAIL
GEE_PROJECT_ID=YOUR_GCP_PROJECT_ID
GEE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
ALLOWED_ORIGINS=https://gis-based-urban-tree-mapping-system.vercel.app,http://localhost:3000,http://127.0.0.1:3000
API_V1_STR=/api
PROJECT_NAME=GIS Urban Tree Mapping API
DEBUG=False
PORT=8000
HOST=0.0.0.0
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
GEMINI_MODEL=gemini-3.8-flash
GROQ_API_KEY=YOUR_GROQ_API_KEY
GROQ_MODEL=openai/gpt-oss-120b
```

### 2. Vercel Frontend Settings
- **Framework Preset:** Other / None (Static HTML/JS/CSS).
- **Root Directory:** `./` (or leave default root with root `vercel.json` pointing `outputDirectory: "frontend"`).
- **Backend URL Config:** The frontend automatically connects to `https://gis-based-urban-tree-mapping-system.onrender.com` in production and `http://127.0.0.1:8000/api` when on `localhost`. Can also be overridden in `frontend/config.js` via `window.UGW_API_URL`.

---

## 🏛️ System Architecture & Directory Layout

The codebase follows a **feature-sliced, modular architecture** that separates the **FastAPI backend** and the **Vanilla/Leaflet frontend**, isolating domain logic, API schemas, and GIS controls into clear feature modules.

```text
urban-tree-mapping/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                     # App factory, CORS middleware, API router mounts, /health check
│   │   ├── config.py                   # Pydantic BaseSettings loading .env, GEE SA JSON, and origins
│   │   ├── core/                       # Shared backend core
│   │   │   ├── __init__.py
│   │   │   └── database.py             # Supabase client initialization & connection logic
│   │   ├── services/                   # Core platform services
│   │   │   ├── gee_service.py          # 3-tier GEE auth (in-memory JSON, file-based, simulation fallback)
│   │   │   ├── insights_service.py     # Gemini & Groq multi-LLM orchestration + deterministic fallback
│   │   │   └── supabase_service.py     # PostGIS persistence and querying
│   │   └── features/                   # Feature-based API routers
│   │       ├── analyze/                # Feature 1: Real-time Sentinel-2 & NDVI Processing
│   │       │   ├── router.py           # POST /api/analyze and POST /api/analyze/compare
│   │       │   ├── schemas.py          # Request/response validation schemas for polygon & NDVI stats
│   │       │   └── service.py          # GEE cloud-mask, NDVI computation, and canopy metrics
│   │       ├── analyses/               # Feature 2: Saved analysis management
│   │       │   ├── router.py           # GET /api/analyses, GET /api/analyses/{id}, DELETE
│   │       │   └── schemas.py          # Analysis listing and detail schemas
│   │       ├── history/                # Feature 3: PostGIS History & Saved Analysis Runs
│   │       │   ├── router.py           # GET /api/history and GET /api/history/{id}
│   │       │   └── schemas.py          # History listing schemas
│   │       └── insights/               # Feature 4: AI & Rule-Based Environmental Insights
│   │           ├── router.py           # POST /api/insights
│   │           └── schemas.py          # AI insight schemas & canopy health models
│   ├── requirements.txt                # Pinned production backend dependencies
│   └── .env.example                    # Backend environment variable template
├── frontend/
│   ├── index.html                      # Single-page application entry point (About, Map, Dashboard, Methodology)
│   ├── config.js                       # Runtime environment hook (window.UGW_API_URL)
│   ├── package.json                    # Frontend dependencies (Leaflet, jsPDF, html2canvas) & Vite scripts
│   ├── vercel.json                     # Vercel deployment headers and routing rules
│   ├── styles/                         # Application styling
│   │   ├── main.css                    # Dark glassmorphic GIS dashboard design
│   │   └── editorial.css               # Editorial landing page styling for About & Methodology views
│   └── src/                            # Feature-based JavaScript modules
│       ├── config.js                   # Centralized API base URL resolver (Localhost vs. Render production)
│       ├── main.js                     # View orchestrator and navigation controller
│       ├── api/                        # Centralized backend API client
│       │   └── apiClient.js            # fetch wrappers for /analyze, /analyses, /insights, /health
│       └── features/
│           ├── map/                    # Feature 1: Global Map & Polygon Drawing Tool
│           │   ├── mapManager.js       # Base map initialization (Leaflet dark & satellite basemaps)
│           │   └── drawTool.js         # Polygon drawing controls and GeoJSON extraction
│           ├── layers/                 # Feature 2: Satellite Overlay & Tile Management
│           │   ├── ndviLayer.js        # GEE dynamic XYZ raster layer renderer
│           │   └── legend.js           # Vegetation density color legend (Red -> Dark Green)
│           ├── dashboard/              # Feature 3: Analysis Statistics Display & Temporal Comparison
│           │   └── statsPanel.js       # Total area, green cover %, mean NDVI, acquisition date, charts
│           ├── insights/               # Feature 4: Green-Deficit Recommendations & PDF Report
│           │   ├── insightsCard.js     # AI insights modal, health score breakdown, PDF generator
│           │   └── pdfReportGenerator.js # Clean multi-page PDF study report export with charts & maps
│           └── history/                # Feature 5: Analysis History Drawer
│               └── historyDrawer.js    # Sidebar list of past runs, click-to-recall map bounds
├── render.yaml                         # Render Infrastructure-as-Code Blueprint
├── vercel.json                         # Vercel deployment configuration
└── README.md
```

---

## 🚀 Local Development Setup

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
   Edit `.env` with your Supabase, Google Earth Engine, and Gemini credentials:
   ```ini
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_KEY=your-supabase-service-role-key
   GEE_SERVICE_ACCOUNT=your-gee-sa@project.iam.gserviceaccount.com
   GEE_PRIVATE_KEY_FILE=credentials/gee-key.json
   GEMINI_API_KEY=your-gemini-api-key
   ```
   > **Note on Fallback / Simulation Mode**: If GEE, Supabase, or Gemini credentials are not provided, the backend automatically operates in **graceful fallback mode** with realistic simulation values and an in-memory history cache, allowing full UI testing without external blockers.

5. **Run the FastAPI Server**:
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```
   The interactive API documentation will be accessible at:
   - **Swagger UI**: [http://localhost:8000/docs](http://localhost:8000/docs)
   - **ReDoc**: [http://localhost:8000/redoc](http://localhost:8000/redoc)
   - **Health Probe**: [http://localhost:8000/health](http://localhost:8000/health)

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
   *Or launch directly using any local static web server (zero build step required):*
   ```bash
   python -m http.server 3000
   ```

3. Open your browser to `http://localhost:5173` (or `http://localhost:3000`).
   The frontend automatically detects local development and routes all API requests to `http://127.0.0.1:8000/api`.

---

## 🛰️ Core Features & Scientific Methodology

### 1. Real-Time Sentinel-2 & NDVI Processing
- Accepts a GeoJSON polygon from the frontend.
- Queries the `COPERNICUS/S2_HARMONIZED` and `COPERNICUS/S2_SR_HARMONIZED` collections on Google Earth Engine.
- Applies QA60 cloud and cirrus bitmask filtering to eliminate atmospheric noise.
- Computes NDVI via:
  $$\text{NDVI} = \frac{B_8 - B_4}{B_8 + B_4}$$
- Classifies canopy tiers across 4 standardized density brackets:
  - **Dense Vegetation / Tree Canopy**: $\text{NDVI} \ge 0.60$
  - **Moderate / Shrub Cover**: $0.40 \le \text{NDVI} < 0.60$
  - **Sparse / Grass Cover**: $0.20 \le \text{NDVI} < 0.40$
  - **Non-Vegetated / Built / Water**: $\text{NDVI} < 0.20$

### 2. Temporal & Multi-Date Comparison (`/api/analyze/compare`)
- Allows users to select two distinct observation date windows (e.g., Pre-Monsoon vs. Post-Monsoon, or multi-year epochs).
- Computes baseline vs. comparison delta metrics ($\Delta$ Green Cover %, $\Delta$ Mean NDVI, $\Delta$ Canopy Area).
- Visualizes canopy expansion or loss trajectories.

### 3. PostGIS Spatial Persistence & Historical Recall (`/api/analyses`)
- Automatically captures every completed run with its GeoJSON boundary, computed metrics, and timestamps.
- Integrates with Supabase PostGIS spatial tables.
- Enables the frontend **Dashboard** and **History Drawer** to list previous runs and perform **click-to-recall**, which zooms the Leaflet map back to the historic bounds and reloads the overlay.

### 4. AI & Rule-Based Environmental Insights
- Benchmarks vegetation coverage against WHO urban forestry standards (minimum 30% urban canopy cover target).
- Computes:
  - **Green Deficit in Hectares**: $\max(0, (0.30 - \text{green\_ratio}) \times \text{area\_ha})$
  - **Tree Planting Target**: Estimated using $\approx 400$ shade trees/hectare.
  - **Urban Heat Island (UHI) Risk Rating**: Critical, High, Moderate, or Low.
  - **Targeted Interventions**: Recommending bioswales, street canopy infill, and cool corridors.
  - **Multi-LLM Synthesis**: Powered by Google Gemini (`gemini-3.8-flash` / `gemini-2.5-flash`), with automated Groq fallback (`openai/gpt-oss-120b`) and a deterministic fallback engine.

### 5. Multi-Page PDF Study Report Export
- Exports a complete, print-ready PDF study report featuring executive synthesis, key metrics, canopy health score breakdown, intervention matrix, high-resolution map snapshot, and vegetation charts.
- Built using client-side `jsPDF` with Unicode sanitization and dynamic multi-page flow.

---

## 📡 API Endpoints Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Lightweight platform health probe (200 OK `{"status": "ok"}`) for Render / uptime monitors |
| `GET` | `/api/health` | Detailed system status, GEE telemetry, and credentials status |
| `POST` | `/api/analyze` | Processes AOI polygon, executes Sentinel-2 cloud-masked NDVI math, and saves run to PostGIS |
| `POST` | `/api/analyze/compare` | Executes two-period temporal NDVI comparison and delta computation |
| `GET` | `/api/analyses` | Retrieves paginated historical analysis runs from Supabase PostGIS |
| `GET` | `/api/analyses/{id}` | Fetches full run record by UUID including GeoJSON boundary and statistics |
| `DELETE` | `/api/analyses/{id}` | Deletes an analysis record by UUID |
| `POST` | `/api/insights` | Generates AI synthesis, canopy health score, and intervention recommendations |

---

## 📜 License
MIT License - Designed for Academic, Urban Planning, and Environmental Research.
