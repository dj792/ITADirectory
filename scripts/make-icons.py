#!/usr/bin/env python3
"""
Generate the site icons from ITA's own logo.

    pip install pillow --break-system-packages
    python3 scripts/make-icons.py

Committed rather than left as a one-off so the icons can be REGENERATED if ITA
ever revises their logo — the alternative is a set of binaries nobody can
reproduce and nobody dares touch.

── THE DESIGN, AND WHY ────────────────────────────────────────────────────

Source is `public/ita-logo.png`, ITA's horizontal lockup: the "ita" wordmark
with a two-diamond accent, then a tagline. Only the mark is used; the tagline is
unreadable at any icon size.

**White on an ITA-blue tile, not the logo on white.** The logo is dark grey
letters, which disappear against a dark browser tab. A filled tile in the brand
blue reads on both light and dark chrome and gives the mark a consistent shape
to sit in.

**THE ARTWORK CHANGES WITH SIZE, which is the whole point of a multi-size .ico.**
Rendering one image and downsampling it — what `Image.save(sizes=[...])` does,
and why this script writes the ICO container by hand — produced a 16px icon that
was unreadable mush. Worse, the "ita" alone at 16px reads as **"itc"**: the tail
on ITA's rounded "a" falls below one pixel and the letter becomes a c. A favicon
that spells the wrong name is worse than a soft one.

So:
  · **16 and 24px — the DIAMOND alone.** A simple geometric form is crisp at
    tab size and cannot be misread as the wrong letters.
  · **32px and up — the full lockup.** There is room for the letters to hold
    their shape, and the name is worth showing wherever it is legible.

Both halves are ITA's own mark, so the icon is recognizably theirs at every size.

**The Apple touch icon is square and opaque.** iOS applies its own corner radius
and composites onto white, so a rounded transparent PNG gets rounded twice and
shows pale corners.
"""

import io
import os
import struct
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(HERE, "public")
SOURCE = os.path.join(PUBLIC, "ita-logo.png")

# BRAND.blue from lib/brand.ts. Kept in step by hand — there is one number here
# and changing it in one place without the other is a visible mismatch.
BLUE = (1, 118, 189, 255)

# Column boundaries within the 390x87 logo, measured off the source rather than
# guessed: the mark ends at x=99 and the tagline begins at x=100.
MARK_RIGHT = 100


def to_white(img: Image.Image) -> Image.Image:
    """Recolor every inked pixel white, preserving the anti-aliased alpha."""
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    src, dst = img.load(), out.load()
    for y in range(img.size[1]):
        for x in range(img.size[0]):
            r, g, b, a = src[x, y]
            if a > 20:
                dst[x, y] = (255, 255, 255, a)
    return out


def trimmed(img: Image.Image) -> Image.Image:
    box = img.getbbox()
    return img.crop(box) if box else img


def glyphs():
    """The two marks used: the full lockup, and the diamond accent alone."""
    src = Image.open(SOURCE).convert("RGBA")
    full = trimmed(to_white(src.crop((0, 0, MARK_RIGHT, src.size[1]))))

    # The diamond is the blue ink inside the mark — found by color rather than
    # by hard-coded coordinates, so a re-exported logo doesn't silently shift it.
    px = src.load()
    xs, ys = [], []
    for y in range(src.size[1]):
        for x in range(MARK_RIGHT):
            r, g, b, a = px[x, y]
            if a > 150 and b > 120 and b - r > 60:
                xs.append(x)
                ys.append(y)
    if not xs:
        raise SystemExit("No blue diamond found in the logo — has it changed?")
    diamond = trimmed(to_white(src.crop((min(xs), min(ys), max(xs) + 1, max(ys) + 1))))
    return full, diamond


def tile(size: int, glyph: Image.Image, frac: float, rounded: bool = True) -> Image.Image:
    """One icon. Rendered at 8x and downsampled once — drawing straight at
    16px gives chewed edges that no amount of tweaking recovers."""
    s = size * 8
    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    if rounded:
        draw.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=BLUE)
    else:
        draw.rectangle([0, 0, s - 1, s - 1], fill=BLUE)
    w = int(s * frac)
    h = int(glyph.size[1] * (w / glyph.size[0]))
    g = glyph.resize((w, h), Image.LANCZOS)
    canvas.paste(g, ((s - w) // 2, (s - h) // 2), g)
    return canvas.resize((size, size), Image.LANCZOS)


def write_ico(path: str, images: dict[int, Image.Image]) -> None:
    """Write a multi-size .ico with DIFFERENT artwork per size.

    Pillow's own ICO writer takes one image and downsamples it, which is exactly
    what we are avoiding — hence assembling the container here. Each entry holds
    a PNG payload, which every browser since IE11 reads.
    """
    entries, payloads = [], []
    offset = 6 + 16 * len(images)
    for size, img in sorted(images.items()):
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        data = buf.getvalue()
        dim = 0 if size >= 256 else size  # 256 is encoded as 0
        entries.append(struct.pack("<BBBBHHII", dim, dim, 0, 0, 1, 32, len(data), offset))
        payloads.append(data)
        offset += len(data)
    with open(path, "wb") as fh:
        fh.write(struct.pack("<HHH", 0, 1, len(images)))
        for e in entries:
            fh.write(e)
        for p in payloads:
            fh.write(p)


def main() -> None:
    full, diamond = glyphs()

    # Small sizes take the diamond, larger ones the lockup. See the module note.
    ico = {
        16: tile(16, diamond, 0.70),
        24: tile(24, diamond, 0.68),
        32: tile(32, full, 0.64),
        48: tile(48, full, 0.64),
        64: tile(64, full, 0.64),
        128: tile(128, full, 0.64),
        256: tile(256, full, 0.64),
    }
    write_ico(os.path.join(PUBLIC, "favicon.ico"), ico)

    tile(512, full, 0.64).save(os.path.join(PUBLIC, "icon-512.png"))
    tile(192, full, 0.64).save(os.path.join(PUBLIC, "icon-192.png"))
    # `ita-icon.png` is the name `app/layout.tsx` has referenced since day one.
    tile(512, full, 0.64).save(os.path.join(PUBLIC, "ita-icon.png"))

    # iOS: opaque, square, slightly larger glyph — iOS rounds the corners itself.
    apple_rgba = tile(180, full, 0.72, rounded=False)
    apple = Image.new("RGB", (180, 180), BLUE[:3])
    apple.paste(apple_rgba, (0, 0), apple_rgba)
    apple.save(os.path.join(PUBLIC, "apple-touch-icon.png"))

    for name in ("favicon.ico", "ita-icon.png", "icon-192.png", "icon-512.png",
                 "apple-touch-icon.png"):
        path = os.path.join(PUBLIC, name)
        print(f"  {name:24} {os.path.getsize(path):>8,} bytes")


if __name__ == "__main__":
    main()
