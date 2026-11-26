"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { DILLER, DIL_ADLARI, type Dil } from "@/lib/konsol-giris/dil";
import { dilSec } from "./dil-islemi";
import { DilSimgesi, OnaySimgesi } from "./simgeler";

/*
  Dil seçici (ArvoLab app/_components/dil-secici.tsx ile aynı yapı ve
  davranış, canlı commit b3fab7a4). Dil adları KENDİ dillerinde yazılı
  ("English", "Türkçe"): yanlış dilde açılmış bir ekranda kullanıcı
  kendi dilini ancak böyle tanır.

  Seçim sunucu işlemine gider (çerez) ve router.refresh() sayfayı
  yeniden çizer: başlıklar, etiketler, yer tutucular ve hata mesajları
  BİRLİKTE değişir. İstemcide tutulan bir dil durumu yok — sunucu
  çizimiyle istemci çizimi ayrışırsa ekran yarı Türkçe kalırdı.
*/
export default function DilSecici({ dil, sinif = "kg-dil" }: { dil: Dil; sinif?: string }) {
  const router = useRouter();
  const [bekliyor, basla] = useTransition();
  return (
    <div className={sinif} role="group" aria-label="Language / Dil">
      <small>
        <DilSimgesi size={13} strokeWidth={2} /> {dil === "tr" ? "Dil" : "Language"}
      </small>
      {DILLER.map((secenek) => (
        <button
          key={secenek}
          type="button"
          lang={secenek}
          aria-pressed={dil === secenek}
          disabled={bekliyor}
          onClick={() =>
            basla(async () => {
              await dilSec(secenek);
              router.refresh();
            })
          }
        >
          {DIL_ADLARI[secenek]}
          {dil === secenek ? <OnaySimgesi size={15} strokeWidth={2} /> : null}
        </button>
      ))}
    </div>
  );
}
