# AarogyaMap India - Healthcare Facility Web & Mobile App 🏥🇮🇳

A Progressive Web Application (PWA) and responsive mobile app designed with a **Sky Blue & Pastel Pink watercolor theme**, built to discover, search, and navigate healthcare facilities across India using **OpenStreetMap**, **Interactive India State Boundaries Overlay**, **Mobile GPS/AGPS**, real-time **geodesic distance calculation**, and **shortest path routing**.

![AarogyaMap India Banner](assets/cliparts/logo.svg)

---

## 🌸 Key Highlights & Theme
- **Theme**: Sky Blue (`#0ea5e9`, `#38bdf8`, `#e0f2fe`) and Pastel Rose Pink (`#f43f5e`, `#fb7185`, `#fce7f3`) with soft watercolor washes, glassmorphism cards, and fluid gradients.
- **Watercolor Cliparts & Icons**: Hand-crafted custom SVG watercolor cliparts for Hospitals, Primary Health Centres (PHC), Community Health Centres (CHC), District Hospitals, 24x7 Emergency, Blood Banks, Ambulances, and Ayush / Traditional Medicine centres.
- **PWA Mobile App**: Installable directly on Android, iOS (Safari "Add to Home Screen"), Windows, and macOS as a standalone app with offline caching and native app experience.

---

## 🗺️ Map & Location Features
1. **OpenStreetMap Integration (100% Free, Zero Watermarks)**:
   - **OpenStreetMap Standard**: Official global street tiles set as default.
   - **Esri World Street**: Clean pastel street details matching the app palette.
   - **OSM Humanitarian (HOT)**: Highlights medical, emergency, and clinic infrastructure.
   - **Esri Satellite**: High-resolution satellite imagery.
2. **🇮🇳 India State Boundaries Overlay**:
   - Built from official GeoJSON boundaries for all 37 Indian States and Union Territories (`INDIA/india_data.js`).
   - Interactive hover with vibrant pink borders, tooltips showing state names, and 1-click state bounding box zoom and filtering.
   - Toggle on/off anytime from the Map Styles panel.
3. **Marker Clustering & 47,000+ Healthcare Facilities**:
   - Concentric watercolor pastel cluster bubbles that effortlessly render tens of thousands of healthcare locations across all Indian states and districts at 60 FPS.
4. **Mobile GPS & AGPS Location Tracking**:
   - Geolocation API with `enableHighAccuracy: true`.
   - **Locate Me** button with instant smooth camera zoom to your position.
   - **Live AGPS Tracking**: Continuous position watcher with live accuracy circle (meter precision) and coordinates HUD.
   - **City Quick Jump**: Pre-configured coordinates for Delhi NCR, Mumbai, Bengaluru, Kolkata, Chennai, Hyderabad, Pune, Ahmedabad, Lucknow, Jaipur, Patna, Thiruvananthapuram, and Port Blair.
5. **Distance & Shortest Path Routing**:
   - **Real-Time Distance Calculation**: Haversine geodesic distance from the user's GPS coordinates to all facilities.
   - **Nearest-First Sorting & Radius Filtering**: Instantly filter facilities within `< 5 km`, `< 10 km`, `< 25 km`, or `< 50 km`.
   - **OSRM Shortest Path Routing**: Driving and walking shortest path polyline drawn on the OpenStreetMap with turn-by-turn navigation instructions and estimated travel times.
   - **1-Click Native Navigation**: Direct link to open the shortest route inside Google Maps or Apple Maps.

---

## 📡 Government APIs & Dual Fallback Datasets
- **API Key**: `579b464db66ec23bdd00000110fade4c7b7240d551e6727d99c0993a`
- **Supported Government Resources**:
  1. **All India Health Centres Directory** (`/resource/db2e3a80-ea7a-4ead-987a-9564fcee3c08`) — District Hospitals, Sub-Divisional Hospitals, CHCs, and PHCs across India (from `geocode_health_centre.csv`).
  2. **National Hospital Directory** (`/resource/98fa254e-c5f8-4910-a19b-4828939b477d`) — Hospitals with geocodes, beds, specialties, emergency, and contact parameters (from `hospital_directory.csv`).
- **Seamless Dual Data Pipeline**:
  - Automatically queries the live Government API on startup.
  - If the API is rate-limited, unreachable, or blocked by browser CORS restrictions, it **automatically and seamlessly switches to the local fallback dataset** (`data/hospitals_india.json` and `data/all_health_facilities.json`).
  - Users can toggle between Primary (18k+ facilities) and Full (47k+ facilities), or drop any custom `.csv` directly in the browser via PapaParse.

---

## 🌐 How to Host on GitHub Pages (Step-by-Step)

This application is completely static, offline-ready, and configured with `.nojekyll` and GitHub Actions for GitHub Pages!

### Step 1: Initialize Git and Commit
In your terminal or PowerShell inside `Health_Facility_India`:

```bash
git init
git add .
git commit -m "Deploy AarogyaMap India to GitHub Pages"
git branch -M main
```

### Step 2: Push to Your GitHub Repository
Create a new public repository on GitHub (e.g. `Health_Facility_India`), then run:

```bash
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/Health_Facility_India.git
git push -u origin main
```

### Step 3: Enable GitHub Pages
1. Go to your repository on GitHub.
2. Click **Settings** (tab at the top) → **Pages** (on the left menu).
3. Under **Build and deployment**:
   - **Source**: Select **Deploy from a branch**
   - **Branch**: Select `main` and folder `/ (root)`
   - Click **Save**.
4. *(Or GitHub Actions will automatically deploy via `.github/workflows/deploy.yml`!)*
5. Within 1–2 minutes, your web and mobile app will be live at:
   👉 **`https://<YOUR_GITHUB_USERNAME>.github.io/Health_Facility_India/`**

---

## 🚀 Running Locally

```bash
python server.py 8080
```
Open **[http://localhost:8080/](http://localhost:8080/)** in your browser.
