import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { postaDurumu } from "@/lib/posta-hesabi";
import { yeniPostaGonder } from "../actions";
import "../posta.css";
import "../../crm/kayit-detay/kayit-detay.css";

/*
  YENİ POSTA.

  Kutu şimdiye kadar yalnızca gelen bir mesaja cevap verebiliyordu;
  müşteriye ilk mesajı atmak için Gmail'e geçmek gerekiyordu ve o mesaj
  panelde hiç görünmüyordu — ortak kutunun "ekip ne yazdı" sorusuna
  cevabı eksik kalıyordu.

  Alanlar adresten ön doldurulabiliyor (CRM kaydındaki "Posta gönder"
  bağlantısı böyle çalışıyor). Adresten gelen değer yalnızca formun
  başlangıç hâli; gönderimde sunucu hepsini yeniden doğruluyor.
*/

export const dynamic = "force-dynamic";

export default async function YeniPostaPage({ searchParams }: {
  searchParams: Promise<{ alici?: string; konu?: string; firsat?: string }>;
}) {
  const { alici, konu, firsat } = await searchParams;
  const { membership, izin } = await getPanelContext();
  const hesap = await postaDurumu(membership.organization_id);

  if (!izin("posta.yanitla")) {
    return <main className="talep cari">
      <header className="talep-bas"><div className="talep-bas-metin"><small className="panel-kicker">ORTAK POSTA KUTUSU</small><h1>Yeni posta</h1></div></header>
      <section className="panel-card"><div className="crm-empty-state"><p>Bu kutudan posta gönderme yetkiniz yok.</p></div></section>
    </main>;
  }

  if (hesap.durum !== "bagli") {
    return <main className="talep cari">
      <header className="talep-bas"><div className="talep-bas-metin"><small className="panel-kicker">ORTAK POSTA KUTUSU</small><h1>Yeni posta</h1></div></header>
      <section className="panel-card">
        <div className="crm-empty-state">
          <p>Ortak posta kutusu bağlı değil.</p>
          <small>Ayarlar → Bağlantılar bölümünden kutuyu bağlayın.</small>
        </div>
      </section>
    </main>;
  }

  return <main className="talep cari">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">ORTAK POSTA KUTUSU</small>
        <h1>Yeni posta</h1>
        <p>{hesap.adres} adresinden gidecek.</p>
      </div>
      <div className="talep-bas-eylem"><Link className="panel-secondary" href="/panel/posta">← Gelen kutusu</Link></div>
    </header>

    <form className="panel-card posta-yanit" action={yeniPostaGonder}>
      {firsat ? <input type="hidden" name="opportunity_id" value={firsat} /> : null}
      <label htmlFor="posta-alici">
        <b>Alıcı</b>
        <small>Birden çok adres için virgülle ayırın.</small>
      </label>
      <input id="posta-alici" name="alici" type="text" required defaultValue={alici ?? ""} autoComplete="off" placeholder="musteri@ornek.com" />

      <label htmlFor="posta-konu"><b>Konu</b></label>
      <input id="posta-konu" name="konu" type="text" required maxLength={300} defaultValue={konu ?? ""} autoComplete="off" />

      <label htmlFor="posta-metin"><b>Mesaj</b></label>
      <textarea id="posta-metin" name="govde" rows={10} required maxLength={20000} placeholder="Mesajınızı yazın…" />

      <label className="posta-ek-sec">
        <span>Ek dosya</span>
        <input type="file" name="ekler" multiple />
      </label>

      <div className="posta-yanit-alt">
        <small>Düz metin olarak gönderilir. Ekler toplam en fazla 3 MB.{firsat ? " Gönderilen posta bu müşteri kaydına bağlanacak." : ""}</small>
        <button className="panel-primary" type="submit">Gönder</button>
      </div>
    </form>
  </main>;
}
