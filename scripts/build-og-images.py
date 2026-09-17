#!/usr/bin/env python3
"""Generate a per-page Open Graph image for every companion page.

Before this script, all 45 pages under site/ shared one og-image.png, so
every link preview of getundercut.sh looked identical no matter which
companion page was shared. This renders one 1200x630 card per companion
page into site/og/<slug>.png, carrying that client's name.

The card follows the "per-page variant" on the brand kit's
"10 Profiles & previews" board: dark ground, a band down the left ~39% of
the width, and on the right a Fragment Mono eyebrow, "Undercut for
<client>" in Bricolage Grotesque at weight 500 with -0.028em tracking,
and a mono footer line.

  pip install cairosvg pillow   # plus the two OFL fonts, see FONTS below
  python3 scripts/build-og-images.py

Notes on the four judgement calls in here, so the next person does not
have to re-derive them:

  * SOURCE OF TRUTH. The client list and every client's display name come
    from site/clients.json -- never a list in this file. The name used is
    labels.llms, which is the one label variant that matches all 34
    companion pages' own <title> exactly (labels.faq carries disambiguating
    parentheticals like "Windsurf (Cascade)" that would read oddly in a
    link preview, and labels.agents shortens some names). Add a client to
    clients.json and this script picks it up; scripts/validate-client-list.js
    keeps that list honest and scripts/validate-og-images.js checks that
    every page actually points at its own card.

  * NO PHOTOGRAPH. The board draws this template with a licensed brand
    frame in the left band. Those frames live in a private repo, and
    vendoring them into this public one is a publication decision for a
    human to make, not a build script. So the band carries the tier-ladder
    motif instead -- three segments with the cheap tier filled. A clean
    typographic card beats a broken image reference, and this keeps the
    generator reproducible from a clone of this repo alone.

  * TYPE SCALE. The brand board draws the OG cards as 600x315 units,
    i.e. at 50% of the 1200x630 export it labels them with, so every size
    on the board doubles here: the 25px headline becomes 50px, the 10px
    eyebrow 20px, the 10.5px footer 21px. Taking the board's numbers
    literally at full size would put a 25px headline on a 630px-tall card,
    which is illegible at the ~500px width most platforms render a preview
    at.

  * EIGHT-BIT OUTPUT. cairosvg writes 32-bit RGBA. Pillow requantises to a
    256-colour adaptive palette, which roughly thirds the bytes with no
    visible difference at preview size and leaves headroom under the
    200KB-per-file budget if a photograph is ever added to the band.
"""

import json
import pathlib
import subprocess
import sys

try:
    import cairosvg
except ImportError:  # pragma: no cover - dependency guard
    sys.exit("needs cairosvg: pip install cairosvg")

try:
    from PIL import Image
except ImportError:  # pragma: no cover - dependency guard
    sys.exit("needs pillow: pip install pillow")

ROOT = pathlib.Path(__file__).resolve().parent.parent
CLIENTS = ROOT / "site" / "clients.json"
OUT = ROOT / "site" / "og"

WIDTH, HEIGHT = 1200, 630
BAND_W = 464  # 38.7% of the width, per the board's 232/600 split
PAD_X, PAD_TOP, PAD_BOTTOM = 64, 60, 60

# Budget per file. Each card is fetched only by a crawler unfurling a link,
# never by a browser rendering a page, but keep them small anyway.
MAX_BYTES = 200 * 1024

# Palette, from the brand board's dark surfaces. Deliberately not shared
# with build-brand-rasters.py's cream-ground palette: that one is the
# "instrument paper" system, this is the dark social ground.
GROUND = "#1c2027"
BAND = "#171b21"
PAPER = "#f2f0ec"
TEAL = "#03969d"
SEGMENT = "#2f343c"
MUTED = "#9a9ea4"

DISPLAY = "'Bricolage Grotesque','Helvetica Neue',Arial,sans-serif"
MONO = "'Fragment Mono',Menlo,monospace"

EYEBROW = "COMPANION GUIDE"
FOOTER = "Install in one command · getundercut.sh"

# FONTS: Bricolage Grotesque and Fragment Mono are both OFL on Google
# Fonts. Without them installed, cairosvg silently falls back to a generic
# sans and every card is off-brand -- so check and say so, loudly.
FONTS = ("Bricolage Grotesque", "Fragment Mono")


def check_fonts() -> None:
    try:
        listed = subprocess.run(
            ["fc-list", ":", "family"], capture_output=True, text=True, timeout=20
        ).stdout
    except Exception:
        print("  ! could not run fc-list; font check skipped")
        return
    missing = [f for f in FONTS if f.lower() not in listed.lower()]
    if missing:
        print(f"  ! MISSING FONTS {missing} - output will use fallbacks and be off-brand")
        print("    install the OFL originals from Google Fonts, then re-run")


def load_clients() -> list[tuple[str, str]]:
    """(slug, display name) for every companion page, from clients.json."""
    data = json.loads(CLIENTS.read_text())
    out = []
    for entry in data["clients"]:
        slug = entry["slug"]
        if not (ROOT / "site" / f"{slug}.html").exists():
            sys.exit(f"clients.json lists {slug} but site/{slug}.html does not exist")
        out.append((slug, entry["labels"]["llms"]))
    return out


def tier_ladder() -> str:
    """The left band: three equal rungs, only the cheap tier lit.

    Reads bottom-up as the router's ladder -- every unit starts on the
    cheap rung, and the two unlit rungs above are the tiers it only
    escalates to on evidence. Equal widths so it reads as a segmented
    ladder rather than as a bar chart of something.
    """
    rungs = (  # bottom-up: (label, fill, label colour)
        ("CHEAP", TEAL, GROUND),
        ("STANDARD", SEGMENT, MUTED),
        ("FRONTIER", SEGMENT, MUTED),
    )
    w = BAND_W - 2 * PAD_X
    h, gap = 34, 22
    span = len(rungs) * h + (len(rungs) - 1) * gap
    bottom = HEIGHT / 2 + span / 2 - h
    parts = [
        f'<rect width="{BAND_W}" height="{HEIGHT}" fill="{BAND}"/>',
        f'<rect x="{BAND_W - 1}" width="1" height="{HEIGHT}" fill="{SEGMENT}"/>',
    ]
    for i, (label, fill, ink) in enumerate(rungs):
        y = bottom - i * (h + gap)
        parts.append(
            f'<rect x="{PAD_X}" y="{y:.1f}" width="{w}" height="{h}" fill="{fill}"/>'
        )
        parts.append(
            f'<text x="{PAD_X + 14}" y="{y + 23:.1f}" font-family="{MONO}"'
            f' font-size="15" letter-spacing="1.2" fill="{ink}">{label}</text>'
        )
    return "\n  ".join(parts)


def card_svg(name: str) -> str:
    text_x = BAND_W + PAD_X
    # -0.028em of tracking at 50px. cairosvg wants user units, not em.
    tracking = -0.028 * 50
    return f"""<svg xmlns="http://www.w3.org/2000/svg"
  width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}">
  <rect width="{WIDTH}" height="{HEIGHT}" fill="{GROUND}"/>
  {tier_ladder()}
  <text x="{text_x}" y="{PAD_TOP + 22}" font-family="{MONO}" font-size="20"
    letter-spacing="2" fill="{MUTED}">{EYEBROW}</text>
  <text x="{text_x}" y="162" font-family="{DISPLAY}" font-size="50" font-weight="500"
    letter-spacing="{tracking:.2f}" fill="{PAPER}">Undercut for</text>
  <text x="{text_x}" y="220" font-family="{DISPLAY}" font-size="50" font-weight="500"
    letter-spacing="{tracking:.2f}" fill="{PAPER}">{name}</text>
  <text x="{text_x}" y="{HEIGHT - PAD_BOTTOM - 8}" font-family="{MONO}" font-size="21"
    fill="{MUTED}">{FOOTER}</text>
</svg>"""


def render(svg: str, dest: pathlib.Path) -> int:
    raw = cairosvg.svg2png(
        bytestring=svg.encode(), output_width=WIDTH, output_height=HEIGHT
    )
    dest.write_bytes(raw)
    with Image.open(dest) as im:
        flat = im.convert("RGB")
    flat.quantize(colors=256, dither=Image.FLOYDSTEINBERG).save(dest, optimize=True)
    return dest.stat().st_size


def main() -> None:
    check_fonts()
    clients = load_clients()
    OUT.mkdir(parents=True, exist_ok=True)

    # Anything in site/og/ that clients.json no longer lists is stale.
    expected = {f"{slug}.png" for slug, _ in clients}
    for stale in sorted(p for p in OUT.glob("*.png") if p.name not in expected):
        stale.unlink()
        print(f"  - removed stale {stale.relative_to(ROOT)}")

    total, over = 0, []
    for slug, name in clients:
        dest = OUT / f"{slug}.png"
        size = render(card_svg(name), dest)
        total += size
        if size > MAX_BYTES:
            over.append((dest.name, size))
        print(f"  {dest.name:28} {size / 1024:6.1f}KB  {name}")

    print(f"\nwrote {len(clients)} cards to {OUT.relative_to(ROOT)}/, {total / 1024:.0f}KB total")
    if over:
        for name, size in over:
            print(f"  ! {name} is {size / 1024:.0f}KB, over the {MAX_BYTES // 1024}KB budget")
        sys.exit(1)
    print("Each page's og:image/twitter:image must point at its own card;")
    print("node scripts/validate-og-images.js --check enforces that.")


if __name__ == "__main__":
    main()
