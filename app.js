/**
 * AarogyaMap India - Web & Mobile Healthcare Application
 * Features:
 * - OpenStreetMap integration via Leaflet with Marker Clustering
 * - Mobile GPS & AGPS Location Tracking with Accuracy Radii
 * - Real-time Haversine Geodesic Distance Calculation
 * - Shortest Path & Routing with OSRM (Driving & Walking) + Turn-by-Turn Directions
 * - Data.gov.in National Hospital Directory API Integration with Fallback Dataset
 * - Sky Blue & Pink Watercolor Theme UI with Custom SVG Markers
 */

// Application Configuration
const CONFIG = {
  HEALTH_CENTRES_RES_ID: 'db2e3a80-ea7a-4ead-987a-9564fcee3c08',
  HOSPITALS_RES_ID: '98fa254e-c5f8-4910-a19b-4828939b477d',
  API_KEY: '579b464db66ec23bdd00000110fade4c7b7240d551e6727d99c0993a',
  LOCAL_PROXY: '/api/gov-proxy',
  FALLBACK_DATA_PATH: 'data/hospitals_india.json',
  FALLBACK_DATA_FULL: 'data/all_health_facilities.json',
  OSRM_ROUTER_URL: 'https://router.project-osrm.org/route/v1',
  DEFAULT_CENTER: [22.9734, 78.6569], // Central India
  DEFAULT_ZOOM: 5
};

// Global App State
const state = {
  hospitals: (typeof window !== 'undefined' && Array.isArray(window.DEFAULT_HOSPITALS_DATA) && window.DEFAULT_HOSPITALS_DATA.length > 0)
    ? [...window.DEFAULT_HOSPITALS_DATA]
    : [],
  filtered: [],
  userCoords: null, // [lat, lng]
  userAccuracy: null,
  isTracking: false,
  watchId: null,
  selectedHospital: null,
  activeRoute: null,
  routeMode: 'driving',
  activeCategory: 'all',
  activeState: 'all',
  activeDistance: 'all',
  activeSort: 'nearest',
  searchQuery: '',
  dataSourceType: 'checking', // 'api' | 'fallback'
  tileLayerName: 'esri_street',
  activeResourceId: 'db2e3a80-ea7a-4ead-987a-9564fcee3c08', // Default to Health Centres Directory
  activeDatasetFile: 'data/all_health_facilities.json', // Default to Unified 147k+ Facilities
  renderedCardLimit: 60
};

// Map & Layer References
let map = null;
let tileLayers = {};
let markerClusterGroup = null;
let indiaBoundaryLayer = null;
let userMarker = null;
let userAccuracyCircle = null;
let routePolyline = null;
let routeOutline = null;
let deferredPrompt = null;

// ==========================================================================
// Initialization
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  setupEventListeners();
  setupPWA();
  // Immediately render pre-bundled failsafe facilities (zero network delay)
  if (state.hospitals && state.hospitals.length > 0) {
    populateStateDropdown();
    applyFilters();
    updateDataSourceStatus('fallback', `National Directory (${state.hospitals.length.toLocaleString()} facilities)`);
  }
  loadData();
});

// ==========================================================================
// Map Initialization & Tile Layers
// ==========================================================================
function initMap() {
  map = L.map('map', {
    center: CONFIG.DEFAULT_CENTER,
    zoom: CONFIG.DEFAULT_ZOOM,
    zoomControl: true,
    attributionControl: true
  });

  // Base Tile Layers (100% Free, Zero 403 Blocks, Enterprise Global CDN)
  // 1. Esri World Street Map (Ultra-reliable global CDN, pristine pastel street map, never blocked)
  tileLayers['esri_street'] = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri &mdash; Street data &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
      maxZoom: 19
    }
  );

  // 2. OpenStreetMap France CDN (High-capacity dedicated European/Global OSM mirror, doesn't block)
  tileLayers['osm_fr'] = L.tileLayer(
    'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors &copy; OpenStreetMap France',
      subdomains: ['a', 'b', 'c'],
      maxZoom: 20
    }
  );

  // 3. OpenStreetMap Humanitarian (HOT - Emergency & Healthcare focused)
  tileLayers['humanitarian'] = L.tileLayer(
    'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors, Tiles by <a href="https://www.hotosm.org/" target="_blank">Humanitarian OpenStreetMap Team</a>',
      subdomains: ['a', 'b', 'c'],
      maxZoom: 19
    }
  );

  // 4. Esri World Imagery (Satellite)
  tileLayers['satellite'] = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP',
      maxZoom: 18
    }
  );

  // 5. OpenStreetMap Standard with automatic error recovery
  const osmStandardLayer = L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
      subdomains: ['a', 'b', 'c'],
      maxZoom: 19
    }
  );
  // Auto-recover if volunteer server sends 403
  osmStandardLayer.on('tileerror', function(error) {
    if (error.tile && !error.tile._fallbackTried) {
      error.tile._fallbackTried = true;
      const c = error.coords;
      error.tile.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${c.z}/${c.y}/${c.x}`;
    }
  });
  tileLayers['osm_direct'] = osmStandardLayer;

  // Set default tile layer to Esri World Street (100% Reliable, Zero 403 Blocks)
  tileLayers['esri_street'].addTo(map);

  // Initialize Marker Cluster Group with watercolor styled bubbles
  markerClusterGroup = L.markerClusterGroup({
    chunkedLoading: true,
    maxClusterRadius: 65,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    iconCreateFunction: createClusterIcon
  });

  map.addLayer(markerClusterGroup);

  // Initialize India State Boundaries Overlay on top of OpenStreetMap
  initIndiaBoundaryOverlay();

  // Add scale indicator
  L.control.scale({ imperial: false, metric: true, position: 'bottomright' }).addTo(map);
}

// ==========================================================================
// India State Boundaries Overlay on OpenStreetMap
// ==========================================================================
function initIndiaBoundaryOverlay() {
  if (typeof INDIA_GEOJSON === 'undefined' || !INDIA_GEOJSON) {
    console.warn('INDIA_GEOJSON not available. Checking async...');
    return;
  }

  try {
    indiaBoundaryLayer = L.geoJSON(INDIA_GEOJSON, {
      style: function(feature) {
        return {
          color: '#0284c7',         // Sky blue boundary border
          weight: 1.8,
          opacity: 0.85,
          fillColor: '#38bdf8',     // Translucent pastel sky-blue fill
          fillOpacity: 0.04,
          dashArray: '3, 4'
        };
      },
      onEachFeature: function(feature, layer) {
        const props = feature.properties || {};
        const stateName = props.STNAME_SH || props.STNAME || 'State';

        // Hover tooltip
        layer.bindTooltip(`
          <div style="font-family:'Plus Jakarta Sans',sans-serif; text-align:center;">
            <strong style="color:#0284c7; font-size:12.5px;">🇮🇳 ${stateName}</strong><br>
            <span style="font-size:11px; color:#f43f5e; font-weight:600;">Click to focus &amp; filter state</span>
          </div>
        `, {
          sticky: true,
          direction: 'top',
          className: 'state-tooltip-bubble'
        });

        // Hover & Click interactions
        layer.on({
          mouseover: function(e) {
            const l = e.target;
            l.setStyle({
              weight: 2.8,
              color: '#f43f5e',     // Vibrant pink border on hover
              fillColor: '#f472b6',
              fillOpacity: 0.16,
              dashArray: ''
            });
            if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
              l.bringToFront();
            }
          },
          mouseout: function(e) {
            if (indiaBoundaryLayer) {
              indiaBoundaryLayer.resetStyle(e.target);
            }
          },
          click: function(e) {
            const bounds = e.target.getBounds();
            map.fitBounds(bounds, { padding: [35, 35] });
            filterByStateFromMap(stateName);
          }
        });
      }
    });

    indiaBoundaryLayer.addTo(map);
  } catch (err) {
    console.error('Error rendering India boundary overlay:', err);
  }
}

// Filter facilities when clicking on a state from the map
function filterByStateFromMap(stateName) {
  const select = document.getElementById('stateFilterSelect');
  const normalized = stateName.toLowerCase().trim();

  // Find matching option in state dropdown
  let foundVal = '';
  for (let opt of select.options) {
    if (opt.value.toLowerCase().trim() === normalized || 
        opt.textContent.toLowerCase().trim() === normalized) {
      foundVal = opt.value;
      break;
    }
  }

  if (foundVal) {
    select.value = foundVal;
    state.activeState = foundVal;
    showToast(`Focused on ${foundVal}`);
  } else {
    // Try substring matching (e.g. "Jammu & Kashmir")
    for (let opt of select.options) {
      if (opt.value.toLowerCase().includes(normalized) || normalized.includes(opt.value.toLowerCase())) {
        select.value = opt.value;
        state.activeState = opt.value;
        showToast(`Focused on ${opt.value}`);
        break;
      }
    }
  }

  state.renderedCardLimit = 60;
  applyFilters();
}

// Custom Cluster Icon in Sky Blue & Pink
function createClusterIcon(cluster) {
  const count = cluster.getChildCount();
  let sizeClass = 'marker-cluster-small';
  let size = 42;

  if (count > 50) {
    sizeClass = 'marker-cluster-medium';
    size = 48;
  }
  if (count > 250) {
    sizeClass = 'marker-cluster-large';
    size = 56;
  }

  return L.divIcon({
    html: `<div><span>${count.toLocaleString()}</span></div>`,
    className: `marker-cluster ${sizeClass}`,
    iconSize: L.point(size, size)
  });
}

// ==========================================================================
// Custom Watercolor SVG Marker Icons
// ==========================================================================
function getHospitalMarkerIcon(hospital) {
  let iconUrl = 'assets/icons/hospital.svg';
  const cat = (hospital.category || '').toLowerCase();
  const care = (hospital.care_type || '').toLowerCase();
  const sys = (hospital.system || '').toLowerCase();
  const emergency = (hospital.emergency || '').toLowerCase();
  const name = (hospital.name || '').toLowerCase();

  if (emergency.includes('24') || emergency.includes('yes') || name.includes('emergency') || name.includes('trauma')) {
    iconUrl = 'assets/icons/emergency.svg';
  } else if (hospital.bloodbank && hospital.bloodbank !== '0' && hospital.bloodbank !== '') {
    iconUrl = 'assets/icons/bloodbank.svg';
  } else if (sys.includes('ayush') || sys.includes('ayurveda') || sys.includes('homeopathy')) {
    iconUrl = 'assets/icons/ayush.svg';
  } else if (care.includes('clinic') || care.includes('dispensary') || care.includes('centre') || care.includes('phc')) {
    iconUrl = 'assets/icons/clinic.svg';
  } else if (hospital.ambulance && hospital.ambulance !== '0' && hospital.ambulance !== '') {
    iconUrl = 'assets/icons/ambulance.svg';
  }

  return L.divIcon({
    className: 'custom-wc-marker',
    html: `<img src="${iconUrl}" class="wc-marker-icon-img" alt="marker">`,
    iconSize: [38, 38],
    iconAnchor: [19, 36],
    popupAnchor: [0, -32]
  });
}

// User Location Pulsing Watercolor Marker
function getUserLocationIcon() {
  return L.divIcon({
    className: 'user-gps-marker',
    html: `
      <div class="user-gps-ripple"></div>
      <div class="user-gps-dot"></div>
    `,
    iconSize: [48, 48],
    iconAnchor: [24, 24]
  });
}

// ==========================================================================
// Data Loading: API with Fallback
// ==========================================================================
async function loadData() {
  updateDataSourceStatus('checking', 'Connecting to Database...');

  // 1. ALWAYS load the complete nationwide fallback dataset FIRST
  // This guarantees facilities across all of India (including user's exact area) are immediately available
  await loadFallbackDataset();
  populateStateDropdown();
  applyFilters();

  // 2. Now attempt to query the live Government API in background to merge any live updates
  const resId = state.activeResourceId || CONFIG.HEALTH_CENTRES_RES_ID;

  try {
    const limit = document.getElementById('apiFetchLimit') ? document.getElementById('apiFetchLimit').value : '100';
    let filterQuery = '';
    if (state.activeState && state.activeState !== 'all') {
      filterQuery += `&filters[state_name]=${encodeURIComponent(state.activeState)}`;
    }

    const apiUrl = `https://api.data.gov.in/resource/${resId}?api-key=${CONFIG.API_KEY}&format=json&limit=${limit}${filterQuery}`;
    
    // Use local proxy if on localhost, or direct API on GitHub Pages
    const targetUrl = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? `${CONFIG.LOCAL_PROXY}?resource=${resId}&limit=${limit}${filterQuery}`
      : apiUrl;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(targetUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && data.records && Array.isArray(data.records) && data.records.length > 0) {
        mergeApiRecords(data.records);
        const apiTitle = resId === CONFIG.HEALTH_CENTRES_RES_ID ? 'Health Centres API' : 'Hospitals API';
        updateDataSourceStatus('api', `Live Gov ${apiTitle} Connected (${state.hospitals.length.toLocaleString()} facilities)`);
        applyFilters();
      }
    }
  } catch (err) {
    console.log('Using pre-loaded nationwide dataset. Live API note:', err.message);
  }
}

// Fallback dataset loader (Progressive enhancement for full 47k+ nationwide dataset)
async function loadFallbackDataset(customPath) {
  const filePath = customPath || state.activeDatasetFile || CONFIG.FALLBACK_DATA_PATH;
  try {
    // Resolve path relative to current repo base directory, supporting trailing slash
    const baseHref = window.location.href.split('?')[0].split('#')[0];
    const baseUrl = baseHref.substring(0, baseHref.lastIndexOf('/') + 1);
    const fetchUrl = new URL(filePath, baseUrl).href;

    const res = await fetch(fetchUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${fetchUrl}`);
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      state.hospitals = data;
      calculateDistances();
      populateStateDropdown();
      applyFilters();
      updateDataSourceStatus('fallback', `National Directory (${data.length.toLocaleString()} facilities)`);
      showToast(`Loaded full database: ${data.length.toLocaleString()} facilities across India`);
    }
  } catch (err) {
    console.warn('Fallback dataset progressive fetch note:', err.message);
    if (state.hospitals && state.hospitals.length > 0) {
      updateDataSourceStatus('fallback', `National Directory (${state.hospitals.length.toLocaleString()} facilities)`);
    } else {
      updateDataSourceStatus('error', 'Error loading dataset');
      showToast('Failed to load dataset. Please check files or upload CSV.', 'error');
    }
  }
}

// Merge live API records into state.hospitals without replacing the nationwide database
function mergeApiRecords(records) {
  const mapped = parseRecords(records);
  if (mapped.length === 0) return;

  const existingKeys = new Set(
    state.hospitals.slice(0, 5000).map(h => `${(h.name || '').toLowerCase()}_${Number(h.lat).toFixed(3)}_${Number(h.lng).toFixed(3)}`)
  );

  const newItems = [];
  mapped.forEach(item => {
    const key = `${(item.name || '').toLowerCase()}_${Number(item.lat).toFixed(3)}_${Number(item.lng).toFixed(3)}`;
    if (!existingKeys.has(key)) {
      newItems.push(item);
      existingKeys.add(key);
    }
  });

  if (newItems.length > 0) {
    state.hospitals = [...newItems, ...state.hospitals];
    if (state.userCoords) calculateDistances();
  }
}

// Normalize API records into unified structure (Supports both Health Centres & Hospital APIs)
function parseRecords(records) {
  const mapped = [];
  const typeMap = {
    'dis_h': 'District Hospital',
    's_t_h': 'Sub-Divisional Hospital',
    'chc': 'Community Health Centre',
    'phc': 'Primary Health Centre',
    'sub_cen': 'Sub Centre'
  };

  records.forEach((r, idx) => {
    let lat = null;
    let lng = null;

    if (r.latitude !== undefined && r.longitude !== undefined) {
      lat = parseFloat(r.latitude);
      lng = parseFloat(r.longitude);
    } else {
      const coords = (r.Location_Coordinates || r.location_coordinates || '').trim();
      if (coords && coords.includes(',')) {
        const parts = coords.split(',');
        lat = parseFloat(parts[0].trim());
        lng = parseFloat(parts[1].trim());
      }
    }

    if (isNaN(lat) || isNaN(lng) || lat < 6.0 || lat > 38.5 || lng < 68.0 || lng > 97.5) return;

    const name = r.Facility_Name || r.facility_name || r.Hospital_Name || r.hospital_name || 'Healthcare Facility';
    const stateName = r.State_Name || r.state_name || r.State || r.state || '';
    const districtName = r.District_Name || r.district_name || r.District || r.district || '';
    const subdistName = r.Subdistrict_Name || r.subdistrict_name || r.Subdistrict || '';
    const ftype = (r.Facility_Type || r.facility_type || '').toLowerCase();
    const careType = typeMap[ftype] || r.Hospital_Care_Type || r.hospital_care_type || r.Type_Of_Facility || 'Health Centre';
    const category = r.Hospital_Category || r.hospital_category || 'Public / Government';
    const address = r.Facility_Address || r.facility_address || r.Address_Original_First_Line || r.address_original_first_line || r.Location || '';

    mapped.push({
      id: 900000 + idx + 1,
      name: name,
      lat: lat,
      lng: lng,
      type_code: ftype,
      state: stateName,
      district: districtName,
      subdistrict: subdistName,
      category: category,
      care_type: careType,
      system: r.Discipline_Systems_of_Medicine || r.discipline_systems_of_medicine || 'Allopathic',
      address: address !== 'NA' ? address : '',
      pincode: r.Pincode || r.pincode || '',
      phone: r.Telephone || r.Mobile_Number || r.Emergency_Num || '',
      ambulance: r.Ambulance_Phone_No || '',
      bloodbank: r.Bloodbank_Phone_No || '',
      beds: r.Total_Num_Beds || '',
      specialties: r.Specialties || '',
      facilities: r.Facilities || '',
      source: ftype ? 'health_centres' : 'hospitals'
    });
  });

  return mapped;
}

function processApiRecords(records) {
  mergeApiRecords(records);
}

// Update status pill in header
function updateDataSourceStatus(type, labelText) {
  state.dataSourceType = type;
  const pill = document.getElementById('dataSourceBadge');
  const label = document.getElementById('dataSourceLabel');
  const dot = pill.querySelector('.pulse-dot');

  label.textContent = labelText;

  if (type === 'api') {
    dot.className = 'pulse-dot';
    dot.style.background = '#10b981';
  } else if (type === 'fallback') {
    dot.className = 'pulse-dot fallback';
    dot.style.background = '#f59e0b';
  } else {
    dot.className = 'pulse-dot';
    dot.style.background = '#ef4444';
  }

  // Update modal text as well
  const headline = document.getElementById('syncStatusHeadline');
  const desc = document.getElementById('syncStatusDesc');
  if (headline && desc) {
    if (type === 'api') {
      headline.textContent = 'Live Government API Connected';
      desc.textContent = `Receiving live data from National Hospital Directory (/resource/98fa254e-c5f8-4910-a19b-4828939b477d)`;
    } else {
      headline.textContent = 'Offline Fallback Dataset Active';
      desc.textContent = `Using local high-performance dataset with ${state.hospitals.length.toLocaleString()} geocoded facilities.`;
    }
  }
}

// ==========================================================================
// Mobile GPS & AGPS Geolocation
// ==========================================================================
function locateUser(animate = true) {
  if (!('geolocation' in navigator)) {
    showToast('GPS Geolocation is not supported by your browser', 'error');
    return;
  }

  const locateBtn = document.getElementById('headerLocateBtn');
  locateBtn.classList.add('active-tracking');
  showToast('Locating your position via GPS/AGPS...');

  const options = {
    enableHighAccuracy: true,
    timeout: 12000,
    maximumAge: 0
  };

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const acc = pos.coords.accuracy;

      updateUserLocation(lat, lng, acc, animate);
      locateBtn.classList.remove('active-tracking');
      showToast(`Location locked (Accuracy: ±${Math.round(acc)}m)`);
    },
    (err) => {
      console.warn('Geolocation error:', err);
      locateBtn.classList.remove('active-tracking');
      let msg = 'Unable to get location.';
      if (err.code === 1) msg = 'Location access denied by user. Please allow GPS permission.';
      else if (err.code === 2) msg = 'Position unavailable. Try selecting a city from the dropdown.';
      else if (err.code === 3) msg = 'Location request timed out.';
      showToast(msg, 'error');
    },
    options
  );
}

// Toggle Live Continuous GPS Tracking (Watch Position)
function toggleLiveTracking() {
  const btn = document.getElementById('liveTrackingBtn');
  if (state.isTracking) {
    // Stop tracking
    if (state.watchId !== null) {
      navigator.geolocation.clearWatch(state.watchId);
      state.watchId = null;
    }
    state.isTracking = false;
    btn.classList.remove('active');
    document.getElementById('gpsHudCard').style.display = 'none';
    showToast('Live GPS tracking stopped');
  } else {
    // Start tracking
    if (!('geolocation' in navigator)) {
      showToast('Geolocation not available', 'error');
      return;
    }

    state.isTracking = true;
    btn.classList.add('active');
    showToast('Live AGPS Tracking Started');

    state.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const acc = pos.coords.accuracy;
        updateUserLocation(lat, lng, acc, false);
      },
      (err) => {
        console.error('WatchPosition error:', err);
      },
      { enableHighAccuracy: true, maximumAge: 1000 }
    );
  }
}

// Update user location on map, HUD, and compute distances
function updateUserLocation(lat, lng, accuracy, flyTo = true) {
  state.userCoords = [lat, lng];
  state.userAccuracy = accuracy;

  // Render User Marker
  if (!userMarker) {
    userMarker = L.marker([lat, lng], {
      icon: getUserLocationIcon(),
      zIndexOffset: 1000
    }).addTo(map);

    userMarker.bindPopup(`
      <div style="text-align:center; padding: 4px;">
        <strong style="color:#0ea5e9;">Your Current Position</strong><br>
        <span style="font-size:11px; color:#64748b;">Accuracy: ±${Math.round(accuracy)}m</span>
      </div>
    `);
  } else {
    userMarker.setLatLng([lat, lng]);
  }

  // Render Accuracy Circle
  if (!userAccuracyCircle) {
    userAccuracyCircle = L.circle([lat, lng], {
      radius: accuracy || 50,
      color: '#f43f5e',
      weight: 1.5,
      fillColor: '#38bdf8',
      fillOpacity: 0.15,
      dashArray: '4, 4'
    }).addTo(map);
  } else {
    userAccuracyCircle.setLatLng([lat, lng]);
    userAccuracyCircle.setRadius(accuracy || 50);
  }

  // Fly to user location if requested
  if (flyTo) {
    map.flyTo([lat, lng], 13, { duration: 1.2 });
  }

  // Update HUD
  const hud = document.getElementById('gpsHudCard');
  hud.style.display = 'flex';
  document.getElementById('gpsHudCoords').textContent = `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;
  document.getElementById('gpsHudAcc').textContent = `Accuracy: ±${Math.round(accuracy)}m`;

  // Show GPS badge in results bar
  document.getElementById('gpsDistanceNotice').style.display = 'inline-block';

  // Re-calculate distances for all facilities & update list
  calculateDistances();
  applyFilters();
}

// ==========================================================================
// Haversine Distance Calculation
// ==========================================================================
function calculateDistances() {
  if (!state.userCoords) return;
  const [uLat, uLng] = state.userCoords;

  state.hospitals.forEach(h => {
    h.distanceKm = haversineDistance(uLat, uLng, h.lat, h.lng);
  });
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDistance(distKm) {
  if (distKm === undefined || distKm === null || isNaN(distKm)) return '';
  if (distKm < 1) {
    return `${Math.round(distKm * 1000)} m`;
  }
  return `${distKm.toFixed(1)} km`;
}

// ==========================================================================
// Shortest Path & Routing (OSRM Driving & Walking)
// ==========================================================================
async function routeToHospital(hospital, mode = 'driving') {
  if (!state.userCoords) {
    showToast('Getting your GPS location first to calculate shortest path...', 'info');
    locateUser(false);
    // If still no coords after quick check, prompt
    if (!state.userCoords) {
      // Pick city center or alert
      showToast('Please enable GPS or select a City Preset in the header to navigate from', 'error');
      return;
    }
  }

  state.selectedHospital = hospital;
  state.routeMode = mode;

  const [uLat, uLng] = state.userCoords;
  const hLat = hospital.lat;
  const hLng = hospital.lng;

  showToast(`Finding shortest ${mode} route to ${hospital.name}...`);

  // OSRM URL: coordinates in format {lon},{lat}
  const osrmUrl = `${CONFIG.OSRM_ROUTER_URL}/${mode}/${uLng},${uLat};${hLng},${hLat}?overview=full&geometries=geojson&steps=true`;

  try {
    const res = await fetch(osrmUrl);
    if (!res.ok) throw new Error('OSRM routing request failed');
    const data = await res.json();

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      throw new Error(data.message || 'No route found');
    }

    const route = data.routes[0];
    displayRouteOnMap(route, hospital);
  } catch (err) {
    console.warn('OSRM router error, falling back to direct shortest path line:', err);
    // Fallback: direct geodesic line
    displayGeodesicRoute([uLat, uLng], [hLat, hLng], hospital);
  }
}

// Display OSRM Route polyline & stats
function displayRouteOnMap(route, hospital) {
  clearRouteLines();

  const coordinates = route.geometry.coordinates.map(c => [c[1], c[0]]); // Swap to [lat, lng]

  // Outer glowing halo (Sky Blue / Pink theme)
  routeOutline = L.polyline(coordinates, {
    color: '#f43f5e',
    weight: 8,
    opacity: 0.45,
    lineCap: 'round',
    lineJoin: 'round'
  }).addTo(map);

  // Inner vibrant route polyline
  routePolyline = L.polyline(coordinates, {
    color: '#0ea5e9',
    weight: 4.5,
    opacity: 0.95,
    lineCap: 'round',
    lineJoin: 'round',
    dashArray: state.routeMode === 'walking' ? '6, 8' : null
  }).addTo(map);

  // Fit bounds with comfortable padding
  map.fitBounds(routePolyline.getBounds(), { padding: [60, 60] });

  // Update Active Route Floating Card
  const distKm = (route.distance / 1000).toFixed(1);
  const timeMin = Math.round(route.duration / 60);
  const timeHours = (timeMin >= 60) ? `${Math.floor(timeMin / 60)}h ${timeMin % 60}m` : `${timeMin} mins`;

  state.activeRoute = {
    hospital,
    distanceKm: distKm,
    durationText: timeHours,
    steps: route.legs[0].steps || []
  };

  document.getElementById('routeDistVal').textContent = `${distKm} km`;
  document.getElementById('routeTimeVal').textContent = timeHours;
  document.getElementById('activeRouteFloatingCard').style.display = 'flex';
  document.getElementById('routePanelBtn').style.display = 'flex';
  document.getElementById('routeNavText').textContent = `${distKm} km`;

  // Render turn-by-turn directions modal content
  renderDirectionsModal(state.activeRoute);
}

// Fallback geodesic direct path
function displayGeodesicRoute(start, end, hospital) {
  clearRouteLines();

  routePolyline = L.polyline([start, end], {
    color: '#f43f5e',
    weight: 4,
    dashArray: '6, 10'
  }).addTo(map);

  map.fitBounds(routePolyline.getBounds(), { padding: [60, 60] });

  const dist = haversineDistance(start[0], start[1], end[0], end[1]);
  const distKm = dist.toFixed(1);
  const estTimeMin = Math.round((dist / 35) * 60); // approx 35 km/h driving

  state.activeRoute = {
    hospital,
    distanceKm: distKm,
    durationText: `~${estTimeMin} mins (direct)`,
    steps: [
      {
        maneuver: { instruction: `Head directly toward ${hospital.name}` },
        distance: dist * 1000
      },
      {
        maneuver: { instruction: `Arrive at destination: ${hospital.name}` },
        distance: 0
      }
    ]
  };

  document.getElementById('routeDistVal').textContent = `${distKm} km`;
  document.getElementById('routeTimeVal').textContent = `~${estTimeMin}m`;
  document.getElementById('activeRouteFloatingCard').style.display = 'flex';
  document.getElementById('routePanelBtn').style.display = 'flex';

  renderDirectionsModal(state.activeRoute);
}

function clearRouteLines() {
  if (routePolyline) { map.removeLayer(routePolyline); routePolyline = null; }
  if (routeOutline) { map.removeLayer(routeOutline); routeOutline = null; }
  document.getElementById('activeRouteFloatingCard').style.display = 'none';
  document.getElementById('routePanelBtn').style.display = 'none';
  state.activeRoute = null;
}

// Render Directions Modal
function renderDirectionsModal(routeData) {
  const modal = document.getElementById('directionsModal');
  const h = routeData.hospital;
  document.getElementById('directionsDestTitle').textContent = h.name;
  document.getElementById('directionsSummary').textContent = `${routeData.distanceKm} km • ${routeData.durationText} via shortest path`;

  const container = document.getElementById('directionsStepsList');
  container.innerHTML = '';

  if (!routeData.steps || routeData.steps.length === 0) {
    container.innerHTML = `<div class="text-muted" style="text-align:center; padding:20px;">Direct line path calculated. Proceed to facility.</div>`;
    return;
  }

  routeData.steps.forEach((step, idx) => {
    const item = document.createElement('div');
    item.className = 'direction-step-item';

    // Step maneuver icon
    let iconClass = 'fa-solid fa-arrow-up';
    const type = (step.maneuver.type || '').toLowerCase();
    const modifier = (step.maneuver.modifier || '').toLowerCase();

    if (type.includes('arrive')) iconClass = 'fa-solid fa-flag-checkered text-danger';
    else if (type.includes('depart')) iconClass = 'fa-solid fa-play text-primary';
    else if (modifier.includes('right')) iconClass = 'fa-solid fa-arrow-right';
    else if (modifier.includes('left')) iconClass = 'fa-solid fa-arrow-left';
    else if (modifier.includes('straight')) iconClass = 'fa-solid fa-arrow-up';

    const instruction = step.maneuver.instruction || step.name || `Continue on route`;
    const stepDist = step.distance > 0 ? `${Math.round(step.distance)} m` : '';

    item.innerHTML = `
      <div class="step-icon-wrap">
        <i class="${iconClass}"></i>
      </div>
      <div class="step-content">
        <div class="step-instruction">${instruction}</div>
        ${stepDist ? `<div class="step-distance">${stepDist}</div>` : ''}
      </div>
    `;
    container.appendChild(item);
  });
}

// ==========================================================================
// Filtering, Sorting & Search Engine
// ==========================================================================
function applyFilters() {
  const query = state.searchQuery.toLowerCase().trim();
  const category = state.activeCategory;
  const stateVal = state.activeState;
  const distFilter = state.activeDistance;
  const sortMode = state.activeSort;

  let results = state.hospitals.filter(h => {
    // Text search (name, category, care type, district, state, pincode, address, specialties)
    if (query) {
      const q = query.toLowerCase().trim();
      const cat = (h.category || '').toLowerCase();
      const care = (h.care_type || '').toLowerCase();
      const name = (h.name || '').toLowerCase();
      const tcode = (h.type_code || '').toLowerCase();

      const match =
        name.includes(q) ||
        cat.includes(q) ||
        care.includes(q) ||
        (h.district && h.district.toLowerCase().includes(q)) ||
        (h.state && h.state.toLowerCase().includes(q)) ||
        (h.address && h.address.toLowerCase().includes(q)) ||
        (h.pincode && h.pincode.includes(q)) ||
        (h.specialties && h.specialties.toLowerCase().includes(q)) ||
        // Handle common search synonyms
        ((q === 'public' || q === 'govt' || q === 'government') && 
          (cat.includes('public') || cat.includes('government') || care.includes('district') || care.includes('sub-divisional') || care.includes('community') || care.includes('primary') || tcode === 'phc' || tcode === 'chc' || tcode === 'dis_h' || tcode === 's_t_h')) ||
        (q === 'private' && cat.includes('private')) ||
        (q === 'chc' && (tcode === 'chc' || care.includes('community') || name.includes('chc'))) ||
        (q === 'phc' && (tcode === 'phc' || care.includes('primary') || name.includes('phc')));

      if (!match) return false;
    }

    // Category filter
    if (category !== 'all') {
      const cat = (h.category || '').toLowerCase();
      const care = (h.care_type || '').toLowerCase();
      const sys = (h.system || '').toLowerCase();
      const emergency = (h.emergency || '').toLowerCase();
      const name = h.name.toLowerCase();
      const tcode = (h.type_code || '').toLowerCase();

      if (category === 'public') {
        const isPublic = cat.includes('public') || cat.includes('government') || care.includes('district') || care.includes('sub-divisional') || care.includes('community') || care.includes('primary') || tcode === 'phc' || tcode === 'chc' || tcode === 'dis_h' || tcode === 's_t_h';
        if (!isPublic) return false;
      }
      if (category === 'private' && !cat.includes('private')) return false;
      if (category === 'dis_h') {
        const isDistrictHosp = care.includes('district') || care.includes('sub-divisional') || care.includes('general hospital') || care.includes('sdh') || care.includes('sgh') || name.includes('district hospital') || name.includes('sdh') || name.includes('sgh') || tcode === 'dis_h' || tcode === 's_t_h';
        if (!isDistrictHosp) return false;
      }
      if (category === 'chc' && !care.includes('community') && !name.includes('chc') && tcode !== 'chc') return false;
      if (category === 'phc' && !care.includes('primary') && !name.includes('phc') && tcode !== 'phc') return false;
      if (category === 'emergency' && !emergency.includes('24') && !name.includes('emergency') && !name.includes('trauma')) return false;
      if (category === 'bloodbank' && (!h.bloodbank || h.bloodbank === '0')) return false;
      if (category === 'ayush' && !sys.includes('ayush') && !sys.includes('ayurveda') && !sys.includes('homeopathy')) return false;
    }

    // State filter
    if (stateVal !== 'all' && h.state !== stateVal) {
      return false;
    }

    // Distance filter
    if (distFilter !== 'all' && state.userCoords) {
      const maxDist = parseFloat(distFilter);
      if (h.distanceKm === undefined || h.distanceKm > maxDist) {
        return false;
      }
    }

    return true;
  });

  // Sorting
  if (sortMode === 'nearest' && state.userCoords) {
    results.sort((a, b) => (a.distanceKm || Infinity) - (b.distanceKm || Infinity));
  } else if (sortMode === 'name') {
    results.sort((a, b) => a.name.localeCompare(b.name));
  }

  state.filtered = results;

  // Update counts
  document.getElementById('resultsCount').textContent = results.length.toLocaleString();

  // Render on Map
  renderMarkers(results);

  // Render Sidebar Cards
  renderCardsList(results);
}

// Render Markers in MarkerCluster
function renderMarkers(facilities) {
  markerClusterGroup.clearLayers();

  // If there are many facilities, we add them in batch
  const markers = [];
  facilities.forEach(h => {
    const icon = getHospitalMarkerIcon(h);
    const m = L.marker([h.lat, h.lng], { icon: icon });

    // Popup content with action buttons
    m.bindPopup(() => {
      const distBadge = h.distanceKm !== undefined
        ? `<span class="popup-dist-badge"><i class="fa-solid fa-location-arrow"></i> ${formatDistance(h.distanceKm)}</span>`
        : '';

      const phoneLink = h.phone && h.phone !== '0'
        ? `<a href="tel:${h.phone.replace(/[^0-9+]/g, '')}" class="btn-popup-call"><i class="fa-solid fa-phone"></i> Call</a>`
        : '';

      return `
        <div>
          <h4 class="popup-hosp-title">${h.name}</h4>
          <div>
            <span class="popup-category-badge">${h.category || 'General'}</span>
            ${distBadge}
          </div>
          <p class="popup-address">${h.address || (h.district ? `${h.district}, ${h.state}` : h.state)}</p>
          <div class="popup-actions-row">
            <button class="btn-popup-route" onclick="window.appTriggerRoute(${h.id})">
              <i class="fa-solid fa-route"></i> Shortest Route
            </button>
            ${phoneLink}
            <button class="btn-popup-call" onclick="window.appShowDetails(${h.id})">
              <i class="fa-solid fa-circle-info"></i> Info
            </button>
          </div>
        </div>
      `;
    });

    markers.push(m);
  });

  markerClusterGroup.addLayers(markers);
}

// Render Sidebar Cards (Virtual chunk)
function renderCardsList(facilities) {
  const container = document.getElementById('facilitiesList');
  container.innerHTML = '';

  if (facilities.length === 0) {
    let actionButtons = '';
    if (state.activeDistance !== 'all') {
      actionButtons += `
        <button class="btn-card-action" onclick="window.appExpandDistance(10)" style="margin:3px;">Expand to 10 km</button>
        <button class="btn-card-action" onclick="window.appExpandDistance(25)" style="margin:3px;">Expand to 25 km</button>
        <button class="btn-card-action" onclick="window.appExpandDistance('all')" style="margin:3px;">Any Distance</button>
      `;
    }
    if (state.searchQuery) {
      actionButtons += `
        <button class="btn-card-action" onclick="window.appClearSearch()" style="margin:3px;">Clear Search "${state.searchQuery}"</button>
      `;
    }
    actionButtons += `
      <button class="btn-card-action route" onclick="window.appResetAllFilters()" style="margin:3px; margin-top:8px;">Reset All Filters</button>
    `;

    container.innerHTML = `
      <div style="text-align: center; padding: 32px 14px; color: #64748b;">
        <i class="fa-solid fa-hospital-user" style="font-size: 36px; color: #cbd5e1; margin-bottom: 10px;"></i>
        <h4 style="font-size: 14.5px; font-weight: 700; color: #334155; margin-bottom: 4px;">No facilities matched current filters</h4>
        <p style="font-size: 12px; margin-bottom: 12px;">Try expanding distance, clearing your search term, or resetting filters:</p>
        <div style="display:flex; flex-wrap:wrap; justify-content:center; gap:4px;">
          ${actionButtons}
        </div>
      </div>
    `;
    return;
  }

  const chunk = facilities.slice(0, state.renderedCardLimit);

  chunk.forEach(h => {
    const card = document.createElement('div');
    card.className = 'facility-card';
    card.dataset.id = h.id;

    // Type icon
    let iconSrc = 'assets/icons/hospital.svg';
    if ((h.system || '').toLowerCase().includes('ayush')) iconSrc = 'assets/icons/ayush.svg';
    else if ((h.care_type || '').toLowerCase().includes('clinic')) iconSrc = 'assets/icons/clinic.svg';
    else if ((h.emergency || '').toLowerCase().includes('24')) iconSrc = 'assets/icons/emergency.svg';

    const distBadge = h.distanceKm !== undefined
      ? `<div class="card-distance-badge"><i class="fa-solid fa-location-arrow"></i> ${formatDistance(h.distanceKm)}</div>`
      : '';

    const catBadgeClass = (h.category || '').toLowerCase().includes('public') ? 'govt' : 'private';

    card.innerHTML = `
      <div class="card-top-row">
        <div class="card-title-wrap">
          <img src="${iconSrc}" class="card-type-icon" alt="">
          <div class="card-hosp-name">${h.name}</div>
        </div>
        ${distBadge}
      </div>

      <div class="card-badges-row">
        <span class="badge-tag ${catBadgeClass}">${h.category || 'General'}</span>
        <span class="badge-tag type">${h.care_type || 'Hospital'}</span>
        ${h.beds && h.beds !== '0' ? `<span class="badge-tag"><i class="fa-solid fa-bed"></i> ${h.beds} Beds</span>` : ''}
      </div>

      <div class="card-address-text">
        <i class="fa-solid fa-map-pin" style="color: #94a3b8; margin-right: 4px;"></i>
        ${h.address || `${h.district || ''}, ${h.state}`}
      </div>

      <div class="card-bottom-actions">
        <div class="card-location-meta">${h.district ? `${h.district}, ` : ''}${h.state}</div>
        <div class="card-action-btns">
          <button class="btn-card-action route" onclick="event.stopPropagation(); window.appTriggerRoute(${h.id});">
            <i class="fa-solid fa-route"></i> Route
          </button>
          ${h.phone && h.phone !== '0' ? `
            <a href="tel:${h.phone.replace(/[^0-9+]/g, '')}" class="btn-card-action" onclick="event.stopPropagation();">
              <i class="fa-solid fa-phone"></i>
            </a>
          ` : ''}
        </div>
      </div>
    `;

    // Click on card: pan to marker and open modal / popup
    card.addEventListener('click', () => {
      document.querySelectorAll('.facility-card.highlighted').forEach(c => c.classList.remove('highlighted'));
      card.classList.add('highlighted');
      map.flyTo([h.lat, h.lng], 15, { duration: 0.8 });
      showFacilityDetails(h);
    });

    container.appendChild(card);
  });

  // Load more button if there are remaining
  if (facilities.length > state.renderedCardLimit) {
    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.className = 'btn-link-action';
    loadMoreBtn.style.padding = '12px';
    loadMoreBtn.style.textAlign = 'center';
    loadMoreBtn.style.width = '100%';
    loadMoreBtn.textContent = `Load More (+${Math.min(60, facilities.length - state.renderedCardLimit)} of ${facilities.length.toLocaleString()})`;
    loadMoreBtn.addEventListener('click', () => {
      state.renderedCardLimit += 60;
      renderCardsList(facilities);
    });
    container.appendChild(loadMoreBtn);
  }
}

// Populate State filter dropdown
function populateStateDropdown() {
  const select = document.getElementById('stateFilterSelect');
  if (!select) return;
  const currentVal = state.activeState || select.value || 'all';

  // Read existing options to avoid duplicates
  const existingValues = new Set(Array.from(select.options).map(o => o.value.trim().toLowerCase()));

  const statesSet = new Set();
  state.hospitals.forEach(h => {
    if (h.state && !existingValues.has(h.state.trim().toLowerCase())) {
      statesSet.add(h.state.trim());
    }
  });

  const sortedStates = Array.from(statesSet).sort();
  sortedStates.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    select.appendChild(opt);
    existingValues.add(s.toLowerCase());
  });

  select.value = currentVal;
}

// ==========================================================================
// Facility Details Modal
// ==========================================================================
function showFacilityDetails(h) {
  state.selectedHospital = h;
  const modal = document.getElementById('facilityDetailModal');

  document.getElementById('facilityDetailName').textContent = h.name;
  document.getElementById('facilityDetailCategory').textContent = h.category || 'General';
  document.getElementById('facilityDetailCareType').textContent = h.care_type || 'Hospital';

  // Distance banner
  const distWrap = document.getElementById('facilityDetailDistanceWrap');
  if (h.distanceKm !== undefined) {
    distWrap.style.display = 'flex';
    document.getElementById('facilityDetailDistance').textContent = `${formatDistance(h.distanceKm)} from your location`;
  } else {
    distWrap.style.display = 'none';
  }

  // Address & metadata
  document.getElementById('facilityDetailAddress').textContent = h.address || 'Not specified';
  document.getElementById('facilityDetailLocation').textContent = `${h.district ? `${h.district}, ` : ''}${h.state}`;
  document.getElementById('facilityDetailPincode').textContent = h.pincode || 'N/A';
  document.getElementById('facilityDetailPhone').textContent = h.phone && h.phone !== '0' ? h.phone : 'Not available';

  // Optional fields
  toggleDetailField('facilityDetailAmbulanceWrap', 'facilityDetailAmbulance', h.ambulance);
  toggleDetailField('facilityDetailBloodBankWrap', 'facilityDetailBloodBank', h.bloodbank);
  toggleDetailField('facilityDetailBedsWrap', 'facilityDetailBeds', h.beds);
  toggleDetailField('facilityDetailSystemWrap', 'facilityDetailSystem', h.system);

  // Specialties
  const specsWrap = document.getElementById('facilityDetailSpecialtiesWrap');
  const specsContainer = document.getElementById('facilityDetailSpecialties');
  if (h.specialties && h.specialties !== '0') {
    specsWrap.style.display = 'block';
    specsContainer.innerHTML = h.specialties.split(',').map(s => `<span class="tag-bubble">${s.trim()}</span>`).join('');
  } else {
    specsWrap.style.display = 'none';
  }

  // Facilities
  const facsWrap = document.getElementById('facilityDetailFacilitiesWrap');
  const facsContainer = document.getElementById('facilityDetailFacilities');
  if (h.facilities && h.facilities !== '0') {
    facsWrap.style.display = 'block';
    facsContainer.innerHTML = h.facilities.split(',').map(f => `<span class="tag-bubble">${f.trim()}</span>`).join('');
  } else {
    facsWrap.style.display = 'none';
  }

  // Call Link
  const callLink = document.getElementById('facilityDetailCallLink');
  if (h.phone && h.phone !== '0') {
    callLink.href = `tel:${h.phone.replace(/[^0-9+]/g, '')}`;
    callLink.style.display = 'flex';
  } else {
    callLink.style.display = 'none';
  }

  // Route button in modal
  document.getElementById('facilityDetailRouteBtn').onclick = () => {
    modal.style.display = 'none';
    routeToHospital(h);
  };

  modal.style.display = 'flex';
}

function toggleDetailField(wrapId, valId, value) {
  const wrap = document.getElementById(wrapId);
  const val = document.getElementById(valId);
  if (value && value !== '0') {
    wrap.style.display = 'flex';
    val.textContent = value;
  } else {
    wrap.style.display = 'none';
  }
}

// Window globally exposed helper functions for inline popup onclicks
window.appTriggerRoute = function(id) {
  const h = state.hospitals.find(item => item.id === id);
  if (h) routeToHospital(h);
};

window.appShowDetails = function(id) {
  const h = state.hospitals.find(item => item.id === id);
  if (h) showFacilityDetails(h);
};

window.appExpandDistance = function(dist) {
  const sel = document.getElementById('distanceFilterSelect');
  if (sel) sel.value = dist;
  state.activeDistance = String(dist);
  state.renderedCardLimit = 60;
  applyFilters();
};

window.appClearSearch = function() {
  const inp = document.getElementById('facilitySearchInput');
  if (inp) inp.value = '';
  const clr = document.getElementById('clearSearchBtn');
  if (clr) clr.style.display = 'none';
  state.searchQuery = '';
  state.renderedCardLimit = 60;
  applyFilters();
};

window.appResetAllFilters = function() {
  const btn = document.getElementById('resetFiltersBtn');
  if (btn) btn.click();
};

// ==========================================================================
// Event Listeners
// ==========================================================================
function setupEventListeners() {
  // Locate Me Button
  document.getElementById('headerLocateBtn').addEventListener('click', () => locateUser(true));

  // Live Tracking Floating Button
  document.getElementById('liveTrackingBtn').addEventListener('click', toggleLiveTracking);

  // Recenter Map
  document.getElementById('recenterBtn').addEventListener('click', () => {
    if (state.userCoords) {
      map.flyTo(state.userCoords, 14);
    } else {
      map.flyTo(CONFIG.DEFAULT_CENTER, CONFIG.DEFAULT_ZOOM);
    }
  });

  // Layer Picker Toggle
  const layerBtn = document.getElementById('layerToggleBtn');
  const layerModal = document.getElementById('layerPickerModal');
  layerBtn.addEventListener('click', () => {
    layerModal.style.display = layerModal.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('closeLayerPicker').addEventListener('click', () => {
    layerModal.style.display = 'none';
  });

  // Layer Radios
  document.querySelectorAll('input[name="mapTileLayer"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const selected = e.target.value;
      Object.keys(tileLayers).forEach(k => map.removeLayer(tileLayers[k]));
      if (tileLayers[selected]) {
        tileLayers[selected].addTo(map);
      }
      layerModal.style.display = 'none';
    });
  });

  // City Quick Jump
  document.getElementById('cityQuickJump').addEventListener('change', (e) => {
    const val = e.target.value;
    if (!val) return;
    const [lat, lng] = val.split(',').map(Number);
    updateUserLocation(lat, lng, 100, true);
    showToast(`Jumped to city coordinates: ${lat}, ${lng}`);
  });

  // Search input with debounce
  const searchInput = document.getElementById('facilitySearchInput');
  const clearBtn = document.getElementById('clearSearchBtn');
  let searchTimer;

  searchInput.addEventListener('input', (e) => {
    const val = e.target.value;
    clearBtn.style.display = val ? 'block' : 'none';
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.searchQuery = val;
      state.renderedCardLimit = 60;
      applyFilters();
    }, 250);
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.style.display = 'none';
    state.searchQuery = '';
    state.renderedCardLimit = 60;
    applyFilters();
  });

  // Category filter chips
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.activeCategory = chip.dataset.category;
      state.renderedCardLimit = 60;
      applyFilters();
    });
  });

  // State, Distance & Sort Selects
  document.getElementById('stateFilterSelect').addEventListener('change', (e) => {
    state.activeState = e.target.value;
    state.renderedCardLimit = 60;
    applyFilters();
  });

  document.getElementById('distanceFilterSelect').addEventListener('change', (e) => {
    state.activeDistance = e.target.value;
    if (state.activeDistance !== 'all' && !state.userCoords) {
      showToast('Getting GPS location to calculate radius...', 'info');
      locateUser(false);
    }
    state.renderedCardLimit = 60;
    applyFilters();
  });

  document.getElementById('sortFilterSelect').addEventListener('change', (e) => {
    state.activeSort = e.target.value;
    applyFilters();
  });

  // Reset Filters
  document.getElementById('resetFiltersBtn').addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.style.display = 'none';
    state.searchQuery = '';
    state.activeCategory = 'all';
    state.activeState = 'all';
    state.activeDistance = 'all';
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    document.querySelector('.filter-chip[data-category="all"]').classList.add('active');
    document.getElementById('stateFilterSelect').value = 'all';
    document.getElementById('distanceFilterSelect').value = 'all';
    state.renderedCardLimit = 60;
    applyFilters();
  });

  // Sidebar Toggle on Desktop & Mobile
  const sidebar = document.getElementById('appSidebar');
  document.getElementById('sidebarToggleBtn').addEventListener('click', () => {
    if (window.innerWidth <= 900) {
      sidebar.classList.toggle('mobile-open');
    } else {
      sidebar.classList.toggle('collapsed');
      setTimeout(() => map.invalidateSize(), 300);
    }
  });

  // Mobile Bottom Tab Bar
  document.querySelectorAll('.mobile-tab-btn').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.mobile-tab-btn').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const target = tab.dataset.tab;
      if (target === 'map') {
        sidebar.classList.remove('mobile-open');
      } else if (target === 'list') {
        sidebar.classList.add('mobile-open');
      } else if (target === 'locate') {
        sidebar.classList.remove('mobile-open');
        locateUser(true);
      } else if (target === 'route') {
        if (state.activeRoute) {
          document.getElementById('directionsModal').style.display = 'flex';
        } else {
          showToast('Select a hospital to calculate shortest path route');
        }
      } else if (target === 'sync') {
        document.getElementById('dataSyncModal').style.display = 'flex';
      }
    });
  });

  // Route Floating Card Actions
  document.getElementById('clearRouteBtn').addEventListener('click', clearRouteLines);
  document.getElementById('viewTurnByTurnBtn').addEventListener('click', () => {
    if (state.activeRoute) {
      document.getElementById('directionsModal').style.display = 'flex';
    }
  });
  document.getElementById('routePanelBtn').addEventListener('click', () => {
    if (state.activeRoute) {
      document.getElementById('directionsModal').style.display = 'flex';
    }
  });

  // Open Native Google Maps
  const openInGoogleMaps = () => {
    if (!state.selectedHospital) return;
    const dest = `${state.selectedHospital.lat},${state.selectedHospital.lng}`;
    let url = `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
    if (state.userCoords) {
      url += `&origin=${state.userCoords[0]},${state.userCoords[1]}`;
    }
    window.open(url, '_blank');
  };

  document.getElementById('openNativeMapsBtn').addEventListener('click', openInGoogleMaps);
  document.getElementById('directionsGoogleMapsBtn').addEventListener('click', openInGoogleMaps);

  // Travel Mode Tabs in Directions Modal (Driving vs Walking)
  document.querySelectorAll('.travel-mode-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.travel-mode-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const mode = tab.dataset.mode;
      if (state.selectedHospital) {
        routeToHospital(state.selectedHospital, mode);
      }
    });
  });

  // Modal Closures
  setupModalClose('directionsModal', 'closeDirectionsBtn', 'closeDirectionsBackdrop');
  setupModalClose('facilityDetailModal', 'closeFacilityBtn', 'closeFacilityBackdrop');
  setupModalClose('dataSyncModal', 'closeSyncBtn', 'closeSyncBackdrop');
  document.getElementById('directionsClearBtn').addEventListener('click', () => {
    clearRouteLines();
    document.getElementById('directionsModal').style.display = 'none';
  });

  // Close GPS HUD
  document.getElementById('closeGpsHud').addEventListener('click', () => {
    document.getElementById('gpsHudCard').style.display = 'none';
  });

  // Data Source Badge click -> opens sync modal
  document.getElementById('dataSourceBadge').addEventListener('click', () => {
    document.getElementById('dataSyncModal').style.display = 'flex';
  });

  // Copy API Key
  document.getElementById('copyApiKeyBtn').addEventListener('click', () => {
    const key = document.getElementById('apiKeyInput').value;
    navigator.clipboard.writeText(key).then(() => showToast('API Key copied to clipboard!'));
  });

  // India State Boundaries Overlay Checkbox
  const indiaOverlayCb = document.getElementById('indiaOverlayCheckbox');
  if (indiaOverlayCb) {
    indiaOverlayCb.addEventListener('change', (e) => {
      if (!indiaBoundaryLayer) return;
      if (e.target.checked) {
        map.addLayer(indiaBoundaryLayer);
        showToast('India State boundaries overlay enabled');
      } else {
        map.removeLayer(indiaBoundaryLayer);
        showToast('India State boundaries overlay disabled');
      }
    });
  }

  // Active API Resource selector
  const apiResSelect = document.getElementById('apiResourceSelect');
  if (apiResSelect) {
    apiResSelect.addEventListener('change', (e) => {
      state.activeResourceId = e.target.value;
      const isHealthCentres = e.target.value === CONFIG.HEALTH_CENTRES_RES_ID;
      showToast(`Selected: ${isHealthCentres ? 'All India Health Centres Directory' : 'National Hospital Directory'}`);
    });
  }

  // Offline Dataset Selector
  const offlineSelect = document.getElementById('offlineDatasetSelect');
  if (offlineSelect) {
    offlineSelect.addEventListener('change', async (e) => {
      const mode = e.target.value;
      if (mode === 'unified') {
        state.activeDatasetFile = CONFIG.FALLBACK_DATA_FULL;
        showToast('Switching to Unified 147k+ Facilities (Gov + HDX/OSM)...');
        await loadFallbackDataset(state.activeDatasetFile);
      } else if (mode === 'gov') {
        state.activeDatasetFile = CONFIG.FALLBACK_DATA_PATH;
        showToast('Switching to National Directory 47k+ Facilities (Gov Only)...');
        await loadFallbackDataset(state.activeDatasetFile);
      } else if (mode === 'failsafe') {
        if (window.DEFAULT_HOSPITALS_DATA && window.DEFAULT_HOSPITALS_DATA.length > 0) {
          state.hospitals = [...window.DEFAULT_HOSPITALS_DATA];
          calculateDistances();
          populateStateDropdown();
          applyFilters();
          updateDataSourceStatus('fallback', `Fast Failsafe (${state.hospitals.length.toLocaleString()} facilities)`);
          showToast(`Switched to Fast Failsafe (${state.hospitals.length.toLocaleString()} facilities)`);
        }
      }
    });
  }

  // Manual Trigger API Sync
  document.getElementById('triggerApiSyncBtn').addEventListener('click', async () => {
    const isHealthCentres = state.activeResourceId === CONFIG.HEALTH_CENTRES_RES_ID;
    showToast(`Fetching latest from ${isHealthCentres ? 'All India Health Centres' : 'National Hospital Directory'} API...`);
    await loadData();
    document.getElementById('dataSyncModal').style.display = 'none';
  });

  // Reload Fallback Dataset
  document.getElementById('loadFallbackCsvBtn').addEventListener('click', async () => {
    await loadFallbackDataset();
    applyFilters();
    document.getElementById('dataSyncModal').style.display = 'none';
  });

  // Custom CSV or GeoJSON Upload
  const csvInput = document.getElementById('customCsvInput');
  const browseCsvBtn = document.getElementById('browseCsvBtn');
  if (browseCsvBtn && csvInput) {
    browseCsvBtn.addEventListener('click', () => csvInput.click());
    csvInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      showToast(`Reading ${file.name}...`);
      const fileName = file.name.toLowerCase();

      if (fileName.endsWith('.geojson') || fileName.endsWith('.json')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const parsed = JSON.parse(event.target.result);
            let imported = [];
            if (parsed.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
              imported = convertGeoJsonFeatures(parsed.features);
            } else if (Array.isArray(parsed)) {
              imported = parsed;
            }
            if (imported.length > 0) {
              mergeApiRecords(imported);
              applyFilters();
              showToast(`Imported ${imported.length.toLocaleString()} facilities from GeoJSON!`);
              document.getElementById('dataSyncModal').style.display = 'none';
            } else {
              showToast('No valid health facilities found in file', 'error');
            }
          } catch (err) {
            showToast('Error reading GeoJSON: ' + err.message, 'error');
          }
        };
        reader.readAsText(file);
      } else {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            if (results.data && results.data.length > 0) {
              processApiRecords(results.data);
              applyFilters();
              showToast(`Successfully imported ${results.data.length.toLocaleString()} rows from CSV!`);
              document.getElementById('dataSyncModal').style.display = 'none';
            }
          },
          error: (err) => {
            showToast('Error parsing CSV: ' + err.message, 'error');
          }
        });
      }
    });
  }

  // About Developer & Legal Modal Triggers
  const headerAboutBtn = document.getElementById('headerAboutBtn');
  if (headerAboutBtn) headerAboutBtn.addEventListener('click', () => openLegalModal('tab-developer'));

  const openAboutCardBtn = document.getElementById('openAboutCardBtn');
  if (openAboutCardBtn) openAboutCardBtn.addEventListener('click', () => openLegalModal('tab-developer'));

  const linkDisclaimer = document.getElementById('linkDisclaimer');
  if (linkDisclaimer) linkDisclaimer.addEventListener('click', (e) => { e.preventDefault(); openLegalModal('tab-disclaimer'); });

  const linkPrivacy = document.getElementById('linkPrivacy');
  if (linkPrivacy) linkPrivacy.addEventListener('click', (e) => { e.preventDefault(); openLegalModal('tab-privacy'); });

  const linkTerms = document.getElementById('linkTerms');
  if (linkTerms) linkTerms.addEventListener('click', (e) => { e.preventDefault(); openLegalModal('tab-terms'); });

  setupModalClose('aboutLegalModal', 'closeAboutLegalBtn', 'closeAboutLegalBackdrop');

  // Legal Modal Tab Switching
  document.querySelectorAll('.legal-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      openLegalModal(btn.dataset.tab);
    });
  });

  // Copy Developer Email Action
  const copyDevEmailBtn = document.getElementById('copyDevEmailBtn');
  if (copyDevEmailBtn) {
    copyDevEmailBtn.addEventListener('click', () => {
      navigator.clipboard.writeText('arka.doctor@gmail.com').then(() => {
        showToast('Email copied: arka.doctor@gmail.com');
      }).catch(() => {
        showToast('arka.doctor@gmail.com');
      });
    });
  }
}

// Convert GeoJSON Features to App Facility Format
function convertGeoJsonFeatures(features) {
  let nextId = 900000;
  return features.map(f => {
    const props = f.properties || {};
    let lat = 0, lng = 0;
    if (f.geometry && f.geometry.coordinates) {
      if (f.geometry.type === 'Point') {
        lng = f.geometry.coordinates[0];
        lat = f.geometry.coordinates[1];
      } else if (f.geometry.coordinates[0] && f.geometry.coordinates[0][0]) {
        lng = f.geometry.coordinates[0][0][0];
        lat = f.geometry.coordinates[0][0][1];
      }
    }
    return {
      id: nextId++,
      name: props.name || props.facility_name || 'Health Facility',
      lat: Number(lat),
      lng: Number(lng),
      state: props.adm1_name || props.state || '',
      district: props.adm2_name || props.district || '',
      category: props.operator_type === 'public' ? 'Public / Government' : (props.operator_type === 'private' ? 'Private' : 'General'),
      care_type: props.amenity || props.healthcare || 'Hospital',
      system: props.healthcare_speciality || 'Allopathic',
      source: 'Imported GeoJSON'
    };
  }).filter(h => h.lat !== 0 && h.lng !== 0 && h.name);
}

// Open About & Legal Modal to a specific tab
function openLegalModal(tabId = 'tab-developer') {
  const modal = document.getElementById('aboutLegalModal');
  if (!modal) return;
  modal.style.display = 'flex';

  document.querySelectorAll('.legal-tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabId);
  });
  document.querySelectorAll('.legal-tab-content').forEach(c => {
    c.classList.toggle('active', c.id === tabId);
  });
}

function setupModalClose(modalId, btnId, backdropId) {
  const modal = document.getElementById(modalId);
  const btn = document.getElementById(btnId);
  const backdrop = document.getElementById(backdropId);

  if (btn) btn.addEventListener('click', () => modal.style.display = 'none');
  if (backdrop) backdrop.addEventListener('click', () => modal.style.display = 'none');
}

// ==========================================================================
// Toast Notification Utility
// ==========================================================================
function showToast(message, type = 'info') {
  let toast = document.getElementById('appToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'appToast';
    toast.style.cssText = `
      position: fixed;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%) translateY(30px);
      background: rgba(15, 23, 42, 0.9);
      color: #ffffff;
      padding: 10px 18px;
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 600;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
      z-index: 3000;
      opacity: 0;
      transition: all 0.25s ease;
      display: flex;
      align-items: center;
      gap: 8px;
      max-width: 90%;
      pointer-events: none;
    `;
    document.body.appendChild(toast);
  }

  let icon = '<i class="fa-solid fa-circle-info" style="color: #38bdf8;"></i>';
  if (type === 'error') icon = '<i class="fa-solid fa-circle-exclamation" style="color: #f43f5e;"></i>';

  toast.innerHTML = `${icon} <span>${message}</span>`;
  toast.style.opacity = '1';
  toast.style.transform = 'translateX(-50%) translateY(0)';

  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
  }, 3200);
}

// ==========================================================================
// PWA & Service Worker
// ==========================================================================
function setupPWA() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(err => {
        console.log('SW registration note:', err);
      });
    });
  }

  // Handle mobile PWA install prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installBtn = document.getElementById('pwaInstallBtn');
    installBtn.style.display = 'flex';
    installBtn.addEventListener('click', () => {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          installBtn.style.display = 'none';
        }
        deferredPrompt = null;
      });
    });
  });
}
