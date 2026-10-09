"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/*
  YENİ POSTA UYARISI.

  Üst çubuktaki rozet yalnızca sayıyı söylüyor ve ancak sayfa yenilenince
  değişiyordu: başka bir modülde çalışan kişi müşterinin yazdığını
  postaya girince öğreniyordu. Eşitleme yeni gelen posta için bildirim
  bırakıyor (lib/posta-esitleme.ts); burası o satırı ANLIK yakalayıp
  rozetin altında kısa bir uyarı gösteriyor.

  Anlık yol Supabase'in postgres_changes'i: her abonenin RLS'i uygulanır,
  kişi göremeyeceği satırın olayını almaz. Yayın kapalıysa (yerel
  veritabanı) burası sessizce boş kalır, rozet eski yoluyla çalışmaya
  devam eder.

  Uyarı kendiliğinden kayboluyor. Kalıcı olsaydı ekranın köşesinde
  kapatılmayı bekleyen bir kutu birikirdi; kaçıranlar için bildirim
  çekmecesi zaten duruyor.
*/
const SURE_MS = 12_000;

type Uyari = { id: string; mesaj: string; adres: string };

export function OsPostaUyarisi({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [uyari, setUyari] = useState<Uyari | null>(null);

  useEffect(() => {
    const istemci = createClient();
    const kanal = istemci
      .channel(`posta-uyari:${organizationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `organization_id=eq.${organizationId}` },
        (olay) => {
          const satir = olay.new as { id?: string; category?: string; message?: string; action_url?: string };
          if (satir?.category !== "posta_gelen") return;
          setUyari({
            id: String(satir.id ?? Date.now()),
            mesaj: String(satir.message ?? "Yeni posta"),
            adres: String(satir.action_url ?? "/panel/posta"),
          });
          /* Rozetin sayısı kabukta, sunucuda okunuyor: tazelemeden
             uyarı çıkar ama rozet eski sayıda kalırdı. */
          router.refresh();
        },
      )
      .subscribe();
    return () => {
      void istemci.removeChannel(kanal);
    };
  }, [organizationId, router]);

  useEffect(() => {
    if (!uyari) return;
    const zamanlayici = window.setTimeout(() => setUyari(null), SURE_MS);
    return () => window.clearTimeout(zamanlayici);
  }, [uyari]);

  if (!uyari) return null;
  return (
    <div className="os-posta-uyari" role="status" aria-live="polite">
      <Link href={uyari.adres} onClick={() => setUyari(null)}>
        <b>Yeni posta</b>
        <span>{uyari.mesaj}</span>
      </Link>
      <button type="button" onClick={() => setUyari(null)} aria-label="Uyarıyı kapat">×</button>
    </div>
  );
}
