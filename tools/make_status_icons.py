# Run from the AboveVTT-MCP folder: python tools/make_status_icons.py extension/icons/icon128.png extension/icons/status  (needs Pillow)
# Builds the toolbar icons with "MCP" drawn into them: AboveVTT's black rounded square and red "A",
# with the A made smaller to leave room for the letters underneath. One 16 px and one 32 px image per state.
import sys
from PIL import Image, ImageDraw
SRC, OUT = sys.argv[1], sys.argv[2]
STATES = {"ready": "#4caf50", "nodm": "#ff9800", "connecting": "#ffeb3b", "off": "#9e9e9e", "badtoken": "#f44336"}
# 5-pixel-tall letters, drawn pixel by pixel so they stay sharp at 16 px
GLYPHS = {
    "M": ["X...X", "XX.XX", "X.X.X", "X...X", "X...X"],
    "C": [".XX", "X..", "X..", "X..", ".XX"],
    "P": ["XX.", "X.X", "XX.", "X..", "X.."],
}
src = Image.open(SRC).convert("RGBA")
px = src.load()
# the red A's bounding box in the 128 px original
xs, ys = [], []
for y in range(src.height):
    for x in range(src.width):
        r, g, b, a = px[x, y]
        if a > 200 and r > 150 and g < 90 and b < 90: xs.append(x); ys.append(y)
a_box = (min(xs), min(ys), max(xs) + 1, max(ys) + 1)
letter_a = src.crop(a_box)
background = src.copy()
ImageDraw.Draw(background).rectangle(a_box, fill=(0, 0, 0, 255))  # black square without the A

def hexrgb(c): return tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) + (255,)

def make(size, color, scale):
    im = background.resize((size, size), Image.LANCZOS)
    # text: 13 x 5 units, `scale` pixels per unit, centred near the bottom
    tw, th = 13 * scale, 5 * scale
    tx, ty = (size - tw) // 2, size - th - max(1, size // 16) - (1 if size >= 32 else 0)
    # the A fills the space above the text
    top = max(1, size // 10)
    ah = ty - top - max(1, size // 16)
    aw = round(letter_a.width * ah / letter_a.height)
    im.alpha_composite(letter_a.resize((aw, ah), Image.LANCZOS), ((size - aw) // 2, top))
    d = ImageDraw.Draw(im)
    x = tx
    for ch in "MCP":
        g = GLYPHS[ch]
        for gy, row in enumerate(g):
            for gx, cell in enumerate(row):
                if cell == "X":
                    d.rectangle((x + gx * scale, ty + gy * scale, x + (gx + 1) * scale - 1, ty + (gy + 1) * scale - 1), fill=hexrgb(color))
        x += (len(g[0]) + 1) * scale
    return im

import os
os.makedirs(OUT, exist_ok=True)
for state, color in STATES.items():
    make(16, color, 1).save(f"{OUT}/{state}16.png", optimize=True)
    make(32, color, 2).save(f"{OUT}/{state}32.png", optimize=True)
print("made", len(STATES) * 2, "icons in", OUT)
