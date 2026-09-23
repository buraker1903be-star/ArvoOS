"use client";

import { useRouter } from "next/navigation";

/*
  Lisans sayfasının kiracı seçicisi.

  Sayfa tek kiracıyı anlatıyor ama menüdeki "Lisans ve kota" bağlantısında
  ?organization yok: kurucu menüden girdiğinde sayfa kendi kurumumuzun
  (ArvoOS) lisansını açıyor ve kiracı değiştirmenin hiçbir yolu olmuyordu —
  önce Kiracılar listesine dönüp oradan girmek gerekiyordu. Menüdeki bir
  başlığın çıkmaza gitmesi, olmamasından kötü.

  Kendi kurumlarımız listede: kendimize satmıyoruz ama ArvoOS kurumunun da
  bir lisans satırı var ve bazen ona bakmak gerekiyor. Ayrımı adın yanındaki
  not söylüyor, gizlemek yerine.
*/

export type SecilebilirKurum = { id: string; ad: string; kendi: boolean };

export function KiraciSecici({ kurumlar, secili }: { kurumlar: SecilebilirKurum[]; secili: string }) {
  const router = useRouter();

  return (
    <label className="plt-kiraci-secici">
      <span className="plt-gizli">Kiracı seç</span>
      <select
        value={secili}
        onChange={(olay) => router.push(`/panel/platform/licenses?organization=${olay.target.value}`)}
      >
        {kurumlar.map((kurum) => (
          <option key={kurum.id} value={kurum.id}>
            {kurum.kendi ? `${kurum.ad} (kendi markamız)` : kurum.ad}
          </option>
        ))}
      </select>
    </label>
  );
}
