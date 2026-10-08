"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { basHarfler, CANLI_GUNCELLEME_OLAYI, etkinUygulama, type OsUygulama } from "./os-apps";

/* Durum çubuğunda kurum adının altında açık uygulamanın adı. */
export function OsUygulamaAdi({ uygulamalar }: { uygulamalar: OsUygulama[] }) {
  const yol = usePathname();
  return <small className="os-brand-app">{etkinUygulama(uygulamalar, yol)?.label ?? "Panel"}</small>;
}

/*
  Saat Türkiye saatiyle (AGENTS.md: tarih Türkiye saatiyle). Sunucu UTC'de;
  ilk çizim boş, saat hidrasyondan sonra yazılır ki sunucu ile istemci
  farklı metin çizip uyuşmazlık vermesin.
*/
const saatBicimi = new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });

export function OsSaat() {
  const [saat, setSaat] = useState("");
  useEffect(() => {
    const yaz = () => setSaat(saatBicimi.format(new Date()));
    yaz();
    const zamanlayici = window.setInterval(yaz, 15_000);
    return () => window.clearInterval(zamanlayici);
  }, []);
  return <time className="os-clock" suppressHydrationWarning>{saat}</time>;
}

export type EkipUyesi = { userId: string; ad: string };

/* user_presence'ı PresenceHeartbeat dakikada bir yazıyor; 3 dakika pay. */
const CEVRIMICI_ESIGI_MS = 3 * 60_000;

/*
  "CANLI" GÖSTERGESİ VE ÇEVRİMİÇİ EKİP.

  Gösterge gerçek bağlantıyı söyler: Supabase anlık kanalı abone olunca
  "Canlı", koparsa "Bağlantı yok". Süs değil — kopukken ekrandaki
  sayıların bayatlayabileceğini kullanıcı buradan görür.

  Çevrimiçi kişiler user_presence tablosundan, RLS'in izin verdiği kadar
  (yalnızca kendi kurumu). Herkese açık bir Realtime presence kanalı
  bilerek kullanılmadı: kanal adını bilen başka bir kurumun kullanıcısı
  da katılıp çalışan adlarını görebilirdi; tablo RLS ile korunuyor.
*/
export function OsCanli({
  organizationId,
  benimId,
  ekip,
  baslangic,
}: {
  organizationId: string;
  benimId: string;
  ekip: EkipUyesi[];
  baslangic: Record<string, string>;
}) {
  const [durum, setDurum] = useState<"baglaniyor" | "canli" | "kopuk">("baglaniyor");
  const [gorulme, setGorulme] = useState<Record<string, string>>(baslangic);
  const [simdi, setSimdi] = useState(() => Date.now());
  /* Anlık bir değişiklik ekranı tazeleyince kısa süre "Güncellendi":
     kullanıcı sayıların neden değiştiğini görür. */
  const [taze, setTaze] = useState(false);
  useEffect(() => {
    let zamanlayici = 0;
    const isaretle = () => {
      setTaze(true);
      window.clearTimeout(zamanlayici);
      zamanlayici = window.setTimeout(() => setTaze(false), 2500);
    };
    window.addEventListener(CANLI_GUNCELLEME_OLAYI, isaretle);
    return () => { window.removeEventListener(CANLI_GUNCELLEME_OLAYI, isaretle); window.clearTimeout(zamanlayici); };
  }, []);

  useEffect(() => {
    const istemci = createClient();
    const kanal = istemci
      .channel(`os-durum:${organizationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_presence", filter: `organization_id=eq.${organizationId}` }, (olay) => {
        const satir = (olay.new ?? olay.old) as { user_id?: string; last_seen_at?: string };
        if (satir?.user_id && satir.last_seen_at) setGorulme((onceki) => ({ ...onceki, [satir.user_id!]: satir.last_seen_at! }));
      })
      .subscribe((s) => setDurum(s === "SUBSCRIBED" ? "canli" : s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED" ? "kopuk" : "baglaniyor"));
    const saat = window.setInterval(() => setSimdi(Date.now()), 30_000);
    return () => {
      window.clearInterval(saat);
      void istemci.removeChannel(kanal);
    };
  }, [organizationId]);

  const adlar = useMemo(() => new Map(ekip.map((uye) => [uye.userId, uye.ad])), [ekip]);
  const cevrimici = Object.entries(gorulme)
    .filter(([id, zaman]) => id !== benimId && simdi - new Date(zaman).getTime() < CEVRIMICI_ESIGI_MS)
    .map(([id]) => ({ id, ad: adlar.get(id) ?? "Ekip üyesi" }));
  const gorunen = cevrimici.slice(0, 3);
  const kalan = cevrimici.length - gorunen.length;

  return (
    <div className="os-live">
      <span className={`os-live-pill is-${durum}${taze ? " is-taze" : ""}`} role="status" title={durum === "canli" ? "Değişiklikler anında geliyor" : durum === "kopuk" ? "Anlık bağlantı koptu; sayfayı yenileyin" : "Bağlanıyor"}>
        <i aria-hidden="true" />
        {durum === "canli" ? (taze ? "Güncellendi" : "Canlı") : durum === "kopuk" ? "Bağlantı yok" : "Bağlanıyor"}
      </span>
      {cevrimici.length ? (
        <span className="os-online" title={`Şu an çevrimiçi: ${cevrimici.map((k) => k.ad).join(", ")}`} aria-label={`${cevrimici.length} ekip üyesi çevrimiçi`}>
          {gorunen.map((kisi) => <span key={kisi.id} className="os-avatar os-avatar--sm">{basHarfler(kisi.ad)}</span>)}
          {kalan > 0 ? <span className="os-avatar os-avatar--sm os-avatar--more">+{kalan}</span> : null}
        </span>
      ) : null}
    </div>
  );
}
