"use client";

import { KAPANIS_NEDENLERI } from "@/lib/kapanis-nedeni";

/*
  KAYIP NEDENİ ALANI (02.11.2026; kural lib/kapanis-nedeni.ts). Çekirdek
  lisans formu ve ürün formu aynı alanı çiziyor: ikisi ayrı yazılsaydı
  biri yeni nedeni gösterip öteki göstermezdi. Zorunluluk sunucuda da
  denetleniyor (kapanisNedeniOku); buradaki `required` yalnızca anlık uyarı.
*/
export function KayipNedeniAlani({ neden, not, zorunlu, nedenDegisti, notDegisti }: {
  neden: string; not: string; zorunlu: boolean;
  nedenDegisti: (deger: string) => void; notDegisti: (deger: string) => void;
}) {
  return <>
    <label className="wide">
      <span>Kayıp nedeni{zorunlu ? <b className="req" aria-hidden="true">*</b> : null}</span>
      <select name="kapanis_nedeni" required={zorunlu} value={neden} onChange={(o) => nedenDegisti(o.target.value)}>
        <option value="">Seçin</option>
        {KAPANIS_NEDENLERI.map((n) => <option key={n.kod} value={n.kod}>{n.ad}</option>)}
      </select>
    </label>
    <label className="wide">
      Not (isteğe bağlı)
      <input name="kapanis_notu" maxLength={500} value={not} placeholder="Ör. rakibin teklifi yarı fiyattı; yazın tekrar konuşulacak"
        onChange={(o) => notDegisti(o.target.value)} />
      <small className="plt-field-note">Aylık raporda kaybedilen müşterinin yanında ve nedenlere göre dağılımda görünür.</small>
    </label>
  </>;
}
