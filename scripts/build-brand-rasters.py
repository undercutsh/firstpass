#!/usr/bin/env python3
"""Generate the brand raster set from the SVG brand sources.

GitHub will not accept an organization avatar or a repository social-preview
image over its REST API -- both are web-UI uploads only. So this script's job
is to produce correctly-sized, on-brand PNGs that a human can upload in two
clicks, and to keep them reproducible instead of hand-made one-offs.

Outputs (assets/brand/):
  org-avatar-500.png                     500x500   GitHub org / user avatar
  social-preview-firstpass.png          1280x640   repo social preview (public)
  social-preview-undercut-app.png       1280x640   repo social preview (private)

Design follows the "instrument paper" system already in site/og-image.svg:
cream ground, dark ink hairline, Bricolage Grotesque display at weight 500
with tight tracking, Fragment Mono for uppercase labels.

  pip install cairosvg   # plus the two OFL fonts, see FONTS below
  python3 scripts/build-brand-rasters.py
"""

import pathlib
import sys

try:
    import cairosvg
except ImportError:  # pragma: no cover - dependency guard
    sys.exit("needs cairosvg: pip install cairosvg")

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "brand"

# Palette, lifted from site/og-image.svg so the rasters cannot drift from it.
INK = "#13161b"
PAPER = "#f2f0ec"
TEAL = "#00959c"
AMBER = "#c26e12"
MUTED = "#6e7278"
RULE = "#d4d0cb"

DISPLAY = "'Bricolage Grotesque','Helvetica Neue',Arial,sans-serif"
MONO = "'Fragment Mono',Menlo,monospace"

# FONTS: Bricolage Grotesque and Fragment Mono are both OFL on Google Fonts.
# Without them installed, cairosvg silently falls back to a generic sans and
# the output is off-brand -- so the script checks and says so.
FONTS = ("Bricolage Grotesque", "Fragment Mono")


def check_fonts() -> None:
    try:
        import subprocess

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


def logomark(scale: float, x: float = 0, y: float = 0) -> str:
    """The 64x64 logomark, translated and scaled. Matches site/brand/."""
    return f"""<g transform="translate({x},{y}) scale({scale})">
    <rect width="64" height="64" rx="13" fill="{INK}"/>
    <rect x="10" y="15" width="44" height="11" rx="2" fill="{PAPER}"/>
    <rect x="10" y="38" width="24" height="11" rx="2" fill="{TEAL}"/>
    <path d="M38 49 L54 30" stroke="{PAPER}" stroke-width="4.5" stroke-linecap="round"/>
  </g>"""


def wordmark(x: float, y: float, size: float, fill: str) -> str:
    """Small inline lockup: bars + stroke + 'undercut', as in og-image.svg."""
    return f"""<g transform="translate({x},{y})">
    <rect x="0" y="2" width="26" height="7" rx="1" fill="{fill}"/>
    <rect x="0" y="16" width="14" height="7" rx="1" fill="{TEAL}"/>
    <path d="M17 23 L27 11" stroke="{fill}" stroke-width="2.4" stroke-linecap="round"/>
    <text x="40" y="22" font-family="{DISPLAY}" font-size="{size}" font-weight="500"
      letter-spacing="-0.5" fill="{fill}">undercut</text>
  </g>"""


def tier_motif(x: float, y: float, ink: str) -> str:
    """The nested cheap/standard/frontier rectangles from the OG image."""
    return f"""<g transform="translate({x},{y})" font-family="{MONO}" font-size="13" font-weight="700">
    <rect x="0" y="112" width="240" height="40" fill="none" stroke="{TEAL}" stroke-width="2"/>
    <rect x="150" y="58" width="90" height="54" fill="none" stroke="{ink}" stroke-width="2"/>
    <rect x="200" y="12" width="40" height="46" fill="none" stroke="{AMBER}" stroke-width="2"/>
    <text x="10" y="138" fill="{TEAL}">CHEAP</text>
    <text x="158" y="82" fill="{ink}">STANDARD</text>
    <text x="192" y="36" text-anchor="end" fill="{AMBER}">FRONTIER</text>
  </g>"""


def avatar_svg() -> str:
    # Square, no padding: GitHub crops avatars to a circle in most surfaces,
    # and the logomark's own 13/64 corner radius already reads as round there.
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 64 64">
  {logomark(1.0)}
</svg>"""


def social_public() -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="640" viewBox="0 0 1280 640">
  <rect width="1280" height="640" fill="{PAPER}"/>
  <rect width="1280" height="5" fill="{INK}"/>
  {wordmark(64, 52, 26, INK)}
  <text x="244" y="73" font-family="{MONO}" font-size="14" letter-spacing="0.8"
    fill="{MUTED}">MEASURED, NOT PROMISED</text>

  <text x="64" y="250" font-family="{DISPLAY}" font-size="62" font-weight="500"
    letter-spacing="-2.2" fill="{INK}">Confidence-gated model</text>
  <text x="64" y="320" font-family="{DISPLAY}" font-size="62" font-weight="500"
    letter-spacing="-2.2" fill="{INK}">routing for coding agents.</text>
  <text x="64" y="374" font-family="{DISPLAY}" font-size="24"
    fill="{MUTED}">Runs every unit at the cheapest model that can pass verification.</text>

  <line x1="64" y1="432" x2="1216" y2="432" stroke="{INK}" stroke-width="1.5"/>
  <g font-family="{DISPLAY}">
    <text x="64" y="502" font-size="46" font-weight="500" letter-spacing="-1.5"
      fill="{INK}">&#8722;71%</text>
    <text x="64" y="530" font-family="{MONO}" font-size="13" fill="{MUTED}">GSM8K COST &#183; OPENAI</text>
    <line x1="300" y1="456" x2="300" y2="542" stroke="{RULE}" stroke-width="1"/>
    <text x="332" y="502" font-size="46" font-weight="500" letter-spacing="-1.5"
      fill="{INK}">&#8722;95%</text>
    <text x="332" y="530" font-family="{MONO}" font-size="13" fill="{MUTED}">HUMANEVAL &#183; GEMINI</text>
    <line x1="600" y1="456" x2="600" y2="542" stroke="{RULE}" stroke-width="1"/>
    <text x="632" y="502" font-size="46" font-weight="500" letter-spacing="-1.5"
      fill="{INK}">=</text>
    <text x="632" y="530" font-family="{MONO}" font-size="13" fill="{MUTED}">PASS RATE &#183; EVERY CELL</text>
  </g>
  {tier_motif(940, 140, INK)}
  <text x="64" y="604" font-family="{MONO}" font-size="18"
    fill="{MUTED}">github.com/undercutsh/firstpass &#183; SKILL.md &#183; MIT</text>
</svg>"""


def social_private() -> str:
    # Dark ground so an internal repo is visually distinct at a glance from
    # the public one in a list of link previews.
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="640" viewBox="0 0 1280 640">
  <rect width="1280" height="640" fill="{INK}"/>
  <rect width="1280" height="5" fill="{TEAL}"/>
  {wordmark(64, 52, 26, PAPER)}
  <text x="244" y="73" font-family="{MONO}" font-size="14" letter-spacing="0.8"
    fill="{TEAL}">INTERNAL</text>

  <text x="64" y="280" font-family="{DISPLAY}" font-size="62" font-weight="500"
    letter-spacing="-2.2" fill="{PAPER}">Business, strategy,</text>
  <text x="64" y="350" font-family="{DISPLAY}" font-size="62" font-weight="500"
    letter-spacing="-2.2" fill="{PAPER}">and research.</text>
  <text x="64" y="406" font-family="{DISPLAY}" font-size="24"
    fill="{RULE}">PRD, pricing, competitive landscape, eval tooling.</text>

  <line x1="64" y1="470" x2="1216" y2="470" stroke="{MUTED}" stroke-width="1.5"/>
  <text x="64" y="540" font-family="{MONO}" font-size="18" letter-spacing="0.8"
    fill="{TEAL}">PRIVATE REPOSITORY &#183; NOT FOR DISTRIBUTION</text>
  <text x="64" y="590" font-family="{MONO}" font-size="16"
    fill="{MUTED}">github.com/undercutsh/undercut-app</text>
</svg>"""


TARGETS = {
    "org-avatar-500.png": (avatar_svg, 500, 500),
    "social-preview-firstpass.png": (social_public, 1280, 640),
    "social-preview-undercut-app.png": (social_private, 1280, 640),
}


def main() -> None:
    check_fonts()
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (builder, w, h) in TARGETS.items():
        dest = OUT / name
        cairosvg.svg2png(
            bytestring=builder().encode(), write_to=str(dest),
            output_width=w, output_height=h,
        )
        kb = dest.stat().st_size / 1024
        # GitHub rejects a social preview over 1MB.
        warn = "  ! over GitHub's 1MB limit" if kb > 1024 else ""
        print(f"  {name}  {w}x{h}  {kb:.0f}KB{warn}")
    print(f"\nwrote {len(TARGETS)} files to {OUT.relative_to(ROOT)}/")
    print("Upload steps are in assets/brand/README.md -- both are web-UI only.")


if __name__ == "__main__":
    main()
