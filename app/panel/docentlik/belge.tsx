"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { boyutMetni, pdfOnDenetimi } from "@/lib/docentlik-gorunum";
import { belgeAdresi, belgeKaldir, belgeKaydet, belgeYuklemeHazirla, uakAdresi, uakKaydet, uakYuklemeHazirla } from "./actions";
import { OnayliIslem } from "./islem-formu";
import "../components/gonder-dugmesi.css";
import "../components/kayit-formu.css";

/*
  DOÇENTLİK BELGELERİ — TARAYICI TARAFI (F6 PR6b).

  Akış PR5'in sözleşmesi (app/panel/docentlik/actions.ts):
   1. Sunucu yolu ÜRETİR (belgeYuklemeHazirla / uakYuklemeHazirla): kurum,
      sahip ve faaliyet kimliği oturumdan; istemci yol seçmez.
   2. Tarayıcı dosyayı o yola, KENDİ oturumuyla, özel kovaya yükler. Kova
      politikası (20261114201157) yolu kayda bağlıyor: başkasının ya da
      başka kurumun yoluna yazılamaz, üzerine yazma (upsert) kapalı.
   3. Sunucu yolu YENİDEN kurup karşılaştırır, nesneyi depodan okuyup tür,
      boyut ve "%PDF-" imzasını denetler, kaydı yazar; herhangi bir adım
      düşerse yüklenen nesneyi siler (belgeKaydet / uakKaydet).
  Büyük dosya sunucu işleminin gövdesinden geçmiyor (gövde sınırı).

  Bu dosyadaki tür/boyut denetimi bir ÖN eleme (pdfOnDenetimi): asıl karar
  sunucuda ve kovada. Tarayıcı 2. ile 3. arasında kapanırsa nesne sahipsiz
  kalır — kova politikası onu kimseye okutmaz; kalıcı temizlik kuyruğu
  ayrı iş (docs/docentlik-sunucu-islemleri.md → "Depo temizliği").

  Hata mesajları iki kaynaktan: tarayıcıdaki ön eleme ve yükleme hatası
  formun içinde (role="alert"); sunucu işleminin hatası panelin
  bildiriminde (runPanelAction). Bildirim "submit" olayıyla yoklandığı için
  her işlem bir form gönderimi.

  İmzalı adres kısa ömürlü (60 sn, IMZALI_ADRES_SANIYE). Pencere TIK ANINDA
  açılıyor, adres sonra yazılıyor: adres bir await'ten sonra gelince
  window.open açılır pencere engelleyicisine takılıyordu. Kalıcı ya da
  herkese açık bir bağlantı hiçbir yerde üretilmiyor.
*/

function useKilit() {
  const kilit = useRef(false);
  const [bekliyor, setBekliyor] = useState(false);
  async function calistir(is: () => Promise<void>) {
    if (kilit.current) return;
    kilit.current = true;
    setBekliyor(true);
    try { await is(); } finally { kilit.current = false; setBekliyor(false); }
  }
  return { bekliyor, calistir };
}

function Bekleme({ kisa, children, bekliyor }: { kisa: string; children: ReactNode; bekliyor: boolean }) {
  return bekliyor ? (
    <span className="gonder-bekleme" role="status">
      <span className="gonder-bekleme-kisa">{kisa}</span>
      <span className="gonder-bekleme-uzun">Hâlâ işleniyor — sonucu bekleyin</span>
    </span>
  ) : <>{children}</>;
}

/** İmzalı adresi yeni sekmede açar; adres alınamazsa sekme kapanır (hata bildirimde). */
export function BelgeGoruntule({ adresAl, etiket = "Görüntüle", ariaLabel }: {
  adresAl: () => Promise<{ adres: string } | undefined>;
  etiket?: string;
  ariaLabel?: string;
}) {
  const { bekliyor, calistir } = useKilit();
  function gonder(olay: FormEvent<HTMLFormElement>) {
    olay.preventDefault();
    const pencere = window.open("about:blank", "_blank");
    if (pencere) pencere.opener = null;
    void calistir(async () => {
      const sonuc = await adresAl();
      if (sonuc?.adres && pencere) pencere.location.href = sonuc.adres;
      else if (sonuc?.adres) window.location.href = sonuc.adres;
      else pencere?.close();
    });
  }
  return (
    <form onSubmit={gonder} className="docentlik-sil">
      <button type="submit" className="panel-secondary" disabled={bekliyor} aria-busy={bekliyor || undefined} aria-label={ariaLabel}>
        <Bekleme kisa="Açılıyor…" bekliyor={bekliyor}>{etiket}</Bekleme>
      </button>
    </form>
  );
}

/* Seçilen PDF'i sunucunun verdiği yola yükler; hatayı formda gösterir. */
async function kovayaYukle(kova: string, yol: string, dosya: File): Promise<string | null> {
  const { error } = await createClient().storage.from(kova).upload(yol, dosya, { contentType: "application/pdf", upsert: false });
  return error ? `Dosya yüklenemedi: ${error.message}` : null;
}

function DosyaAlani({ id, onSecim, secili }: { id: string; onSecim: (d: File | null) => void; secili: File | null }) {
  return (
    <label className="wide">
      <span>PDF dosyası<b className="req" aria-hidden="true">*</b></span>
      <input id={id} type="file" name="dosya" accept="application/pdf,.pdf" required aria-describedby={`${id}-ipucu`}
        onChange={(e) => onSecim(e.currentTarget.files?.[0] ?? null)} />
      <small id={`${id}-ipucu`} className="docentlik-ipucu">
        {secili ? `${secili.name} · ${boyutMetni(secili.size)}` : "Yalnızca PDF, en fazla 20 MB."}
      </small>
    </label>
  );
}

/** Faaliyete PDF ekler ya da mevcut belgeyi değiştirir (eski nesneyi sunucu, kayıt yeni yolu aldıktan SONRA siler). */
export function FaaliyetBelgesiYukle({ faaliyetId, degistir }: { faaliyetId: string; degistir: boolean }) {
  const [dosya, setDosya] = useState<File | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const { bekliyor, calistir } = useKilit();
  const kimlik = `belge-${faaliyetId.slice(0, 8)}`;

  function gonder(olay: FormEvent<HTMLFormElement>) {
    olay.preventDefault();
    const form = olay.currentTarget;
    void calistir(async () => {
      setHata(null);
      const on = pdfOnDenetimi(dosya);
      if (!on.ok) { setHata(on.hata); return; }
      const hazir = await belgeYuklemeHazirla(faaliyetId);
      if (!hazir) return; // sunucu hatası bildirimde
      const yuklemeHatasi = await kovayaYukle(hazir.kova, hazir.yol, dosya!);
      if (yuklemeHatasi) { setHata(yuklemeHatasi); return; }
      const fd = new FormData();
      fd.set("faaliyet_id", faaliyetId);
      fd.set("yol", hazir.yol);
      const kayit = await belgeKaydet(fd);
      if (kayit) { form.reset(); setDosya(null); }
    });
  }

  return (
    <form onSubmit={gonder} className="panel-form kayit-formu docentlik-form" aria-describedby={`${kimlik}-not`}>
      <DosyaAlani id={kimlik} onSecim={(d) => { setDosya(d); setHata(null); }} secili={dosya} />
      {hata ? <p className="wide docentlik-hata" role="alert">{hata}</p> : null}
      <div className="wide panel-form-actions kayit-formu-eylem">
        <p id={`${kimlik}-not`}>{degistir ? "Yeni dosya kaydedilince eski belge silinir." : "Belge yalnızca size ve kurumunuzdaki gözetim yetkisi olanlara görünür."}</p>
        <button type="submit" className="panel-primary" disabled={bekliyor} aria-busy={bekliyor || undefined}>
          <Bekleme kisa="Yükleniyor…" bekliyor={bekliyor}>{degistir ? "Belgeyi değiştir" : "Belgeyi yükle"}</Bekleme>
        </button>
      </div>
    </form>
  );
}

export function FaaliyetBelgesiGoruntule({ faaliyetId, baslik }: { faaliyetId: string; baslik: string }) {
  return <BelgeGoruntule adresAl={() => belgeAdresi(faaliyetId)} ariaLabel={`${baslik} belgesini görüntüle`} />;
}

export function FaaliyetBelgesiKaldir({ faaliyetId, baslik }: { faaliyetId: string; baslik: string }) {
  return (
    <OnayliIslem islem={belgeKaldir} alanlar={{ faaliyet_id: faaliyetId }} etiket="Kaldır" ariaLabel={`${baslik} belgesini kaldır`}
      baslik="Belge kaldırılsın mı?" metin={`"${baslik}" faaliyetinin PDF belgesi kalıcı olarak silinir; faaliyet ve puanı kalır.`} onayEtiketi="Kaldır" />
  );
}

/** ÜAK tablosu PDF'i yükler. Aynı temel alan için ikinci tablo reddedilir (önce mevcut kaldırılır). */
export function UakYukle() {
  const [dosya, setDosya] = useState<File | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const { bekliyor, calistir } = useKilit();

  function gonder(olay: FormEvent<HTMLFormElement>) {
    olay.preventDefault();
    const form = olay.currentTarget;
    const alanlar = new FormData(form);
    void calistir(async () => {
      setHata(null);
      const on = pdfOnDenetimi(dosya);
      if (!on.ok) { setHata(on.hata); return; }
      const hazir = await uakYuklemeHazirla();
      if (!hazir) return;
      const yuklemeHatasi = await kovayaYukle(hazir.kova, hazir.yol, dosya!);
      if (yuklemeHatasi) { setHata(yuklemeHatasi); return; }
      const fd = new FormData();
      fd.set("yol", hazir.yol);
      fd.set("temel_alan", String(alanlar.get("temel_alan") ?? ""));
      fd.set("donem", String(alanlar.get("donem") ?? ""));
      fd.set("dosya_adi", dosya!.name.slice(0, 300));
      const kayit = await uakKaydet(fd);
      if (kayit) { form.reset(); setDosya(null); }
    });
  }

  return (
    <form onSubmit={gonder} className="panel-form kayit-formu docentlik-form" aria-describedby="uak-yukle-not">
      <label>
        <span>Temel alan<b className="req" aria-hidden="true">*</b></span>
        <input name="temel_alan" required maxLength={120} autoComplete="off" placeholder="Örn. Eğitim Bilimleri" />
      </label>
      <label>
        <span>Dönem<b className="req" aria-hidden="true">*</b></span>
        <input name="donem" required maxLength={40} autoComplete="off" placeholder="Örn. 2026 Ekim" />
      </label>
      <DosyaAlani id="uak-dosya" onSecim={(d) => { setDosya(d); setHata(null); }} secili={dosya} />
      {hata ? <p className="wide docentlik-hata" role="alert">{hata}</p> : null}
      <div className="wide panel-form-actions kayit-formu-eylem">
        <p id="uak-yukle-not">Tablo yalnızca saklanır; kriter ve hedefler PDF&apos;ten otomatik oluşturulmaz.</p>
        <button type="submit" className="panel-primary" disabled={bekliyor} aria-busy={bekliyor || undefined}>
          <Bekleme kisa="Yükleniyor…" bekliyor={bekliyor}>Tabloyu yükle</Bekleme>
        </button>
      </div>
    </form>
  );
}

export function UakGoruntule({ tabloId, temelAlan }: { tabloId: string; temelAlan: string }) {
  return <BelgeGoruntule adresAl={() => uakAdresi(tabloId)} ariaLabel={`${temelAlan} ÜAK tablosunu görüntüle`} />;
}
