import json
import re
import math
import unicodedata
import os

print("Starting deep deduplication across nationwide healthcare facility datasets...")

def clean_str(s):
    if not s:
        return ''
    return unicodedata.normalize('NFKD', str(s)).encode('ASCII', 'ignore').decode('utf-8').strip()

def tokenize(name):
    clean = clean_str(name).lower()
    tokens = set(re.findall(r'[a-z0-9]+', clean))
    stop = {
        'hospital', 'clinic', 'centre', 'center', 'health', 'the', 'and', 'dr', 'shri', 'of',
        'in', 'at', 'phc', 'chc', 'bphc', 'sdh', 'pvt', 'ltd', 'limited', 'private', 'general',
        'care', 'medical', 'services', 'unit', 'station', 'post', 'sub', 'mch', 'uhc', 'uphc', 'up'
    }
    return tokens - stop

def hav(lat1, lon1, lat2, lon2):
    R = 6371000 # in meters
    dLat = math.radians(lat2 - lat1)
    dLon = math.radians(lon2 - lon1)
    a = math.sin(dLat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dLon / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def deduplicate_list(facilities):
    grid = {}
    clean_list = []
    removed_count = 0

    for h in facilities:
        lat, lng = h.get('lat', 0), h.get('lng', 0)
        if lat == 0 and lng == 0:
            continue

        raw_name = clean_str(h.get('name', '')).lower()
        raw_clean = re.sub(r'[^a-z0-9]', '', raw_name)
        tokens = tokenize(raw_name)
        care = clean_str(h.get('care_type', '')).lower()

        # 1km grid cells
        cell_x, cell_y = int(lat * 100), int(lng * 100)

        is_dup = False
        # Check 3x3 surrounding cells (~1.5km radius)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                candidates = grid.get((cell_x + dx, cell_y + dy), [])
                for c in candidates:
                    dlat = abs(lat - c['lat'])
                    dlng = abs(lng - c['lng'])

                    # Check 1: Identical or near-identical coordinates (< 35m)
                    if dlat < 0.00035 and dlng < 0.00035:
                        if raw_clean == c['raw_clean']:
                            is_dup = True
                            break
                        if tokens and c['tokens'] and (tokens == c['tokens'] or tokens.issubset(c['tokens']) or c['tokens'].issubset(tokens)):
                            is_dup = True
                            break
                        if care == c['care'] and raw_clean[:6] == c['raw_clean'][:6]:
                            is_dup = True
                            break

                    # Check 2: Within 600m
                    if dlat < 0.006 and dlng < 0.006:
                        dist = hav(lat, lng, c['lat'], c['lng'])
                        if dist <= 600:
                            # Exact raw name match within 600m
                            if raw_clean == c['raw_clean']:
                                is_dup = True
                                break
                            # Core token overlap
                            if tokens and c['tokens']:
                                overlap = tokens & c['tokens']
                                if len(overlap) >= 1 and (len(tokens) <= 2 or len(overlap) >= 2 or len(list(overlap)[0]) >= 5):
                                    is_dup = True
                                    break
                if is_dup:
                    break

        if is_dup:
            removed_count += 1
        else:
            grid.setdefault((cell_x, cell_y), []).append({
                'lat': lat,
                'lng': lng,
                'raw_clean': raw_clean,
                'tokens': tokens,
                'care': care
            })
            clean_list.append(h)

    return clean_list, removed_count

# 1. Process data/all_health_facilities.json
all_path = 'data/all_health_facilities.json'
with open(all_path, 'r', encoding='utf-8') as f:
    all_data = json.load(f)

print(f"Loaded {len(all_data)} records from {all_path}")
clean_all, dups_all = deduplicate_list(all_data)
print(f"Removed {dups_all} duplicate facilities from all_health_facilities.json")
print(f"Clean unified dataset: {len(clean_all)} facilities")

with open(all_path, 'w', encoding='utf-8') as f:
    json.dump(clean_all, f, separators=(',', ':'))

# 2. Process data/hospitals_india.json
gov_path = 'data/hospitals_india.json'
with open(gov_path, 'r', encoding='utf-8') as f:
    gov_data = json.load(f)

print(f"Loaded {len(gov_data)} records from {gov_path}")
clean_gov, dups_gov = deduplicate_list(gov_data)
print(f"Removed {dups_gov} duplicate facilities from hospitals_india.json")
print(f"Clean government dataset: {len(clean_gov)} facilities")

with open(gov_path, 'w', encoding='utf-8') as f:
    json.dump(clean_gov, f, separators=(',', ':'))

# 3. Regenerate clean hospitals_failsafe.js
print("Generating clean failsafe dataset...")
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

# All District Hospitals
for h in clean_all:
    if h.get('care_type') == 'District Hospital':
        add_failsafe(h)

# All Sub-Divisional Hospitals
for h in clean_all:
    if h.get('care_type') == 'Sub-Divisional Hospital':
        add_failsafe(h)

# CHCs
chc_by_st = {}
for h in clean_all:
    if h.get('care_type') in ('Community Health Centre', 'Primary Health Centre'):
        chc_by_st.setdefault(h.get('state', ''), []).append(h)
for st, items in chc_by_st.items():
    for h in items[:25]:
        add_failsafe(h)

# Hospitals
hosp_by_st = {}
for h in clean_all:
    if h.get('care_type') == 'Hospital':
        hosp_by_st.setdefault(h.get('state', ''), []).append(h)
for st, items in hosp_by_st.items():
    for h in items[:25]:
        add_failsafe(h)

# High density in Kolkata/Dum Dum
for h in clean_all:
    lat, lng = float(h.get('lat', 0)), float(h.get('lng', 0))
    if abs(lat - 22.6062) < 0.25 and abs(lng - 88.4055) < 0.25:
        add_failsafe(h)

print(f"Clean failsafe dataset has {len(failsafe_items)} facilities.")
js_content = 'window.DEFAULT_HOSPITALS_DATA = ' + json.dumps(failsafe_items, separators=(',', ':')) + ';'
with open('data/hospitals_failsafe.js', 'w', encoding='utf-8') as f:
    f.write(js_content)

fs_size_kb = os.path.getsize('data/hospitals_failsafe.js') / 1024
print(f"Generated clean data/hospitals_failsafe.js ({fs_size_kb:.2f} KB)")
print("Deduplication completed successfully!")
