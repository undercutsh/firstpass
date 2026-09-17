# Brand assets

Vector sources live in [`site/brand/`](../../site/brand). The PNGs here are
generated from them by [`scripts/build-brand-rasters.py`](../../scripts/build-brand-rasters.py)
— edit the script, not the output.

```bash
python3 scripts/build-brand-rasters.py
```

The script needs `cairosvg` and the two OFL brand faces (Bricolage Grotesque,
Fragment Mono) installed locally. Without the fonts it still renders, but falls
back to a generic sans and warns that the result is off-brand.

## Palette

| Token | Hex | Use |
|---|---|---|
| Ink | `#13161b` | Type, hairlines, logomark ground |
| Paper | `#f2f0ec` | Page ground |
| Teal | `#00959c` | The cheap tier, accents |
| Amber | `#c26e12` | The frontier tier |
| Muted | `#6e7278` | Secondary type |
| Rule | `#d4d0cb` | Dividers |

Display type is Bricolage Grotesque at weight 500 with tight negative
tracking. Labels are Fragment Mono, uppercase, positive tracking.

## Files

| File | Size | Where it goes |
|---|---|---|
| `org-avatar-500.png` | 500×500 | GitHub organization avatar |
| `social-preview-firstpass.png` | 1280×640 | `undercutsh/firstpass` social preview |
| `social-preview-undercut-app.png` | 1280×640 | `undercutsh/undercut-app` social preview |

## Uploading — both are web-UI only

GitHub exposes **no REST API** for either an organization avatar or a
repository social-preview image. `PATCH /orgs/{org}` accepts `name`,
`description`, `blog`, `location` and billing fields but no avatar;
`PATCH /repos/{owner}/{repo}` has no social-preview field. Neither can be
scripted, so these are the manual steps.

**Organization avatar**

1. <https://github.com/organizations/undercutsh/settings/profile>
2. Under *Profile picture*, choose **Upload new picture**
3. Pick `assets/brand/org-avatar-500.png`, position the crop, save

GitHub renders avatars as circles in most surfaces. The logomark's own corner
radius already reads as round, and every element sits inside the inscribed
circle, so the default centred crop is correct.

**Repository social previews** — per repo, 1280×640 recommended, 1MB max

1. `https://github.com/undercutsh/<repo>/settings`
2. Scroll to *Social preview* → **Edit** → **Upload an image**
3. `firstpass` takes `social-preview-firstpass.png` (cream, public);
   `undercut-app` takes `social-preview-undercut-app.png` (dark, marked
   internal so a private repo is distinguishable at a glance in a list of
   link previews)

The favicon and OG image for the website are separate and already wired up in
[`site/`](../../site) — nothing here changes those.
