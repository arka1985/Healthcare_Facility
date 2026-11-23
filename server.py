#!/usr/bin/env python3
"""
AarogyaMap India - Local Development & Production Server
Features:
- Static file serving with optimal caching & MIME types for PWA
- Built-in CORS Proxy for api.data.gov.in to bypass browser cross-origin restrictions
"""

import http.server
import socketserver
import urllib.request
import urllib.parse
import json
import os
import sys

PORT = 8080
API_KEY_DEFAULT = "579b464db66ec23bdd00000110fade4c7b7240d551e6727d99c0993a"
RESOURCE_HEALTH_CENTRES = "db2e3a80-ea7a-4ead-987a-9564fcee3c08"
RESOURCE_HOSPITALS = "98fa254e-c5f8-4910-a19b-4828939b477d"

class AarogyaHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Enable CORS for local testing
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        
        # Proxy endpoint for api.data.gov.in
        if parsed.path.startswith('/api/gov-proxy'):
            query = urllib.parse.parse_qs(parsed.query)
            api_key = query.get('api-key', [API_KEY_DEFAULT])[0]
            limit = query.get('limit', ['100'])[0]
            offset = query.get('offset', ['0'])[0]
            fmt = query.get('format', ['json'])[0]
            res_type = query.get('resource', ['health_centres'])[0]
            
            res_id = RESOURCE_HEALTH_CENTRES if 'health' in res_type or res_type == RESOURCE_HEALTH_CENTRES else RESOURCE_HOSPITALS
            
            # Forward any filters
            filter_params = []
            for k, v in query.items():
                if k.startswith('filters['):
                    for val in v:
                        filter_params.append(f"{urllib.parse.quote(k)}={urllib.parse.quote(val)}")
            
            extra_query = '&' + '&'.join(filter_params) if filter_params else ''
            target_url = (
                f"https://api.data.gov.in/resource/{res_id}?"
                f"api-key={api_key}&format={fmt}&offset={offset}&limit={limit}{extra_query}"
            )
            
            try:
                req = urllib.request.Request(
                    target_url,
                    headers={'User-Agent': 'AarogyaMap-Healthcare-App/1.0'}
                )
                with urllib.request.urlopen(req, timeout=10) as response:
                    data = response.read()
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Cache-Control', 'max-age=3600')
                    self.end_headers()
                    self.wfile.write(data)
            except Exception as e:
                self.send_response(502)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                err_payload = json.dumps({
                    'status': 'error',
                    'message': f'Upstream API error: {str(e)}',
                    'fallback_recommended': True
                }).encode('utf-8')
                self.wfile.write(err_payload)
            return

        # Ensure correct MIME types for SVGs, JSON, and WebManifest
        if self.path.endswith('.svg'):
            self.extensions_map['.svg'] = 'image/svg+xml'
        elif self.path.endswith('.webmanifest') or self.path.endswith('manifest.json'):
            self.extensions_map['.json'] = 'application/manifest+json'
        elif self.path.endswith('.json'):
            self.extensions_map['.json'] = 'application/json'

        return super().do_GET()

def run_server(port=PORT):
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    socketserver.TCPServer.allow_reuse_address = True
    try:
        with socketserver.TCPServer(("", port), AarogyaHandler) as httpd:
            print(f"================================================================")
            print(f"  AarogyaMap India - Healthcare Facility Web & Mobile App")
            print(f"  Server running at: http://localhost:{port}/")
            print(f"  Theme: Sky Blue & Pink Watercolor")
            print(f"  Gov API Proxy: http://localhost:{port}/api/gov-proxy")
            print(f"  Default CSV Fallback: Loaded from data/hospitals_india.json")
            print(f"================================================================")
            httpd.serve_forever()
    except OSError as e:
        if port < 8090:
            print(f"Port {port} in use, trying {port+1}...")
            run_server(port+1)
        else:
            raise e

if __name__ == '__main__':
    p = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    run_server(p)
