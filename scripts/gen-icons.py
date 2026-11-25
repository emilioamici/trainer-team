#!/usr/bin/env python3
"""Genera icone e favicon di FM Training: scritta «FM» bianca su sfondo antracite. Uso: python3 scripts/gen-icons.py (serve Pillow)."""
from PIL import Image, ImageDraw
import pathlib

BG = (43, 46, 53)       # antracite #2B2E35
FG = (255, 255, 255)
# lettere in un riquadro 540 × 380 (unità arbitrarie), tracciate a mano così non servono font
F = [[(0, 0), (200, 0), (200, 82), (82, 82), (82, 150), (165, 150), (165, 232), (82, 232), (82, 380), (0, 380)]]
M = [[(240, 380), (240, 0), (318, 0), (390, 170), (462, 0), (540, 0), (540, 380), (462, 380), (462, 150), (405, 285), (375, 285), (318, 150), (318, 380)]]
W, H = 540, 380

def draw(size, mode, scale):
    """mode: 'squircle' | 'full' | 'transparent'. scale: larghezza della scritta rispetto al lato."""
    S = 4
    n = size * S
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if mode == 'squircle':
        d.rounded_rectangle([0, 0, n - 1, n - 1], radius=int(n * 0.22), fill=BG + (255,))
    elif mode == 'full':
        d.rectangle([0, 0, n, n], fill=BG + (255,))
    k = n * scale / W
    ox = (n - W * k) / 2
    oy = (n - H * k) / 2
    for poly in F + M:
        d.polygon([(ox + x * k, oy + y * k) for x, y in poly], fill=FG + (255,))
    return im.resize((size, size), Image.LANCZOS)

root = pathlib.Path(__file__).resolve().parent.parent
targets = [
    ('public/icons/favicon-32.png', 32, 'squircle', 0.66),
    ('public/icons/favicon-64.png', 64, 'squircle', 0.66),
    ('public/icons/apple-touch-icon.png', 180, 'full', 0.62),  # iOS arrotonda da solo
    ('public/icons/icon-192.png', 192, 'squircle', 0.62),
    ('public/icons/icon-512.png', 512, 'squircle', 0.62),
    ('public/icons/icon-maskable-512.png', 512, 'full', 0.5),   # zona sicura della maschera
    ('public/brand/logo-mark.png', 512, 'squircle', 0.62),
]
for rel, size, mode, scale in targets:
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    draw(size, mode, scale).save(p, optimize=True)
    print('Generato', rel)

# favicon SVG con le stesse forme (viewBox 32)
k = 32 * 0.66 / W
ox = (32 - W * k) / 2
oy = (32 - H * k) / 2
paths = ''.join('M' + ' L'.join(f'{ox + x * k:.2f} {oy + y * k:.2f}' for x, y in poly) + 'Z ' for poly in F + M)
(root / 'public/icons/favicon.svg').write_text(
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">\n  <rect width="32" height="32" rx="7" fill="#2B2E35"/>\n  <path d="{paths.strip()}" fill="#ffffff"/>\n</svg>\n'
)
print('Generato public/icons/favicon.svg')
