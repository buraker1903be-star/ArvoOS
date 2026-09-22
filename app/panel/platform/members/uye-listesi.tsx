"use client";

import { useMemo, useState, useTransition } from "react";
import type { DirectoryRow, MemberProduct } from "@/lib/member-directory";
import { basHarfleri, tarih } from "../bicim";
import { uyeErisimiDegistir } from "./actions";

/*
  Tüm üyeler: tek liste, üstte süzgeçler.

  Eskiden dört ayrı tablo vardı (ArvoOS, ArvoLab, Arc, Randevu) ve dördü de
  aynı sütunlara sahipti. Aynı kişi üç tabloda birden görünüyor, "bu kişiyi
  nereden kapatacağım" sorusu her seferinde tabloları taramakla
  yanıtlanıyordu.

  Tek listeye geçtikten sonra kalan üç sorun 22.09.2026'da düzeltildi:

    1. Her satırda tam boy bir "Erişimi kapat" düğmesi vardı. On iki satır
       on iki ağır düğme demekti ve düğmenin yazısı DURUMU değil yapılacak
       işi söylüyordu — durumu okumak için yanındaki rozete bakmak
       gerekiyordu. Modül matrisinde aynı sorunu anahtarla çözmüştük;
       burada da anahtar var: sağdaysa açık, soldaysa kapalı.
    2. Aynı kişi art arda beş satırda görünüyor ve e-postası beş kez
       yazılıyordu. Liste artık kişiye göre sıralı ve aynı kişinin ikinci
       satırından itibaren ad/e-posta tekrar edilmiyor; satır kimin
       olduğunu soldaki ince çizgiden belli ediyor.
    3. Durum iki kelimeyle yazılıyordu ("Açık" rozeti + altında "Aktif").
       Erişim artık anahtarda, rozet yalnızca lisans/abonelik durumunu
       söylüyor.

  Satır başına TEK işlem var: erişimi aç/kapat. Rol değiştirme ve silme
  bilerek yok — biri geri alınamaz, diğeri kurumun kendi kararı.
*/

const URUN_ADI: Record<MemberProduct, string> = {
  arvoos: "ArvoOS", arvolab: "ArvoLab", arc: "Arc", randevu: "Randevu",
};

const ROL_ADI: Record<string, string> = {
  owner: "Kurum sahibi", admin: "Yönetici", manager: "Müdür", member: "Üye", viewer: "İzleyici",
  client: "Üye", employee: "Çalışan", expert: "Uzman", controller: "Kontrolör",
  operasyoncu: "Operasyon personeli",
  academic_manager: "Akademik yönetici", system_admin: "Sistem yöneticisi", founder: "Kurucu",
};

const DURUM_ADI: Record<string, string> = {
  active: "Aktif", trialing: "Deneme", past_due: "Ödeme gecikmiş", suspended: "Askıda",
  canceled: "İptal", inactive: "Kapalı", "lisans yok": "Lisans yok",
  "abonelik yok": "Abonelik yok", "iç ekip": "İç ekip", "erişim kapalı": "Erişim kapalı",
};

const DURUM_TONU: Record<string, string> = {
  active: "success", trialing: "info", past_due: "warning",
  suspended: "danger", canceled: "danger", inactive: "neutral",
};

/** Türkçe duyarsız arama: "İş" ile "is" eşleşsin. */
const sadelestir = (value: string) =>
  value
    .replace(/İ/g, "i").replace(/I/g, "ı")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c");

type Suzgec = "hepsi" | "acik" | "kapali";

/** Aynı kişinin satırlarını bir arada tutmak için kimlik. */
const kisiAnahtari = (satir: DirectoryRow) => satir.email ?? satir.userId;

export function UyeListesi({ satirlar }: { satirlar: DirectoryRow[] }) {
  const [arama, setArama] = useState("");
  const [urun, setUrun] = useState<MemberProduct | "hepsi">("hepsi");
  const [erisim, setErisim] = useState<Suzgec>("hepsi");
  const [islenen, setIslenen] = useState<string | null>(null);
  const [, basla] = useTransition();

  const gorunen = useMemo(() => {
    const anahtar = sadelestir(arama.trim());
    const suzulmus = satirlar.filter((satir) => {
      if (urun !== "hepsi" && satir.product !== urun) return false;
      if (erisim === "acik" && !satir.access) return false;
      if (erisim === "kapali" && satir.access) return false;
      if (!anahtar) return true;
      return sadelestir(`${satir.name ?? ""} ${satir.email ?? ""} ${satir.scope}`).includes(anahtar);
    });
    /*
      Kişiye göre sıralı: aynı kişinin beş kaydı listenin beş ayrı yerine
      dağılmış olarak okunmuyordu. Ad varsa ada, yoksa e-postaya göre.
    */
    return [...suzulmus].sort((a, b) =>
      (a.name || a.email || "").localeCompare(b.name || b.email || "", "tr")
      || URUN_ADI[a.product].localeCompare(URUN_ADI[b.product], "tr")
      || a.scope.localeCompare(b.scope, "tr"));
  }, [satirlar, arama, urun, erisim]);

  const degistir = (satir: DirectoryRow) => {
    if (!satir.organizationId) return;
    const ad = satir.name || satir.email || "bu kullanıcı";
    const acilacak = !satir.membershipActive;
    if (!window.confirm(acilacak
      ? `${ad} için ${satir.scope} erişimi açılsın mı?`
      : `${ad} için ${satir.scope} erişimi kapatılsın mı? Kişi kurumun paneline giremez.`)) return;

    const anahtar = `${satir.organizationId}:${satir.userId}`;
    setIslenen(anahtar);
    basla(async () => {
      try {
        const veri = new FormData();
        veri.set("organization_id", satir.organizationId!);
        veri.set("user_id", satir.userId);
        veri.set("acik", acilacak ? "1" : "0");
        await uyeErisimiDegistir(veri);
      } finally {
        // Başarısızlıkta da bırakılmalı; yoksa düğme kilitli kalır.
        setIslenen(null);
      }
    });
  };

  return (
    <section className="panel-card plt-uyeler-karti" aria-label="Üyeler">
      <div className="plt-uye-arac">
        <label className="plt-abone-arama">
          <span className="plt-gizli">Üyelerde ara</span>
          <input
            type="search" value={arama} placeholder="Ad, e-posta ya da kurum ara"
            onChange={(olay) => setArama(olay.target.value)}
          />
        </label>
        <select value={urun} onChange={(olay) => setUrun(olay.target.value as MemberProduct | "hepsi")} aria-label="Ürün">
          <option value="hepsi">Tüm ürünler</option>
          {(Object.keys(URUN_ADI) as MemberProduct[]).map((kod) => (
            <option key={kod} value={kod}>{URUN_ADI[kod]}</option>
          ))}
        </select>
        <select value={erisim} onChange={(olay) => setErisim(olay.target.value as Suzgec)} aria-label="Erişim">
          <option value="hepsi">Tüm erişimler</option>
          <option value="acik">Erişimi açık</option>
          <option value="kapali">Erişimi kapalı</option>
        </select>
        <span className="plt-uye-sayi">{gorunen.length} kayıt</span>
      </div>

      {gorunen.length ? (
        <>
          <div className="plt-uye-baslik" aria-hidden="true">
            <span>Kişi</span><span>Ürün</span><span>Bağlı olduğu</span><span>Rol</span><span>Durum</span><span>Erişim</span>
          </div>
          <div className="plt-uye-liste">
            {gorunen.map((satir, sira) => {
              const anahtar = `${satir.product}-${satir.userId}-${satir.scope}`;
              const islem = satir.organizationId ? `${satir.organizationId}:${satir.userId}` : null;
              // Aynı kişinin ikinci satırından itibaren ad/e-posta tekrar edilmiyor.
              const devam = sira > 0 && kisiAnahtari(gorunen[sira - 1]) === kisiAnahtari(satir);
              const kim = satir.name || satir.email || "Adı kayıtlı değil";
              return (
                <div key={anahtar} className="plt-uye-satir" data-devam={devam}>
                  <span className="plt-uye-kisi">
                    {devam ? (
                      <span className="plt-uye-devam" aria-hidden="true" />
                    ) : (
                      <span className="plt-kiraci-avatar plt-uye-avatar" aria-hidden="true">{basHarfleri(kim)}</span>
                    )}
                    <span className="plt-uye-ad">
                      {/* Ekran okuyucu için ad her satırda yazılıyor; yalnızca
                          GÖRSEL olarak tekrar edilmiyor. */}
                      <b className={devam ? "plt-gizli" : undefined}>{kim}</b>
                      {!devam && satir.name && satir.email ? <small>{satir.email}</small> : null}
                    </span>
                  </span>
                  <span data-etiket="Ürün"><span className="plt-urun-etiketi" data-urun={satir.product}>{URUN_ADI[satir.product]}</span></span>
                  <span data-etiket="Bağlı olduğu">{satir.individual ? "Bireysel" : satir.scope}</span>
                  <span data-etiket="Rol" className="plt-uye-rolu">{satir.role ? ROL_ADI[satir.role] ?? satir.role : "—"}</span>
                  <span data-etiket="Durum">
                    <span className="status-pill" data-tone={DURUM_TONU[satir.status] ?? "neutral"}>
                      {DURUM_ADI[satir.status] ?? satir.status}
                    </span>
                    {/* Dönem sonu yalnızca varsa: her satırda "—" yazmak
                        sütunu doldurup hiçbir şey söylemiyordu. */}
                    {satir.periodEnd ? <small className="plt-substatus">{tarih(satir.periodEnd)}</small> : null}
                  </span>
                  <span data-etiket="Erişim" className="plt-uye-erisim">
                    {satir.organizationId ? (
                      <button
                        type="button"
                        className={satir.membershipActive ? "plt-switch is-on" : "plt-switch is-off"}
                        role="switch"
                        aria-checked={Boolean(satir.membershipActive)}
                        aria-label={`${kim} · ${satir.scope} erişimi: ${satir.membershipActive ? "kapat" : "aç"}`}
                        disabled={islenen === islem}
                        onClick={() => degistir(satir)}
                      ><i /></button>
                    ) : (
                      /* ArvoLab ayrı veritabanında, bireysel abone ise
                         Bireysel Aboneler ekranından yönetiliyor. Boş
                         bırakmak yerine nedenini yazıyoruz. */
                      <small className="plt-substatus">
                        {satir.individual ? "Bireysel abonelerden" : "ArvoLab'dan"}
                      </small>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p className="plt-substatus">Aramanıza uyan üye yok.</p>
      )}
    </section>
  );
}
