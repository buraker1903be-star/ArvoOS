"""
ArvoOS logosunun KOYU ZEMİN varyantı (26.11.2026).

Yönetim girişinin marka paneli iki temada da lacivert. Resmî logo
(public/arvoos-logo.png) lacivert #002045 + marka yeşili #6F9548:
lacivert "ARVO" lacivert panelde kaybolur. Eskiden logo beyaz bir
plakanın üstüne konuyordu, ondan önce de `brightness(0) invert(1)` ile
TAMAMI beyaza düzleştiriliyordu — ikisi de resmî çizimi bozuyordu.

Bu betik orijinal dosyadan TEKNİK bir varyant üretir, yeni logo çizmez:
  - lacivert (ARVO) pikseller beyaza kaydırılır,
  - yeşil (OS) pikseller olduğu gibi kalır (birebir aynı RGB),
  - saydamlık (alfa) birebir aynıdır: kenar yumuşatması ve boyut korunur.
İki renk arasındaki her piksel lacivert→yeşil doğrusu üzerindeki yerine
göre kaydırılır; yeşile yakın olanlar (t > 0.7) dokunulmadan kalır.

Yöntem ArvoLab'ın aynı sorunu çözen betiğinden alındı
(ArvoLab scripts/logo-koyu-varyant.py, canlı commit b3fab7a4).

Çalıştırma: python3 scripts/logo-koyu-varyant.py
Girdi public/arvoos-logo.png, çıktı public/arvoos-logo-koyu.png.
"""
import numpy as np
from PIL import Image

kaynak = np.array(Image.open("public/arvoos-logo.png").convert("RGBA")).astype(float)
rgb, alfa = kaynak[..., :3], kaynak[..., 3]
opak = alfa > 250
lacivert = rgb[opak & (rgb[..., 1] < 60)].mean(0)
yesil = rgb[opak & (rgb[..., 1] > 130)].mean(0)
d = yesil - lacivert
t = np.clip(((rgb - lacivert) @ d) / (d @ d), 0, 1)
t = np.where(t > 0.7, 1.0, t)[..., None]
cikti = rgb + (1 - t) * (np.array([255.0, 255.0, 255.0]) - lacivert)
sonuc = np.dstack([cikti.clip(0, 255), alfa]).round().astype(np.uint8)
Image.fromarray(sonuc, "RGBA").save("public/arvoos-logo-koyu.png", optimize=True)

k = np.array(Image.open("public/arvoos-logo-koyu.png").convert("RGBA")).astype(int)
o = kaynak.astype(int)
ym = opak & (rgb[..., 1] > 130)
lm = opak & (rgb[..., 1] < 60)
print("yeşil piksel:", int(ym.sum()), "değişen:", int((np.abs(k[ym][:, :3] - o[ym][:, :3]).max(-1) > 0).sum()))
print("alfa birebir:", bool((k[..., 3] == o[..., 3]).all()), "| ARVO ortalama:", k[lm][:, :3].mean(0).round().tolist())
print("yeşil ortalama:", k[ym][:, :3].mean(0).round().tolist())
