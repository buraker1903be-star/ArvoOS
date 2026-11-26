"""
YÖNETİMİN LOGO GÖRÜNTÜLEME DOSYALARI (26.11.2026).

Giriş ekranı ve konsolun sol menüsü aynı resmî kaynaklardan besleniyor.

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

AÇIK ZEMİN VARYANTI DA BURADAN (26.11.2026): konsolun sol menüsü açık
temada public/brand/arvoos.png'yi kullanıyor (ARVO #002045, OS #6F9548).
Menüde görünen genişlik 150 px; aynı 160/320/480 kümesi onu da karşılar.

İŞARET (26.11.2026): dar menü, tablet rayı ve telefonun üst çubuğu
kelime logosunu değil İŞARETİ kullanıyor. Resmî dosya kurum sahibinden
geldi ve public/brand/arvoos-simge.png olarak duruyor — mürekkep kutusu
1405×704, yani 2 : 1. Repodaki favicon.svg ve PWA ikonları motifin
1,54 : 1 oranındaki BAŞKA bir çizimi; menüde resmî olan kullanılıyor,
o dosyalara bu turda dokunulmadı.

Koyu zemin varyantı burada TÜRETİLİYOR: lacivert yarı beyaza çevriliyor,
yeşil yarı ve alfa olduğu gibi kalıyor (kelime logosunun resmî on-dark
dosyasındaki ayrımın aynısı: ARVO beyaz, OS yeşil). Resmî bir on-dark
işaret dosyası gelirse bu türetme kaldırılmalı.

Çalıştırma: python3 scripts/logo-goruntu-boyutlari.py
"""
import numpy as np
from PIL import Image

GENISLIKLER = [160, 320, 480]  # 1x / 2x / 3x — görünen genişlik 150–160 px
# (kaynak, çıktı öneki): ikisi de RESMÎ dosya, yalnızca kırpılıp küçültülüyor.
KAYNAKLAR = [
    ("public/brand/arvoos-on-dark.png", "arvoos-on-dark", GENISLIKLER),
    ("public/brand/arvoos.png", "arvoos", GENISLIKLER),
    # İşaret menüde 34 px görünüyor: 1x/2x/3x.
    ("public/brand/arvoos-simge.png", "arvoos-simge", [34, 68, 102]),
]


def koyu_zemine(ink):
    """Lacivert yarıyı beyaza çevirir; yeşili ve alfayı korur."""
    a = np.array(ink).astype(np.int16)
    rgb = a[..., :3]
    lacivert = np.array([0, 32, 69])
    yesil = np.array([111, 149, 72])
    d_lac = np.abs(rgb - lacivert).sum(-1)
    d_yes = np.abs(rgb - yesil).sum(-1)
    maske = (a[..., 3] > 0) & (d_lac <= d_yes)
    a[maske, :3] = 255
    return Image.fromarray(a.astype(np.uint8), "RGBA")


for kaynak, onek, genislikler in KAYNAKLAR:
    ana = Image.open(kaynak).convert("RGBA")
    kutu = ana.split()[3].getbbox()
    ink = ana.crop(kutu)
    print(f"{kaynak} {ana.size} → mürekkep {ink.size} (oran {ink.width / ink.height:.3f})")
    # İşaretin koyu zemin varyantı dosya olarak gelmiyor, türetiliyor.
    ciftler = [(onek, ink)] + ([(f"{onek}-on-dark", koyu_zemine(ink))] if onek == "arvoos-simge" else [])

    for g in genislikler:
        for ad_onek, kaynak_ink in ciftler:
          y = round(g * kaynak_ink.height / kaynak_ink.width)
          kucuk = kaynak_ink.resize((g, y), Image.LANCZOS)
          ad = f"public/brand/{ad_onek}-{g}.png"
          kucuk.save(ad, optimize=True)
          a = np.array(kucuk)
          opak = a[..., 3] > 250
          # ARVO: koyu zeminde beyaz, açık zeminde lacivert — ikisi de
          # yeşilden (G ~149) ayrışıyor, eşik ortada.
          arvo = a[opak & ((a[..., 1] > 200) | (a[..., 1] < 100))][:, :3]
          yesil = a[opak & (a[..., 1] <= 200) & (a[..., 1] >= 100)][:, :3]
          yumusak = int(((a[..., 3] > 0) & (a[..., 3] < 255)).sum())
          print(
              f"  {ad}: {g}×{y} | ARVO {arvo.mean(0).round().astype(int).tolist() if len(arvo) else '-'}"
              f" | OS {yesil.mean(0).round().astype(int).tolist() if len(yesil) else '-'}"
              f" | yumuşak piksel {yumusak} (sınır başına {yumusak / max(opak.sum(), 1) * 100:.1f}%)"
          )
