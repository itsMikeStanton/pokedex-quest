#!/usr/bin/env python3
"""Generate the site icons (favicon + apple-touch-icon) as a Poke Ball.

Pure stdlib: draws at 4x and box-downsamples for smooth edges, then writes PNG
by hand. Re-run after editing the palette below; output is committed.
"""
import zlib, struct, math, os

BLACK = (26, 26, 30)
RED   = (238, 27, 36)
WHITE = (245, 245, 245)
BG    = (18, 32, 48)      # matches the dex card background
SS    = 4                 # supersample factor

def ball_px(x, y, R):
    """Colour at (x,y) from the ball centre, or None for transparent."""
    d = math.hypot(x, y)
    if d > R:                       return None
    if d >= R * 0.93:               return BLACK          # outer rim
    if d <= R * 0.30:                                     # centre button
        return WHITE if d <= R * 0.21 else BLACK
    if abs(y) <= R * 0.11:          return BLACK          # equator band
    return RED if y < 0 else WHITE

def render(size, bg=None, pad=0.06):
    """RGBA (bg=None) or RGB-on-bg pixel rows at `size`x`size`."""
    n = size * SS
    R = (n / 2) * (1 - pad)
    cx = cy = n / 2
    rows = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            acc = [0, 0, 0, 0]
            for sy in range(SS):                     # box filter over the 4x grid
                for sx in range(SS):
                    x = (px * SS + sx) + 0.5 - cx
                    y = (py * SS + sy) + 0.5 - cy
                    c = ball_px(x, y, R)
                    if c is None:
                        if bg: acc[0]+=bg[0]; acc[1]+=bg[1]; acc[2]+=bg[2]; acc[3]+=255
                    else:
                        acc[0]+=c[0]; acc[1]+=c[1]; acc[2]+=c[2]; acc[3]+=255
            k = SS * SS
            r, g, b, a = (v // k for v in acc)
            row += bytes((r, g, b)) if bg else bytes((r, g, b, a))
        rows.append(bytes(row))
    return rows

def write_png(path, rows, size, alpha):
    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    raw = b''.join(b'\x00' + r for r in rows)          # filter byte 0 per scanline
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6 if alpha else 2, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(raw, 9))
           + chunk(b'IEND', b''))
    open(path, 'wb').write(png)
    print(f'  {path}  {size}x{size}  {len(png):,} bytes')

os.chdir(os.path.dirname(os.path.abspath(__file__)) + '/..')
print('writing icons:')
for s in (32, 180):
    if s == 180:                                        # iOS composites transparency to black
        write_png('icon-180.png', render(s, bg=BG, pad=0.10), s, alpha=False)
    else:
        write_png('icon-32.png',  render(s), s, alpha=True)
