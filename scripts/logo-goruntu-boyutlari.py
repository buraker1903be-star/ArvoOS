"""
YÖNETİM GİRİŞİNİN LOGO DOSYALARI (26.11.2026).

Sorun: logo kenarları tarayıcıda tırtıklı görünüyordu. Ölçüldü —
resmî dosyanın (public/brand/arvoos-on-dark.png) kenar yumuşatma bandı
mürekkep sınırı başına 1,06 PİKSEL. 1859 px genişliğindeki çizim
ekranda ~160 px'e inerken tarayıcı 11 kat küçültüyor ve bu 1 px'lik
bant bilgi taşımadığı için eğriler (OO'nun ∞ kıvrımları) merdiven
çıkıyor. Ayrıca eski kullanım 1920×1080'lik tuvali object-fit: cover
ile kırpıyordu: tarayıcı çizimden üç kat büyük bir tuvali ölçekliyordu.

Çözüm: küçültmeyi TARAYICIYA bırakmak yerine burada, Lanczos ile
yapmak. Dosyalar mürekkep kutusuna kırpılır (böylece CSS'teki genişlik
= görünen logo genişliği) ve ekran yoğunluklarına göre 1x/2x/3x
üretilir; tarayıcı srcset'ten uygun olanı seçip 1:1 çizer.

KAYNAK RESMÎDİR, YENİ LOGO ÇİZİLMEZ: public/brand/arvoos-on-dark.png
(ARVO #FFFFFF, OS #6F9548, saydam zemin). Renklere dokunulmaz; betik
yalnızca kırpar ve küçültür. Çıktı renkleri sonunda doğrulanır.

Çalıştırma: python3 scripts/logo-goruntu-boyutlari.py
"""
from PIL import Image

KAYNAK = "public/brand/arvoos-on-dark.png"
GENISLIKLER = [160, 320, 480]  # 1x / 2x / 3x — masaüstünde görünen genişlik 160 px

ana = Image.open(KAYNAK).convert("RGBA")
kutu = ana.split()[3].getbbox()
ink = ana.crop(kutu)
print(f"kaynak {ana.size} → mürekkep {ink.size} (oran {ink.width / ink.height:.3f})")

for g in GENISLIKLER:
    y = round(g * ink.height / ink.width)
    kucuk = ink.resize((g, y), Image.LANCZOS)
    ad = f"public/brand/arvoos-on-dark-{g}.png"
    kucuk.save(ad, optimize=True)
    import numpy as np
    a = np.array(kucuk)
    opak = a[..., 3] > 250
    beyaz = a[opak & (a[..., 1] > 200)][:, :3]
    yesil = a[opak & (a[..., 1] <= 200) & (a[..., 1] > 100)][:, :3]
    yumusak = int(((a[..., 3] > 0) & (a[..., 3] < 255)).sum())
    print(
        f"{ad}: {g}×{y} | ARVO {beyaz.mean(0).round().astype(int).tolist() if len(beyaz) else '-'}"
        f" | OS {yesil.mean(0).round().astype(int).tolist() if len(yesil) else '-'}"
        f" | yumuşak piksel {yumusak} (sınır başına {yumusak / max(opak.sum(), 1) * 100:.1f}%)"
    )
