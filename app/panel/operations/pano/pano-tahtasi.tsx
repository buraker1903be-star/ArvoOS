"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { moveWorkflowToStage, setStepDueDate, setStepStatus } from "../actions";
import {
  BEKLEME_ESIGI_GUN,
  TAMAMLANDI_KOLONU,
  tasimaPlani,
  type PanoIsKarti,
  type PanoKolonu,
} from "@/lib/operasyon-panosu";
import { hatirlatmaDurumu } from "@/lib/is-adimlari";
import { initials } from "@/lib/table-format";
import { dueBadge, priorityNames } from "../ops-shared";

/*
  Panonun etkileşimli yüzü: SÜRÜKLE-BIRAK ve HIZLI BAKIŞ.

  Sürükleme neden istemci bileşeni: bırakma olayı tarayıcıda oluşuyor ve
  sunucu bileşeni olay dinleyemiyor. Veri yine sunucuda hazırlanıyor
  (page.tsx), burada yalnızca çizim ve etkileşim var.

  DÜĞMELER KALDI. Sürükle-bırak dokunmatikte çalışmıyor (HTML5 drag olayları
  telefonda hiç doğmuyor) ve klavyeyle de yapılamıyor; "Tamamla → / ← Geri al"
  düğmeleri bu iki kullanıcının tek yolu. Sürüklemeyi tek yol yapmak panoyu
  telefondan açan operasyoncu için kullanılamaz hâle getirirdi.

  BIRAKMADAN ÖNCE NE OLACAĞI YAZIYOR. Kartın kolonu "tamamlanmayan ilk adım"
  olduğu için 2. kolondan 5. kolona sürüklemek aradaki aşamaları da kapatıyor
  (gerekçesi lib/operasyon-panosu.ts'te). Bu sessizce yapılırsa kullanıcı tek
  hareketle üç aşamayı bitirmiş olur ve farkına varmaz; hedef kolon bu yüzden
  sürükleme sırasında "2 aşama kapanacak" diye yazıyor. Plan istemcide
  yalnızca BU YAZI için hesaplanıyor — sunucu kendi planını baştan kuruyor.
*/

export interface TahtaProps {
  kolonlar: PanoKolonu[];
  bugun: string;
  /** İşin aşamalarını değiştirme/tarih girme yetkisi olan işlerin kimlikleri. */
  yetkiliIsler: string[];
  /** İş kimliği → okunmamış müşteri mesajı sayısı. */
  okunmamis: Record<string, number>;
}

const kisaTarih = (gun: string) =>
  new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short" }).format(
    new Date(`${gun}T12:00:00`),
  );

/** Kolonun taşıma hedefi olarak karşılığı: "Tamamlandı" başlık değil, sentinel. */
const kolonHedefi = (kolon: PanoKolonu) => (kolon.tur === "tamamlandi" ? TAMAMLANDI_KOLONU : kolon.baslik);

export function PanoTahtasi({ kolonlar, bugun, yetkiliIsler, okunmamis }: TahtaProps) {
  const router = useRouter();
  const [bekliyor, basla] = useTransition();
  const [suruklenen, setSuruklenen] = useState<PanoIsKarti | null>(null);
  const [hedef, setHedef] = useState<string | null>(null);
  const [acikId, setAcikId] = useState<string | null>(null);
  const pencere = useRef<HTMLDialogElement>(null);
  const yetkili = new Set(yetkiliIsler);

  /*
    Açık pencere KİMLİĞİ tutuluyor, kartın kendisi değil. Kart nesnesi
    saklansaydı pencere içinden girilen tarih kaydedildikten sonra ekran
    tazelenir ama pencere eski değeri göstermeye devam ederdi — kullanıcı
    kaydın kaybolduğunu sanardı.
  */
  const acik = acikId ? kolonlar.flatMap((kolon) => kolon.kartlar).find((kart) => kart.isId === acikId) ?? null : null;

  // İş panodan düşerse (arşiv, iptal) açık pencere boş kalmasın.
  useEffect(() => {
    if (acikId && !acik) pencere.current?.close();
  }, [acikId, acik]);

  const kartiAc = (kart: PanoIsKarti) => {
    setAcikId(kart.isId);
    pencere.current?.showModal();
  };

  const islemYap = (calistir: () => Promise<unknown>) =>
    basla(async () => {
      await calistir();
      /*
        Sunucu işlemi revalidatePath çağırıyor ama hata durumunda mesaj
        çereze yazılıyor; bildirimin görünmesi için ağacın yeniden
        çizilmesi gerekiyor.
      */
      router.refresh();
    });

  const tasi = (kart: PanoIsKarti, kolon: PanoKolonu) => {
    const veri = new FormData();
    veri.set("workflow_id", kart.isId);
    veri.set("stage", kolonHedefi(kolon));
    islemYap(() => moveWorkflowToStage(veri));
  };

  const adimDurumu = (adimId: string, status: "done" | "in_progress") => {
    const veri = new FormData();
    veri.set("step_id", adimId);
    veri.set("status", status);
    islemYap(() => setStepStatus(veri));
  };

  /*
    Bırakıldığında ne olacağı. Kart zaten hedef kolondaysa ya da taşıma
    geçersizse (o işte böyle bir aşama yok) null dönüyor ve kolon
    "bırakılabilir" görünmüyor — kullanıcı boşa sürüklemesin.
  */
  const birakmaOzeti = (kart: PanoIsKarti | null, kolon: PanoKolonu) => {
    if (!kart || kolon.tur === "sablon_disi" || !yetkili.has(kart.isId)) return null;
    if (kolon.kartlar.some((k) => k.isId === kart.isId)) return null;
    const plan = tasimaPlani(kart.adimlar, kolon.tur === "tamamlandi" ? null : kolon.baslik);
    if (!plan) return null;
    const parca = [
      plan.tamamlanacak.length ? `${plan.tamamlanacak.length} aşama kapanacak` : null,
      plan.acilacak.length ? `${plan.acilacak.length} aşama yeniden açılacak` : null,
    ].filter(Boolean);
    return parca.length ? parca.join(", ") : "aşamalar değişmeyecek";
  };

  return (
    <>
      <div className="ops-pano" data-bekliyor={bekliyor ? "1" : undefined} data-surukleniyor={suruklenen ? "1" : undefined}>
        {kolonlar.map((kolon) => {
          const ozet = birakmaOzeti(suruklenen, kolon);
          return (
            <section
              className="ops-pano-kolon"
              key={kolon.anahtar}
              data-tur={kolon.tur}
              /* Boş kolon dar bir şerit; sürükleme sırasında açılır ki bırakılabilsin. */
              data-bos={kolon.kartlar.length ? undefined : "1"}
              title={kolon.kartlar.length ? undefined : `${kolon.baslik}: bu aşamada iş yok`}
              data-hedef={hedef === kolon.anahtar && ozet ? "1" : undefined}
              onDragOver={(olay) => {
                if (!ozet) return;
                // preventDefault olmadan tarayıcı bırakmaya izin vermiyor.
                olay.preventDefault();
                setHedef(kolon.anahtar);
              }}
              onDragLeave={() => setHedef((onceki) => (onceki === kolon.anahtar ? null : onceki))}
              onDrop={(olay) => {
                olay.preventDefault();
                setHedef(null);
                if (suruklenen && ozet) tasi(suruklenen, kolon);
                setSuruklenen(null);
              }}
            >
              <header>
                {/* Numara ŞABLONDAKİ sıra: atlanan aşama boşlukla görünüyor. */}
                {kolon.tur === "asama" ? <i aria-hidden="true">{kolon.sira}</i> : null}
                <b>{kolon.baslik}</b>
                <span>{kolon.kartlar.length}</span>
              </header>
              {ozet ? <p className="ops-pano-birak">Buraya bırak · {ozet}</p> : null}
              <div className="ops-pano-kartlar">
                {kolon.kartlar.length ? null : <p className="ops-pano-bos-not">Bu aşamada iş yok</p>}
                {kolon.kartlar.map((kart) => (
                  <Kart
                    key={kart.isId}
                    kart={kart}
                    bugun={bugun}
                    yetkili={yetkili.has(kart.isId)}
                    okunmamis={okunmamis[kart.isId] ?? 0}
                    suruklenebilir={yetkili.has(kart.isId) && !bekliyor}
                    onSurukle={() => setSuruklenen(kart)}
                    onBitti={() => {
                      setSuruklenen(null);
                      setHedef(null);
                    }}
                    onAc={() => kartiAc(kart)}
                    onDurum={adimDurumu}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <HizliBakis
        pencere={pencere}
        kart={acik}
        bugun={bugun}
        yetkili={acik ? yetkili.has(acik.isId) : false}
        onDurum={adimDurumu}
        onKapat={() => setAcikId(null)}
      />
    </>
  );
}

/*
  KART (2026-10, panel kalitesi). Eskiden kart ~255px'ti: üst şerit,
  başlık, sorumlu satırı, satır içi tarih formu, aşama, sayaç ve iki
  tam genişlik düğme alt alta. Bir kolonda üç kart ekranı dolduruyordu.

  Şimdi ~130px: başlık ve müşteri; şu anki görev; öncelik ve aşama
  tarihi rozetleri; altta sorumlu, aşama sayısı ve küçük düğmeler.
  TARİH FORMU KARTTAN ÇIKTI: tarihsiz aşamada "Tarih gir" rozeti hızlı
  bakışı açıyor ve orada her aşamanın tarihi girilebiliyor (kart
  üstündeki tek aşama yerine bütün plan). Yetkisi olmayana rozet
  yalnızca "Tarih yok" diyor.

  draggable={false} bağlantılarda: tarayıcı bağlantıyı kendiliğinden
  sürükleniyor ve kartın başlığından tutan kullanıcı kartı değil
  bağlantıyı sürüklüyordu.
*/
function Kart({
  kart,
  bugun,
  yetkili,
  okunmamis,
  suruklenebilir,
  onSurukle,
  onBitti,
  onAc,
  onDurum,
}: {
  kart: PanoIsKarti;
  bugun: string;
  yetkili: boolean;
  okunmamis: number;
  suruklenebilir: boolean;
  onSurukle: () => void;
  onBitti: () => void;
  onAc: () => void;
  onDurum: (adimId: string, status: "done" | "in_progress") => void;
}) {
  const uyari = hatirlatmaDurumu({ due_date: kart.tarih, is_completed: kart.tamamlandi }, bugun);
  // AŞAMANIN tarihi (işin termini değil): panoda karar verdiren tarih bu.
  const termin = dueBadge(kart.tarih, bugun, kart.tamamlandi ? "completed" : undefined);
  const yuzde = kart.toplamAsama ? Math.round((kart.tamamlananAsama / kart.toplamAsama) * 100) : 0;
  const uzunBekleme = kart.bekleyenGun !== null && kart.bekleyenGun >= BEKLEME_ESIGI_GUN;

  return (
    <article
      className="ops-pano-kart"
      data-tone={uyari ?? undefined}
      draggable={suruklenebilir}
      onDragStart={onSurukle}
      onDragEnd={onBitti}
    >
      {/* Okunmamış müşteri mesajı başlıktan önce: başlığı okumadan görünmeli. */}
      {okunmamis ? (
        <Link className="ops-pano-mesaj" href={`/panel/operations/${kart.isId}?pencere=mesajlar`} draggable={false}>
          {okunmamis} yeni müşteri mesajı
        </Link>
      ) : null}
      <Link className="ops-pano-baslik" href={`/panel/operations/${kart.isId}`} draggable={false}>
        {/* Uzun başlık iki satıra kırpılıyor; tamamı title'da. */}
        <b title={kart.baslik}>{kart.baslik}</b>
        <small title={kart.musteri}>{kart.musteri}</small>
      </Link>
      {/* Şu anki görev: kolon aşamayı söylüyor, bu satır görevi. */}
      <p className="ops-pano-asama" title={kart.guncelAsama ?? undefined}>
        {kart.tamamlandi ? "Bütün görevler bitti" : kart.guncelAsama ?? "Görev üretilmemiş"}
      </p>
      <div className="ops-pano-rozetler">
        {kart.oncelik && kart.oncelik !== "normal" ? (
          <span className="ops-pano-oncelik" data-oncelik={kart.oncelik}>{priorityNames[kart.oncelik] ?? kart.oncelik}</span>
        ) : null}
        {kart.tarih || kart.tamamlandi ? (
          <span className="ops-pano-termin" data-tone={termin.tone} title={kart.tarih ? `“${kart.guncelAsama}” aşamasının tarihi: ${kisaTarih(kart.tarih)}` : undefined}>
            {termin.label}
          </span>
        ) : kart.guncelAsamaId ? (
          yetkili ? (
            <button type="button" className="ops-pano-tarih-gir" onClick={onAc} title="Aşamaların tarihini gir">Tarih gir</button>
          ) : (
            <span className="ops-pano-termin" data-tone="neutral">Tarih yok</span>
          )
        ) : null}
        {/* Tarihsiz aşamada tek sinyal: kaç gündür bu aşamada (geri sayım değil). */}
        {kart.guncelAsamaId && !kart.tarih && kart.bekleyenGun !== null ? (
          <span className="ops-pano-bekleme" data-uzun={uzunBekleme ? "1" : undefined}>{kart.bekleyenGun} gündür</span>
        ) : null}
      </div>
      <footer className="ops-pano-alt">
        <span className="ops-pano-kisi" title={kart.sorumluAdi ?? "Sorumlu atanmadı"}>
          <i aria-hidden="true" data-bos={kart.sorumluAdi ? undefined : "1"}>{kart.sorumluAdi ? initials(kart.sorumluAdi) : "?"}</i>
          <span>{kart.tamamlananAsama}/{kart.toplamAsama}</span>
        </span>
        {/* Düğmeler: dokunmatik ve klavye için (sürükleme orada çalışmıyor). */}
        <span className="ops-pano-dugmeler">
          {yetkili && kart.oncekiAsamaId ? (
            <button type="button" onClick={() => onDurum(kart.oncekiAsamaId!, "in_progress")} title="Bir önceki aşamayı yeniden aç" aria-label="Geri al">←</button>
          ) : null}
          {yetkili && kart.guncelAsamaId ? (
            <button type="button" data-tone="success" onClick={() => onDurum(kart.guncelAsamaId!, "done")} title={`“${kart.guncelAsama}” görevini tamamla`}>Tamamla</button>
          ) : null}
          <button type="button" onClick={onAc} title="Bütün aşamalar ve tarihleri" aria-label="Bütün aşamalar">⋯</button>
        </span>
      </footer>
      {/* İlerleme kartın alt kenarında: kolonu tarayan göz yüzdeleri aynı hizada karşılaştırıyor. */}
      <div className="ops-pano-ilerleme" title={`${kart.tamamlananAsama}/${kart.toplamAsama} aşama tamam`}>
        <i style={{ width: `${yuzde}%` }} />
      </div>
    </article>
  );
}

/*
  HIZLI BAKIŞ. Kart tıklanınca iş detayına gitmek panoyu kapatıyordu ve
  operasyoncu "hangi aşamadayız" sorusunu her iş için ayrı sayfada
  yanıtlamak zorunda kalıyordu. Burada işin BÜTÜN aşamaları, tarihleri ve
  sorumlularıyla görünüyor; tarih ve durum buradan da değiştirilebiliyor.

  İş detayının yerini almıyor: yorum, dosya, müşteri yazışması ve kayıt
  geçmişi orada kalıyor ve pencerenin altında oraya giden bağlantı var.
*/
function HizliBakis({
  pencere,
  kart,
  bugun,
  yetkili,
  onDurum,
  onKapat,
}: {
  pencere: React.RefObject<HTMLDialogElement | null>;
  kart: PanoIsKarti | null;
  bugun: string;
  yetkili: boolean;
  onDurum: (adimId: string, status: "done" | "in_progress") => void;
  onKapat: () => void;
}) {
  return (
    <dialog className="ops-pano-pencere" ref={pencere} onClose={onKapat}>
      {kart ? (
        <>
          <header>
            <div>
              <b>{kart.baslik}</b>
              <small>{kart.musteri}</small>
            </div>
            <button type="button" onClick={() => pencere.current?.close()} aria-label="Kapat">✕</button>
          </header>
          <ol className="ops-pano-adimlar">
            {kart.adimlar.map((adim) => {
              const uyari = hatirlatmaDurumu({ due_date: adim.due_date, is_completed: adim.is_completed }, bugun);
              return (
                <li key={adim.id} data-durum={adim.is_completed ? "bitti" : adim.guncel ? "guncel" : "bekliyor"}>
                  <div className="ops-pano-adim-ad">
                    <b>{adim.is_completed ? "✓ " : adim.guncel ? "▸ " : ""}{adim.title}</b>
                    <small>{adim.sorumluAdi ?? "sorumlu yok"}</small>
                  </div>
                  <div className="ops-pano-adim-sag">
                    {yetkili ? (
                      <form action={setStepDueDate} className="ops-tarih-form">
                        <input type="hidden" name="step_id" value={adim.id} />
                        <input type="date" name="due_date" defaultValue={adim.due_date ?? ""} aria-label={`${adim.title} teslim tarihi`} />
                        <button type="submit" title="Tarihi kaydet" aria-label="Tarihi kaydet">✓</button>
                      </form>
                    ) : (
                      <span className="ops-pano-tarih-metin">{adim.due_date ? kisaTarih(adim.due_date) : "tarih yok"}</span>
                    )}
                    {uyari ? (
                      <em data-tone={uyari === "overdue" ? "danger" : "warning"}>
                        {uyari === "overdue" ? "gecikti" : "yaklaştı"}
                      </em>
                    ) : null}
                    {yetkili ? (
                      <button
                        type="button"
                        className="ops-pano-adim-dugme"
                        onClick={() => onDurum(adim.id, adim.is_completed ? "in_progress" : "done")}
                      >
                        {adim.is_completed ? "Geri al" : "Tamamla"}
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
            {!kart.adimlar.length ? <li className="ops-pano-adim-yok">Bu iş için henüz aşama üretilmemiş.</li> : null}
          </ol>
          <footer>
            <Link href={`/panel/operations/${kart.isId}`}>İş detayı · yorum, dosya ve kayıt geçmişi →</Link>
          </footer>
        </>
      ) : null}
    </dialog>
  );
}
