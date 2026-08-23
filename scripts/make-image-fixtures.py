"""Generate the image fixtures in lib/image/__tests__/fixtures/.

Run once; the outputs are committed. See the README beside them.
Requires: pip install pillow pillow-heif piexif
"""
import sys, math
from PIL import Image
import piexif, pillow_heif

pillow_heif.register_heif_opener()
OUT = sys.argv[1]

# Four flat quadrants. Flat on purpose: after an area-average downscale and
# a lossy re-encode, a corner pixel is still unmistakably its own colour, so
# a test can assert *which way up* the picture came out.
QUADRANTS = {
    "tl": (214, 48, 40),    # red
    "tr": (40, 168, 72),    # green
    "bl": (48, 76, 208),    # blue
    "br": (232, 196, 40),   # yellow
}

def quadrant_image(w, h):
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        for x in range(w):
            key = ("t" if y < h // 2 else "b") + ("l" if x < w // 2 else "r")
            px[x, y] = QUADRANTS[key]
    return img

def exif_blob(orientation):
    return piexif.dump({
        "0th": {
            piexif.ImageIFD.Orientation: orientation,
            piexif.ImageIFD.Make: b"Apple",
            piexif.ImageIFD.Model: b"iPhone 15 Pro",
        },
        "Exif": {},
        # Downtown Madison, WI. Present so the stripping test has something
        # real to strip — a test that passes against an input with no GPS
        # proves nothing.
        "GPS": {
            piexif.GPSIFD.GPSLatitudeRef: b"N",
            piexif.GPSIFD.GPSLatitude: ((43, 1), (4, 1), (2712, 100)),
            piexif.GPSIFD.GPSLongitudeRef: b"W",
            piexif.GPSIFD.GPSLongitude: ((89, 1), (23, 1), (2340, 100)),
            piexif.GPSIFD.GPSAltitudeRef: 0,
            piexif.GPSIFD.GPSAltitude: (26000, 100),
        },
        "1st": {}, "thumbnail": None,
    })

# 1. A portrait iPhone capture: stored landscape 64x48 with Orientation 6.
#    pillow-heif normalises that into the container's own `irot` property,
#    which is exactly what an iPhone writes.
quadrant_image(64, 48).save(
    f"{OUT}/portrait-iphone.heic", format="HEIF", quality=90, exif=exif_blob(6)
)

# 2. The same capture as a JPEG, tag intact — the path where the EXIF
#    orientation really does have to be baked in by hand.
quadrant_image(64, 48).save(
    f"{OUT}/portrait-iphone.jpg", format="JPEG", quality=92, exif=exif_blob(6)
)

# 3. An upright JPEG with GPS and no rotation: proves coordinates are
#    dropped even when there is nothing else to do.
quadrant_image(48, 48).save(
    f"{OUT}/upright-with-gps.jpg", format="JPEG", quality=92, exif=exif_blob(1)
)
print("wrote 3 fixtures to", OUT)
