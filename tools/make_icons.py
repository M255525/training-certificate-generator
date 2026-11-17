# 產生 PWA 圖示：深藍底＋米色證書紙＋金色框＋紅色方印
import os
from PIL import Image, ImageDraw
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
os.makedirs(out, exist_ok=True)

def draw(size, pad):
    s = 4 * size
    im = Image.new('RGB', (s, s), '#1D2B3A')
    d = ImageDraw.Draw(im)
    x0, x1 = pad * s, (1 - pad) * s
    w = x1 - x0
    px0, py0, px1, py1 = x0 + w * .06, x0 + w * .16, x1 - w * .06, x1 - w * .16
    d.rectangle([px0, py0, px1, py1], fill='#FBF6E7')
    for k, wd in ((.03, .018), (.055, .006)):
        d.rectangle([px0 + w * k, py0 + w * k, px1 - w * k, py1 - w * k], outline='#A9812A', width=max(2, int(w * wd)))
    cx = (px0 + px1) / 2
    d.rectangle([cx - w * .22, py0 + w * .14, cx + w * .22, py0 + w * .2], fill='#A9812A')
    for i, yy in enumerate((.3, .36, .42)):
        d.rectangle([cx - w * .3, py0 + w * yy, cx + w * (.3 if i < 2 else .1), py0 + w * yy + w * .025], fill='#8B8577')
    sx, sy, sw = px1 - w * .27, py1 - w * .27, w * .17
    d.rectangle([sx, sy, sx + sw, sy + sw], outline='#C8102E', width=int(w * .022))
    g = sw * .22
    for i in range(2):
        for j in range(2):
            d.rectangle([sx + g * .9 + i * g * 1.55, sy + g * .9 + j * g * 1.55, sx + g * 1.9 + i * g * 1.55, sy + g * 1.9 + j * g * 1.55], fill='#C8102E')
    return im.resize((size, size), Image.LANCZOS)

draw(192, .04).save(os.path.join(out, 'icon-192.png'))
draw(512, .04).save(os.path.join(out, 'icon-512.png'))
draw(512, .16).save(os.path.join(out, 'icon-maskable-512.png'))
print('ok')
