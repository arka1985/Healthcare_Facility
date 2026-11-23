import math
import os
from PIL import Image, ImageDraw, ImageFilter

def create_logo_svg():
    svg_code = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 80" width="340" height="80">
  <defs>
    <linearGradient id="skyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="60%" stop-color="#0ea5e9"/>
      <stop offset="100%" stop-color="#0284c7"/>
    </linearGradient>
    <linearGradient id="pinkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fda4af"/>
      <stop offset="50%" stop-color="#fb7185"/>
      <stop offset="100%" stop-color="#f43f5e"/>
    </linearGradient>
    <linearGradient id="pinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="70%" stop-color="#0284c7"/>
      <stop offset="100%" stop-color="#f43f5e"/>
    </linearGradient>
    <filter id="softShadow" x="-20%" y="-20%" width="150%" height="150%">
      <feDropShadow dx="0" dy="2.5" stdDeviation="3.5" flood-color="#0284c7" flood-opacity="0.25"/>
    </filter>
  </defs>

  <!-- Left Icon Emblem -->
  <g transform="translate(6, 6)">
    <!-- Soft Watercolor Auroras -->
    <path d="M 34,4 C 54,6 66,18 64,36 C 62,54 48,66 30,66 C 12,66 2,52 4,34 C 6,16 18,2 34,4 Z" fill="#e0f2fe" opacity="0.85"/>
    <circle cx="50" cy="22" r="16" fill="#fce7f3" opacity="0.85"/>
    <circle cx="20" cy="46" r="14" fill="#ede9fe" opacity="0.5"/>

    <!-- Map Pin with Smooth Curvature & Drop Shadow -->
    <g filter="url(#softShadow)">
      <!-- Outer Location Pin -->
      <path d="M 34,10 C 20.7,10 10,20.7 10,34 C 10,50 34,68 34,68 C 34,68 58,50 58,34 C 58,20.7 47.3,10 34,10 Z" 
            fill="url(#pinGrad)"/>
      
      <!-- Inner White Circle Base -->
      <circle cx="34" cy="33" r="15" fill="#ffffff"/>

      <!-- Medical Cross with Rounded Corners -->
      <rect x="31" y="23" width="6" height="20" rx="3" fill="url(#pinkGrad)"/>
      <rect x="24" y="30" width="20" height="6" rx="3" fill="url(#pinkGrad)"/>

      <!-- Center Pulse Accent Dot -->
      <circle cx="34" cy="33" r="2.2" fill="#ffffff"/>
    </g>

    <!-- Sparkle Accent -->
    <path d="M 56,12 L 58,16 L 62,18 L 58,20 L 56,24 L 54,20 L 50,18 L 54,16 Z" fill="#38bdf8" opacity="0.9"/>
  </g>

  <!-- Text Wordmark -->
  <g transform="translate(82, 0)">
    <!-- Primary Brand Name -->
    <text x="0" y="42" font-family="'Plus Jakarta Sans', 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="28" font-weight="800" fill="#0f172a" letter-spacing="-0.6">
      Aarogya<tspan fill="#f43f5e" font-weight="800">Map</tspan>
    </text>

    <!-- Subtitle & Directory Badging -->
    <text x="1" y="60" font-family="'Plus Jakarta Sans', 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="10.5" font-weight="700" fill="#0284c7" letter-spacing="2.2">
      INDIA HEALTHCARE DIRECTORY
    </text>

    <!-- Decorative Accent Dots -->
    <circle cx="236" cy="34" r="4.5" fill="#f43f5e" opacity="0.85"/>
    <circle cx="244" cy="40" r="3" fill="#38bdf8" opacity="0.85"/>
    <circle cx="249" cy="33" r="2" fill="#10b981" opacity="0.85"/>
  </g>
</svg>'''
    with open('assets/cliparts/logo.svg', 'w', encoding='utf-8') as f:
        f.write(svg_code)
    print("Generated assets/cliparts/logo.svg")

def render_app_icon(size):
    # Supersample at 4x for ultra-sharp antialiasing
    scale = 4
    canvas_size = size * scale
    im = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)

    pad = int(canvas_size * 0.04)
    r = int(canvas_size * 0.22) # smooth squircle radius

    # 1. Subtle drop shadow for icon
    shadow = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow)
    sdraw.rounded_rectangle([pad, pad + int(canvas_size * 0.03), canvas_size - pad, canvas_size - pad + int(canvas_size * 0.03)], radius=r, fill=(14, 165, 233, 90))
    shadow = shadow.filter(ImageFilter.GaussianBlur(int(canvas_size * 0.04)))
    im = Image.alpha_composite(shadow, im)
    draw = ImageDraw.Draw(im)

    # 2. Main squircle background with watercolor Sky Blue -> Rose Pink gradient
    bg = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    bg_draw = ImageDraw.Draw(bg)
    
    # Draw linear gradient onto background
    for y in range(pad, canvas_size - pad):
        factor = (y - pad) / float(canvas_size - 2 * pad)
        # Interpolate from soft sky #e0f2fe (224, 242, 254) to soft pink #ffe4e6 (255, 228, 230)
        red = int(224 + (255 - 224) * factor)
        green = int(242 + (228 - 242) * factor)
        blue = int(254 + (230 - 254) * factor)
        bg_draw.line([(pad, y), (canvas_size - pad, y)], fill=(red, green, blue, 255))
    
    # Mask to rounded rectangle
    mask = Image.new('L', (canvas_size, canvas_size), 0)
    mdraw = ImageDraw.Draw(mask)
    mdraw.rounded_rectangle([pad, pad, canvas_size - pad, canvas_size - pad], radius=r, fill=255)
    bg.putalpha(mask)
    im = Image.alpha_composite(im, bg)
    draw = ImageDraw.Draw(im)

    # Inner border
    draw.rounded_rectangle([pad, pad, canvas_size - pad, canvas_size - pad], radius=r, outline=(255, 255, 255, 230), width=int(canvas_size * 0.015))

    # 3. Soft watercolor blob accents inside squircle
    wc_layer = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    wc_draw = ImageDraw.Draw(wc_layer)
    cx, cy = canvas_size // 2, canvas_size // 2
    
    # Sky blob top-left
    wc_draw.ellipse([cx - int(canvas_size * 0.38), cy - int(canvas_size * 0.42), cx + int(canvas_size * 0.1), cy + int(canvas_size * 0.1)], fill=(56, 189, 248, 70))
    # Pink blob bottom-right
    wc_draw.ellipse([cx - int(canvas_size * 0.1), cy - int(canvas_size * 0.1), cx + int(canvas_size * 0.42), cy + int(canvas_size * 0.38)], fill=(244, 63, 94, 65))
    wc_layer = wc_layer.filter(ImageFilter.GaussianBlur(int(canvas_size * 0.06)))
    # Clip to squircle mask
    wc_layer.putalpha(Image.composite(wc_layer.split()[3], mask, mask))
    im = Image.alpha_composite(im, wc_layer)
    draw = ImageDraw.Draw(im)

    # 4. Central Location Pin Emblem
    pin_w = int(canvas_size * 0.52)
    pin_h = int(canvas_size * 0.65)
    pin_top = cy - int(pin_h * 0.54)
    pin_cx = cx

    # Pin Shadow
    pin_shadow = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    ps_draw = ImageDraw.Draw(pin_shadow)
    ps_draw.ellipse([pin_cx - int(pin_w * 0.28), pin_top + pin_h - int(canvas_size * 0.04), pin_cx + int(pin_w * 0.28), pin_top + pin_h + int(canvas_size * 0.05)], fill=(2, 132, 199, 120))
    pin_shadow = pin_shadow.filter(ImageFilter.GaussianBlur(int(canvas_size * 0.03)))
    im = Image.alpha_composite(im, pin_shadow)
    draw = ImageDraw.Draw(im)

    # Generate gradient Pin Body (Sky Blue to Rose Coral)
    pin_layer = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    pdraw = ImageDraw.Draw(pin_layer)

    # Approximate pin shape polygon
    pin_r = pin_w // 2
    center_y = pin_top + pin_r
    tip_y = pin_top + pin_h

    # Build smooth pin polygon points
    points = []
    # Semi-circle top arc from angle 180 to 360
    for deg in range(160, 381, 2):
        rad = math.radians(deg)
        px = pin_cx + pin_r * math.cos(rad)
        py = center_y + pin_r * math.sin(rad)
        points.append((px, py))
    # Down to tip
    points.append((pin_cx, tip_y))

    # Draw gradient inside pin
    pin_mask = Image.new('L', (canvas_size, canvas_size), 0)
    p_mask_draw = ImageDraw.Draw(pin_mask)
    p_mask_draw.polygon(points, fill=255)

    pin_grad = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    pg_draw = ImageDraw.Draw(pin_grad)
    for y in range(pin_top, tip_y + 1):
        f = (y - pin_top) / float(tip_y - pin_top)
        # Gradient: Sky Blue #0284c7 (2, 132, 199) -> Pink #f43f5e (244, 63, 94)
        r_c = int(2 + (244 - 2) * f)
        g_c = int(132 + (63 - 132) * f)
        b_c = int(199 + (94 - 199) * f)
        pg_draw.line([(pin_cx - pin_r - 10, y), (pin_cx + pin_r + 10, y)], fill=(r_c, g_c, b_c, 255))
    pin_grad.putalpha(pin_mask)
    im = Image.alpha_composite(im, pin_grad)
    draw = ImageDraw.Draw(im)

    # 5. Inner White Shield Circle
    core_r = int(pin_r * 0.62)
    core_bbox = [pin_cx - core_r, center_y - core_r, pin_cx + core_r, center_y + core_r]
    draw.ellipse(core_bbox, fill=(255, 255, 255, 255))

    # 6. Vibrant Rose Pink Medical Cross
    cross_arm_w = int(core_r * 0.38)
    cross_len = int(core_r * 1.3)
    cross_r = cross_arm_w // 2

    # Vertical arm
    draw.rounded_rectangle([pin_cx - cross_r, center_y - cross_len // 2, pin_cx + cross_r, center_y + cross_len // 2], radius=cross_r, fill=(244, 63, 94, 255))
    # Horizontal arm
    draw.rounded_rectangle([pin_cx - cross_len // 2, center_y - cross_r, pin_cx + cross_len // 2, center_y + cross_r], radius=cross_r, fill=(244, 63, 94, 255))

    # Center white heart dot
    draw.ellipse([pin_cx - int(core_r * 0.16), center_y - int(core_r * 0.16), pin_cx + int(core_r * 0.16), center_y + int(core_r * 0.16)], fill=(255, 255, 255, 255))

    # Downsample using LANCZOS for maximum sharpness
    final_img = im.resize((size, size), Image.Resampling.LANCZOS)
    return final_img

def main():
    os.makedirs('assets/icons', exist_ok=True)
    os.makedirs('assets/cliparts', exist_ok=True)

    # 1. Generate modern SVG logo
    create_logo_svg()

    # 2. Generate high-res 512x512 PNG
    print("Rendering icon-512.png...")
    img512 = render_app_icon(512)
    img512.save('assets/icons/icon-512.png', 'PNG')

    # 3. Generate 192x192 PNG
    print("Rendering icon-192.png...")
    img192 = render_app_icon(192)
    img192.save('assets/icons/icon-192.png', 'PNG')

    # 4. Generate favicon.png (64x64)
    print("Rendering favicon.png...")
    img_fav = render_app_icon(64)
    img_fav.save('favicon.png', 'PNG')

    print("All icons generated successfully!")

if __name__ == '__main__':
    main()
