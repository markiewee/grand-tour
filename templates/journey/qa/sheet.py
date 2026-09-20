"""Contact sheet: python3 qa/sheet.py <outdir> <sheet.jpg> [cols] [width]"""
import sys, glob
from PIL import Image
d, out = sys.argv[1], sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 5
tw = int(sys.argv[4]) if len(sys.argv) > 4 else 260
files = sorted(glob.glob(f"{d}/*.png"))
ims = [Image.open(f).convert("RGB") for f in files]
th = int(ims[0].height * tw / ims[0].width)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new("RGB", (cols * (tw + 8) + 8, rows * (th + 8) + 8), (30, 30, 30))
for k, im in enumerate(ims):
    r, c = divmod(k, cols)
    sheet.paste(im.resize((tw, th)), (8 + c * (tw + 8), 8 + r * (th + 8)))
sheet.save(out, quality=85)
print(out, sheet.size, [f.split('/')[-1] for f in files])
