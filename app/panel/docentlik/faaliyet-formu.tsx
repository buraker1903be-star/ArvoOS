"use client";

import { useRef, useState } from "react";
import { TarihSecici } from "../components/tarih-secici";
import { GonderDugmesi } from "../components/gonder-dugmesi";
import type { KriterSecenegi } from "@/lib/docentlik-gorunum";
import { faaliyetDuzenle, faaliyetEkle } from "./actions";

/*
  FAALİYET FORMU (F6 PR6a). Ekleme ve düzenleme aynı form; sunucu işlemleri
  PR5'in (app/panel/docentlik/actions.ts). Formda PUAN YOK, bilerek:
  puanı veritabanı tetikleyicisi yazıyor, sunucu çekirdekle karşılaştırıyor
  (20261115014302). İstemcinin göndereceği bir puan alanı olsaydı bile
  okunmazdı; olmaması, "girdiğim puan neden değişti" sorusunu da önlüyor.

  İSTEK ANAHTARI (20261114213340, 20261115101820). Anahtar formun
  hayatı boyunca bir REF'te tutuluyor ve ilk gönderimde üretiliyor:
   - çift tıklama / ağ kesilip yeniden gönderim aynı anahtarı taşır →
     sunucu ilk kaydı döndürür, iki faaliyet doğmaz;
   - başarıdan sonra ref boşalır → bir sonraki faaliyet yeni anahtar alır
     ("her yeni form oturumu yeni anahtar");
   - hata (puan uyuşmazlığı, yetki, doğrulama) anahtarı TÜKETMEZ: veritabanı
     işlemi geri alındığı için aynı anahtarla düzeltilmiş gönderim ilk
     yazım sayılır.
  Anahtar çizim sırasında üretilmiyor: sunucu çizimi ile tarayıcı çizimi
  farklı rastgele değer üretir ve React uyuşmazlık uyarısı verirdi.

  DÜZENLEMEDE SÜRÜM. Kaydın okunduğu andaki updated_at "surum" olarak geri
  gider; arada başka sekmede değiştiyse sunucu "bu arada değişti" der ve
  hiçbir şey yazmaz (iyimser eşzamanlılık, PR5).

  Hata mesajları sunucudan gelir (runPanelAction → bildirim): DP001 (puan
  doğrulanamadı), DP002 (anahtar başka faaliyette), yetki iptali ve
  eşzamanlı düzenleme için Türkçe cümleler actions.ts'te.
*/

export type FaaliyetFormDegeri = {
  id: string;
  surum: string;
  criteria_id: string;
  title: string;
  unit_count: number | string;
  yazar_sayisi: number;
  baslica_yazar: boolean;
  faaliyet_tarihi: string | null;
  notes: string | null;
};

export function FaaliyetFormu({ secenekler, mevcut, bugun }: {
  secenekler: { grup: string; secenekler: KriterSecenegi[] }[];
  mevcut?: FaaliyetFormDegeri;
  /** Türkiye günü (todayInIstanbul): ileri tarihli faaliyet girilmesin. */
  bugun: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const anahtar = useRef<string | null>(null);
  const [yazar, setYazar] = useState(String(mevcut?.yazar_sayisi ?? 1));
  const tekYazar = yazar.trim() === "1" || yazar.trim() === "";
  const onek = mevcut ? `faaliyet-${mevcut.id.slice(0, 8)}` : "faaliyet-yeni";
  const secenekVar = secenekler.some((g) => g.secenekler.length > 0);

  async function gonder(formData: FormData) {
    if (mevcut) {
      await faaliyetDuzenle(formData);
      return;
    }
    anahtar.current ??= crypto.randomUUID();
    formData.set("istek_anahtari", anahtar.current);
    const sonuc = await faaliyetEkle(formData);
    if (sonuc) {
      // Başarı (ya da aynı isteğin tekrarı): bir sonraki faaliyet yeni anahtar alır.
      anahtar.current = null;
      formRef.current?.reset();
      setYazar("1");
    }
  }

  if (!secenekVar) {
    return (
      <div className="panel-empty docentlik-bos">
        <b>Seçilebilecek kriter yok</b>
        <p>Kurumunuz alanınıza uygun bir puanlama kriteri tanımlamadan faaliyet eklenemez. Kriterleri kurum yöneticiniz tanımlar.</p>
      </div>
    );
  }

  return (
    <form ref={formRef} action={gonder} className="panel-form kayit-formu docentlik-form" aria-describedby={`${onek}-not`}>
      {mevcut ? (
        <>
          <input type="hidden" name="faaliyet_id" value={mevcut.id} />
          <input type="hidden" name="surum" value={mevcut.surum} />
        </>
      ) : null}

      <label className="wide">
        <span>Kriter<b className="req" aria-hidden="true">*</b></span>
        <select name="kriter_id" required defaultValue={mevcut?.criteria_id ?? ""}>
          <option value="" disabled>Kriter seçin</option>
          {secenekler.map((g) => (
            <optgroup key={g.grup} label={g.grup}>
              {g.secenekler.map((s) => (
                <option key={s.id} value={s.id}>{s.etiket}{s.pasif ? " — pasif" : ""}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <label className="wide">
        <span>Faaliyet başlığı<b className="req" aria-hidden="true">*</b></span>
        <input name="baslik" required maxLength={500} autoComplete="off" defaultValue={mevcut?.title ?? ""} placeholder="Örn. makale başlığı, proje adı" />
      </label>

      <label>
        <span>Birim / adet<b className="req" aria-hidden="true">*</b></span>
        {/* Metin kutusu: "0,5" gibi Türkçe ondalık yazım sayı kutusunda geçersiz sayılıyordu. */}
        <input name="birim_sayisi" required inputMode="decimal" autoComplete="off" maxLength={12}
          defaultValue={mevcut ? String(mevcut.unit_count) : "1"} aria-describedby={`${onek}-birim`} />
        <small id={`${onek}-birim`} className="docentlik-ipucu">Çoğu faaliyet için 1. Ondalık için virgül: 0,5</small>
      </label>

      <label>
        <span>Yazar sayısı<b className="req" aria-hidden="true">*</b></span>
        <input name="yazar_sayisi" type="number" required min={1} max={500} step={1} inputMode="numeric"
          value={yazar} onChange={(e) => setYazar(e.target.value)} />
      </label>

      <fieldset className="wide docentlik-secim" disabled={tekYazar} aria-describedby={`${onek}-baslica`}>
        <legend>Başlıca yazar mısınız?</legend>
        <label><input type="radio" name="baslica_yazar" value="evet" defaultChecked={mevcut ? mevcut.baslica_yazar : true} /> Evet</label>
        <label><input type="radio" name="baslica_yazar" value="hayir" defaultChecked={mevcut ? !mevcut.baslica_yazar : false} /> Hayır</label>
        <small id={`${onek}-baslica`} className="docentlik-ipucu">
          {tekYazar ? "Tek yazarlı faaliyette başlıca yazar sayılırsınız." : "Puan, kriterin başlıca / diğer yazar katsayısına göre paylaştırılır."}
        </small>
      </fieldset>

      <label>
        <span>Faaliyet tarihi</span>
        <TarihSecici name="faaliyet_tarihi" max={bugun} defaultValue={mevcut?.faaliyet_tarihi ?? ""} aria-label="Faaliyet tarihi" />
      </label>

      <label className="wide">
        <span>Notlar</span>
        <textarea name="notlar" maxLength={2000} rows={3} defaultValue={mevcut?.notes ?? ""} placeholder="Dergi, cilt/sayı, proje kodu gibi ayrıntılar" />
      </label>

      <div className="wide panel-form-actions kayit-formu-eylem">
        <p id={`${onek}-not`}>
          <b className="req" aria-hidden="true">*</b> işaretli alanlar zorunlu. Puanı sistem hesaplar; tarihi boş bırakılan faaliyet doktora sonrası şartlarına sayılmaz.
        </p>
        <GonderDugmesi bekleyenEtiket="Kaydediliyor…">{mevcut ? "Değişiklikleri kaydet" : "Faaliyeti ekle"}</GonderDugmesi>
      </div>
    </form>
  );
}
