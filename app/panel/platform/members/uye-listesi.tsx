"use client";

import { useMemo, useState, useTransition } from "react";
import type { DirectoryRow, MemberProduct } from "@/lib/member-directory";
import { uyeErisimiDegistir } from "./actions";

/*
  Tüm üyeler: tek liste, üstte filtreler.

  Eskiden dört ayrı tablo vardı (ArvoOS, ArvoLab, Arc, Randevu) ve dördü de
  aynı sütunlara sahipti. Aynı kişi üç tabloda birden görünüyor, "bu kişiyi
  nereden kapatacağım" sorusu her seferinde tabloları taramakla
  yanıtlanıyordu. Tek liste + filtre hem daha az yer kaplıyor hem de
  aranan kişiyi tek yerde buluyor.

  Satır başına TEK işlem var: erişimi aç/kapat. Rol değiştirme, silme gibi
  işlemler bilerek yok — biri geri alınamaz, diğeri kurum içi bir karar ve
  kurumun kendi panelinde yapılıyor.
*/

const URUN_ADI: Record<MemberProduct, string> = {
  arvoos: "ArvoOS", arvolab: "ArvoLab", arc: "Arc", randevu: "Randevu",
};

const ROL_ADI: Record<string, string> = {
  owner: "Kurum sahibi", admin: "Yönetici", manager: "Müdür", member: "Üye", viewer: "İzleyici",
  client: "Üye", employee: "Çalışan", expert: "Uzman", controller: "Kontrolör",
  academic_manager: "Akademik yönetici", system_admin: "Sistem yöneticisi", founder: "Kurucu",
};

const DURUM_ADI: Record<string, string> = {
  active: "Aktif", trialing: "Deneme", past_due: "Ödeme gecikmiş", suspended: "Askıda",
  canceled: "İptal", inactive: "Kapalı", "lisans yok": "Lisans yok",
  "abonelik yok": "Abonelik yok", "iç ekip": "İç ekip", "erişim kapalı": "Erişim kapalı",
};

const tarih = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" }) : "—";

/** Türkçe duyarsız arama: "İş" ile "is" eşleşsin. */
const sadelestir = (value: string) =>
  value
    .replace(/İ/g, "i").replace(/I/g, "ı")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c");

type Suzgec = "hepsi" | "acik" | "kapali";

export function UyeListesi({ satirlar }: { satirlar: DirectoryRow[] }) {
  const [arama, setArama] = useState("");
  const [urun, setUrun] = useState<MemberProduct | "hepsi">("hepsi");
  const [erisim, setErisim] = useState<Suzgec>("hepsi");
  const [islenen, setIslenen] = useState<string | null>(null);
  const [, basla] = useTransition();

  const gorunen = useMemo(() => {
    const anahtar = sadelestir(arama.trim());
    return satirlar.filter((satir) => {
      if (urun !== "hepsi" && satir.product !== urun) return false;
      if (erisim === "acik" && !satir.access) return false;
      if (erisim === "kapali" && satir.access) return false;
      if (!anahtar) return true;
      return sadelestir(`${satir.name ?? ""} ${satir.email ?? ""} ${satir.scope}`).includes(anahtar);
    });
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
    <section className="panel-card management-card" aria-label="Üyeler">
      <div className="uye-suzgec">
        <input
          type="search"
          value={arama}
          onChange={(olay) => setArama(olay.target.value)}
          placeholder="Ad, e-posta ya da kurum ara"
          aria-label="Üyelerde ara"
        />
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
        <span className="uye-sayi">{gorunen.length} kayıt</span>
      </div>

      {gorunen.length ? (
        <div className="plt-table-scroll">
          <table className="plt-table">
            <thead>
              <tr>
                <th>Kişi</th><th>Ürün</th><th>Bağlı olduğu</th><th>Rol</th><th>Durum</th><th>Dönem sonu</th><th aria-label="İşlem" />
              </tr>
            </thead>
            <tbody>
              {gorunen.map((satir) => {
                const anahtar = `${satir.product}-${satir.userId}-${satir.scope}`;
                const islem = satir.organizationId ? `${satir.organizationId}:${satir.userId}` : null;
                return (
                  <tr key={anahtar}>
                    <td>
                      <b>{satir.name ?? "—"}</b>
                      <small className="plt-substatus plt-mono">{satir.email ?? "—"}</small>
                    </td>
                    <td>{URUN_ADI[satir.product]}</td>
                    <td>{satir.individual ? <span className="status-pill" data-tone="info">Bireysel</span> : satir.scope}</td>
                    <td>{satir.role ? ROL_ADI[satir.role] ?? satir.role : "—"}</td>
                    <td>
                      <span className="status-pill" data-tone={satir.access ? "success" : "danger"}>
                        {satir.access ? "Açık" : "Kapalı"}
                      </span>
                      <small className="plt-substatus">{DURUM_ADI[satir.status] ?? satir.status}</small>
                    </td>
                    <td>{tarih(satir.periodEnd)}</td>
                    <td className="uye-islem">
                      {satir.organizationId ? (
                        <button
                          type="button"
                          className="panel-secondary"
                          disabled={islenen === islem}
                          onClick={() => degistir(satir)}
                        >
                          {islenen === islem ? "…" : satir.membershipActive ? "Erişimi kapat" : "Erişimi aç"}
                        </button>
                      ) : (
                        /* ArvoLab ayrı veritabanında, bireysel abone ise
                           Bireysel Aboneler ekranından yönetiliyor. Boş
                           bırakmak yerine nedenini yazıyoruz. */
                        <small className="plt-substatus">
                          {satir.individual ? "Bireysel abonelerden" : "ArvoLab'dan yönetilir"}
                        </small>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="panel-muted">Aramanıza uyan üye yok.</p>
      )}
    </section>
  );
}
