import json
import re
import unicodedata
import os

print("Starting merge and deduplication of Government API/CSV + HDX OpenStreetMap data...")

def clean_str(s):
    if not s:
        return ''
    return unicodedata.normalize('NFKD', str(s)).encode('ASCII', 'ignore').decode('utf-8').strip()

def tokenize(name):
    tokens = set(re.findall(r'[a-z0-9]+', clean_str(name).lower()))
    stop = {'hospital', 'clinic', 'centre', 'center', 'health', 'the', 'and', 'dr', 'shri', 'of', 'in', 'at', 'phc', 'chc', 'bphc', 'sdh'}
    return tokens - stop

def get_lat_lng(geom):
    if not geom or not geom.get('coordinates'):
        return None
    gtype = geom.get('type')
    coords = geom.get('coordinates')
    try:
        if gtype == 'Point':
            if len(coords) >= 2 and (coords[0] != 0 or coords[1] != 0):
                return float(coords[1]), float(coords[0])
        elif gtype == 'Polygon':
            pts = coords[0]
            if pts:
                return float(sum(p[1] for p in pts) / len(pts)), float(sum(p[0] for p in pts) / len(pts))
        elif gtype == 'MultiPolygon':
            all_pts = [p for poly in coords for ring in poly for p in ring]
            if all_pts:
                return float(sum(p[1] for p in all_pts) / len(all_pts)), float(sum(p[0] for p in all_pts) / len(all_pts))
    except Exception:
        pass
    return None

STATE_MAP = {
    'Andaman and Nicobar': 'Andaman and Nicobar Islands',
    'Andaman & Nicobar Islands': 'Andaman and Nicobar Islands',
    'Andhra Pradesh Old': 'Andhra Pradesh',
    'Dadra and Nagar Haveli': 'Dadra and Nagar Haveli and Daman and Diu',
    'Daman and Diu': 'Dadra and Nagar Haveli and Daman and Diu',
    'Dadra & Nagar Haveli': 'Dadra and Nagar Haveli and Daman and Diu',
    'Daman & Diu': 'Dadra and Nagar Haveli and Daman and Diu',
    'Jammu and Kashmir': 'Jammu & Kashmir'
}

def normalize_state(st):
    cleaned = clean_str(st).strip()
    return STATE_MAP.get(cleaned, cleaned)

# 1. Load primary government dataset
gov_path = 'data/hospitals_india.json'
with open(gov_path, 'r', encoding='utf-8') as f:
    gov_data = json.load(f)
print(f"Loaded {len(gov_data)} records from {gov_path}")

grid = {}
unified = []
next_id = 100000

for h in gov_data:
    lat, lng = h.get('lat', 0), h.get('lng', 0)
    st = normalize_state(h.get('state', ''))
    h['state'] = st
    h['source'] = 'data.gov.in'
    unified.append(h)
    if lat != 0 and lng != 0:
        cell = (int(lat * 100), int(lng * 100))
        grid.setdefault(cell, []).append((lat, lng, tokenize(h.get('name'))))

# 2. Load HDX / OSM GeoJSON
hdx_path = 'health_facilities_osm_geojson/health_facilities.geojson'
print(f"Loading HDX dataset from {hdx_path}...")
with open(hdx_path, 'r', encoding='utf-8') as f:
    hdx_data = json.load(f)

hdx_features = hdx_data.get('features', [])
print(f"Loaded {len(hdx_features)} features from HDX GeoJSON.")

dups_count = 0
added_count = 0

for feat in hdx_features:
    props = feat.get('properties', {})
    name = clean_str(props.get('name'))
    if not name:
        continue
    pt = get_lat_lng(feat.get('geometry'))
    if not pt:
        continue
    lat, lng = pt
    # Restrict to India bounding box
    if not (6.5 <= lat <= 37.5 and 68.0 <= lng <= 97.5):
        continue

    cell_x, cell_y = int(lat * 100), int(lng * 100)
    tokens = tokenize(name)
    is_dup = False
    
    # 3x3 cell neighborhood lookup
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for c_lat, c_lng, c_tokens in grid.get((cell_x + dx, cell_y + dy), []):
                dlat, dlng = abs(lat - c_lat), abs(lng - c_lng)
                if dlat < 0.0025 and dlng < 0.0025:
                    if (tokens and c_tokens and (tokens & c_tokens)) or (dlat < 0.0004 and dlng < 0.0004):
                        is_dup = True
                        break
            if is_dup:
                break
    
    if is_dup:
        dups_count += 1
        continue

    # Map category and care type
    amenity = props.get('amenity') or ''
    healthcare = props.get('healthcare') or ''
    specialty = props.get('healthcare_speciality') or ''
    op_type = props.get('operator_type') or ''

    care_type = 'Hospital'
    category = 'General'
    system = 'Allopathic'

    if amenity == 'hospital' or healthcare == 'hospital':
        care_type = 'Hospital'
        category = 'Public / Government' if op_type == 'public' else ('Private' if op_type == 'private' else 'General')
    elif amenity == 'clinic' or healthcare == 'clinic':
        care_type = 'Clinic'
        category = 'General'
    elif healthcare == 'centre' or amenity == 'health_post':
        care_type = 'Community Health Centre' if 'chc' in name.lower() else 'Primary Health Centre'
        category = 'Public / Government'
    elif amenity == 'pharmacy' or healthcare == 'pharmacy':
        care_type = 'Pharmacy'
        category = 'Pharmacy'
    elif amenity == 'dentist' or healthcare == 'dentist':
        care_type = 'Dental Clinic'
        category = 'Specialty'
    elif healthcare == 'alternative' or 'ayush' in specialty.lower() or 'ayur' in specialty.lower():
        care_type = 'AYUSH Centre'
        category = 'AYUSH'
        system = 'Ayurveda'
    elif healthcare == 'blood_bank' or amenity == 'blood_bank':
        care_type = 'Blood Bank'
        category = 'Blood Bank'

    st = normalize_state(props.get('adm1_name') or '')
    dist = clean_str(props.get('adm2_name') or '')
    addr = clean_str(props.get('addr_full') or props.get('addr_city') or '')

    item = {
        'id': next_id,
        'name': name,
        'lat': round(lat, 5),
        'lng': round(lng, 5),
        'state': st,
        'district': dist,
        'category': category,
        'care_type': care_type,
        'system': system,
        'source': 'HDX / OpenStreetMap'
    }
    if addr:
        item['address'] = addr
    if care_type == 'Blood Bank':
        item['bloodbank'] = '1'

    unified.append(item)
    grid.setdefault((cell_x, cell_y), []).append((lat, lng, tokens))
    next_id += 1
    added_count += 1

print(f"Deduplication complete: {dups_count} duplicates skipped. Added {added_count} unique facilities.")
print(f"Total Unified Facilities: {len(unified)}")

# 3. Export unified all_health_facilities.json
out_path = 'data/all_health_facilities.json'
print(f"Writing unified dataset to {out_path}...")
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(unified, f, separators=(',', ':'))

file_size_mb = os.path.getsize(out_path) / (1024 * 1024)
print(f"Successfully generated {out_path} ({file_size_mb:.2f} MB)")

# 4. Generate enhanced hospitals_failsafe.js
print("Generating high-coverage failsafe dataset (instant offline/slow network boot)...")
failsafe_items = []
seen_ids = set()

def add_failsafe(h):
    hid = h.get('id')
    if hid not in seen_ids:
        item = {
            'id': h['id'],
            'name': h['name'],
            'lat': round(float(h['lat']), 5),
            'lng': round(float(h['lng']), 5),
            'state': h.get('state', ''),
            'district': h.get('district', ''),
            'category': h.get('category', 'Public / Government'),
            'care_type': h.get('care_type', 'Hospital'),
            'system': h.get('system', 'Allopathic')
        }
        if h.get('source'):
            item['source'] = h['source']
        if h.get('phone') and h['phone'] != '0':
            item['phone'] = h['phone']
        if h.get('address'):
            item['address'] = h['address']
        if h.get('pincode'):
            item['pincode'] = h['pincode']
        if h.get('emergency'):
            item['emergency'] = h['emergency']
        if h.get('bloodbank'):
            item['bloodbank'] = h['bloodbank']
        failsafe_items.append(item)
        seen_ids.add(hid)

# A. All District Hospitals
for h in unified:
    if h.get('care_type') == 'District Hospital':
        add_failsafe(h)

# B. All Sub-Divisional Hospitals
for h in unified:
    if h.get('care_type') == 'Sub-Divisional Hospital':
        add_failsafe(h)

# C. CHCs & PHCs (sample across states)
chc_by_st = {}
for h in unified:
    if h.get('care_type') in ('Community Health Centre', 'Primary Health Centre'):
        chc_by_st.setdefault(h.get('state', ''), []).append(h)

for st, items in chc_by_st.items():
    for h in items[:30]:
        add_failsafe(h)

# D. Hospitals (sample across states)
hosp_by_st = {}
for h in unified:
    if h.get('care_type') == 'Hospital':
        hosp_by_st.setdefault(h.get('state', ''), []).append(h)

for st, items in hosp_by_st.items():
    for h in items[:30]:
        add_failsafe(h)

# E. High density in user area (Kolkata/Dum Dum/WB) & major metros
for h in unified:
    lat, lng = float(h.get('lat', 0)), float(h.get('lng', 0))
    if abs(lat - 22.6062) < 0.35 and abs(lng - 88.4055) < 0.35:
        add_failsafe(h)

print(f"Failsafe items count: {len(failsafe_items)}")
js_content = 'window.DEFAULT_HOSPITALS_DATA = ' + json.dumps(failsafe_items, separators=(',', ':')) + ';'
with open('data/hospitals_failsafe.js', 'w', encoding='utf-8') as f:
    f.write(js_content)

fs_size_kb = os.path.getsize('data/hospitals_failsafe.js') / 1024
print(f"Generated data/hospitals_failsafe.js ({fs_size_kb:.2f} KB)")
print("Done!")
