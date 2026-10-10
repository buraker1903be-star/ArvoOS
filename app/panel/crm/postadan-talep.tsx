"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { NEW_REQUEST_PREFILL_EVENT, type NewRequestPrefill } from "./customer-history-keys";

/*
  POSTADAN TALEP AÇMA — açılış tarafı.

  Ortak kutuya düşen bir müşteri postası çoğu zaman bir TALEP; şimdiye
  kadar personel bilgileri postadan okuyup talep formuna elle yazıyordu.
  Yazışma ekranındaki "Talep aç" buraya adresle geliyor (müşteri adı,
  e-posta, konu ve yazışma kimliği).

  Talep formunun KENDİSİ kopyalanmıyor: hizmet türü, temsilci ataması,
  çalışma türü ve geri dönen müşteri uyarısı hep orada ve kuralları
  sunucuda. İkinci bir form, o kuralların birinde değişiklik olduğu gün
  sessizce geride kalırdı. Bunun yerine var olan pencere, müşteri
  sorgulamanın kullandığı aynı olayla doldurulup açılıyor.

  Adres açılıştan sonra temizleniyor: sayfa yenilenince pencerenin
  yeniden açılması, kullanıcının kapattığı bir formu geri getirirdi.
*/
const TETIKLEYICI = ".crm-new-request-trigger";

export function PostadanTalep() {
  const router = useRouter();
  const yol = usePathname();
  const parametreler = useSearchParams();

  useEffect(() => {
    if (parametreler.get("postadan") !== "1") return;
    const ad = (parametreler.get("musteri") ?? "").trim();
    if (!ad) return;

    const prefill: NewRequestPrefill = {
      name: ad,
      phone: null,
      email: (parametreler.get("eposta") ?? "").trim() || null,
      title: (parametreler.get("konu") ?? "").trim() || null,
      postaThreadId: (parametreler.get("yazisma") ?? "").trim() || null,
    };

    /* Pencere düğmesi sayfa çizildikten sonra var oluyor; bir kare
       beklemeden tıklanırsa hiçbir şey olmuyordu. */
    const zamanlayici = window.setTimeout(() => {
      const tetikleyici = document.querySelector<HTMLButtonElement>(TETIKLEYICI);
      if (!tetikleyici) return;
      window.dispatchEvent(new CustomEvent<NewRequestPrefill>(NEW_REQUEST_PREFILL_EVENT, { detail: prefill }));
      tetikleyici.click();
      router.replace(yol, { scroll: false });
    }, 0);
    return () => window.clearTimeout(zamanlayici);
  }, [parametreler, router, yol]);

  return null;
}
