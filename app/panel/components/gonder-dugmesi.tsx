"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import "./gonder-dugmesi.css";

/*
  ORTAK GÖNDERİM DÜĞMESİ (10.11.2026).

  Neden: işlem sürerken düğmeye ikinci kez basmak aynı sunucu işlemini
  ikinci kez çalıştırıyordu. PR #314'ün bir ara sürümü bunu sayfa genelinde
  bir dinleyiciyle ve en geç 6 sn sonra kalkan bir kilitle çözmeye
  çalıştı; ama dışarıdan bakan bir dinleyici işlemin GERÇEKTEN bitip
  bitmediğini bilemez — 6 sn'den uzun süren işlemde kilit kalkıp ikinci
  gönderime izin veriyordu. O kilit kaldırıldı.

  Bu düğme durumu React'ten okuyor (useFormStatus): `pending` yalnızca
  formun işlemi sonuçlanınca (başarı ya da hata) biter. Bu yüzden:
  - işlem sürdükçe düğme devre dışı (aynı formdaki diğer ortak düğmeler de);
    süre dolduğu için yeniden açılmaz;
  - 8 sn'yi aşarsa "Hâlâ işleniyor" der (CSS gecikmesi, gonder-dugmesi.css):
    sonuç henüz bilinmiyor, yeni işlem başlatılmamalı;
  - hata ya da başarıdan sonra hemen yeniden kullanılabilir (yeniden deneme);
  - kilit FORM başına: başka bir formun işlemi bu düğmeyi etkilemez.
  Devre dışı varsayılan düğme, Enter ile örtük gönderimi de engeller (HTML).

  Arayüz kilidi veri bütünlüğünün garantisi DEĞİLDİR; kritik işlemlerde
  sunucu tarafı koşul/tekillik ayrıca gerekir (ör. operations/actions.ts ·
  toggleWorkflowStep'in koşullu güncellemesi).

  Tarayıcı düzeyi sınaması: scripts/gonder-dugmesi-tarayici.mjs.
*/
export function GonderDugmesi({ children, className = "panel-primary", bekleyenEtiket = "İşleniyor…", uzunEtiket = "Hâlâ işleniyor — sonucu bekleyin", ariaLabel }: {
  children: ReactNode;
  className?: string;
  bekleyenEtiket?: ReactNode;
  uzunEtiket?: ReactNode;
  ariaLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending || undefined} aria-label={pending ? undefined : ariaLabel}>
      {pending ? <BeklemeEtiketi kisa={bekleyenEtiket} uzun={uzunEtiket} /> : children}
    </button>
  );
}

/*
  "Hâlâ işleniyor" etiketi CSS ile gelir, React state'iyle DEĞİL.

  Gerçek Chromium sınamasında (scripts/gonder-dugmesi-tarayici.mjs) form
  işlemi sürerken formun içindeki bir bileşende state güncellemek
  useFormStatus'un `pending`ini işlem BİTMEDEN false'a düşürdü: 8 sn'de
  zamanlayıcı etiketi değiştirince düğme yeniden açıldı (işlem 9 sn'de
  bitiyordu). İlk denemede state'i effect temizliğinde sıfırlamak da her
  ikinci gönderimde kilidi hiç kurmuyordu. Bu yüzden bekleme süresince
  hiçbir React güncellemesi yok: iki metin aynı yerde, uzun olan CSS
  animasyonunun gecikmesiyle (8 sn) görünür (gonder-dugmesi.css).
*/
function BeklemeEtiketi({ kisa, uzun }: { kisa: ReactNode; uzun: ReactNode }) {
  return (
    <span className="gonder-bekleme" role="status">
      <span className="gonder-bekleme-kisa">{kisa}</span>
      <span className="gonder-bekleme-uzun">{uzun}</span>
    </span>
  );
}
