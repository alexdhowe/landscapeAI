# Image fixtures

Three small files, committed so `npm test` needs no network and no build
step, and so the HEIC path is tested against a **real HEIC** rather than a
mocked decoder.

| File | What it is |
|---|---|
| `portrait-iphone.heic` | 979 bytes. A genuine HEIF container (`ftypheic`, HEVC-coded) holding a 64×48 image with the rotation carried in the container's own `irot` property — which is how an iPhone stores a portrait capture — plus EXIF `Make: Apple`, `Model: iPhone 15 Pro` and a GPS fix. |
| `portrait-iphone.jpg` | The same picture as a JPEG with EXIF `Orientation: 6` left in the tag, where the rotation really does have to be baked in by hand. |
| `upright-with-gps.jpg` | Upright, no rotation to apply, GPS present — so the coordinate-stripping test cannot pass just because something else needed re-encoding. |

Each is four flat colour quadrants (red, green, blue, yellow, clockwise
from top-left). Flat on purpose: after an area-average downscale and a
lossy re-encode a corner pixel is still unmistakably its own colour, so a
test can assert **which way up** the picture came out, not merely that
something decoded.

## Provenance

These were **generated**, not shot. Nobody in this session had an iPhone,
and a photo of a real house is not a thing to commit to a repository in any
case. `scripts/make-image-fixtures.py` is the generator; it uses
`pillow-heif` (which bundles libheif with an HEVC encoder) and `piexif`,
neither of which is a dependency of this project:

```sh
pip install pillow pillow-heif piexif
python3 scripts/make-image-fixtures.py lib/image/__tests__/fixtures
```

What the generated file does reproduce faithfully is the shape of the
problem: a HEIF container whose picture is stored landscape and displayed
portrait, carrying coordinates it should not keep. If you have a real
iPhone capture to hand, dropping it in and re-pointing the tests is the
better fixture and the tests are written to survive the swap — they assert
relationships (portrait out, corner colours, no EXIF) rather than pinned
bytes.
