"use client";

import { useId, type ReactNode } from "react";
import { alanHatasi } from "@/lib/form-hatalari";
// Bileşen stilini kendisi alıyor (AGENTS.md: sınıfın CSS'i rotaya kendi importuyla girer).
import "./kayit-formu.css";

/*
  ORTAK FORM ALANI (10.11.2026, ortak form kontrolleri; ilk kullanan Yeni
  talep formu).

  Eskiden alanlar `<label>Etiket<input/></label>` olarak yazılıyordu:
  - zorunlu işareti bazı alanlarda vardı, bazılarında yoktu;
  - yardım metni (`kayit-formu-ipucu`) etiketin İÇİNDEYDİ, ekran okuyucu
    onu alanın adının parçası olarak okuyordu;
  - hata yalnızca tarayıcının geçici balonuydu: bir sonraki tıklamada
    kayboluyor, alana bağlı kalıcı bir metin bırakmıyordu;
  - etiketin yerini tutan yer tutucular ("Seçin ya da yazın") vardı.

  Burada etiket kalıcı ve ayrı (`for`), yardım ve hata metni alana
  `aria-describedby` ile bağlı, geçersiz alan `aria-invalid`. Hata yalnızca
  renkle değil, simge ve "Hata:" önekiyle de anlatılıyor (öneki görsel
  olarak gizli, ekran okuyucu okuyor). Alanın kendisi çağıranın: yerleşik
  input/select/textarea/TarihSecici olduğu gibi kalır, yalnızca bu
  özniteliklerle sarılır (render prop).
*/
export type AlanOzellikleri = {
  id: string;
  required?: boolean;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
  /** Hata metninde kullanılan etiket (formuDenetle okur). */
  "data-etiket": string;
};

export function FormAlani({ etiket, zorunlu = false, yardim, hata, genis = false, sinif, children }: {
  etiket: string;
  zorunlu?: boolean;
  yardim?: ReactNode;
  hata?: string | null;
  genis?: boolean;
  sinif?: string;
  children: (alan: AlanOzellikleri) => ReactNode;
}) {
  const id = useId();
  const yardimId = yardim ? `${id}-yardim` : null;
  const hataId = hata ? `${id}-hata` : null;
  const aciklama = [hataId, yardimId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={["form-alani", genis ? "wide" : "", hata ? "is-hatali" : "", sinif ?? ""].filter(Boolean).join(" ")}>
      <label className="form-alani-etiket" htmlFor={id}>
        {etiket}
        {zorunlu ? <span className="req" aria-hidden="true">*</span> : null}
      </label>
      {children({ id, required: zorunlu || undefined, "aria-invalid": hata ? true : undefined, "aria-describedby": aciklama, "data-etiket": etiket })}
      {hata ? (
        <p className="form-alani-hata" id={hataId ?? undefined}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5h.01" /></svg>
          <span><span className="sr-only">Hata: </span>{hata}</span>
        </p>
      ) : null}
      {yardim ? <p className="form-alani-yardim" id={yardimId ?? undefined}>{yardim}</p> : null}
    </div>
  );
}

type Denetlenen = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
const denetlenebilir = (alan: Element): alan is Denetlenen =>
  (alan instanceof HTMLInputElement || alan instanceof HTMLSelectElement || alan instanceof HTMLTextAreaElement) && alan.willValidate && Boolean(alan.name);

/**
 * Formdaki geçersiz alanları sırayla döndürür: ad → Türkçe metin.
 * Tarayıcının kendi kuralları (required, minLength, type=email) kullanılır;
 * kural kopyalanmaz. Etiket `data-etiket`ten (FormAlani verir).
 */
export function formuDenetle(form: HTMLFormElement): Map<string, string> {
  const hatalar = new Map<string, string>();
  for (const alan of form.elements) {
    if (!denetlenebilir(alan) || alan.validity.valid || hatalar.has(alan.name)) continue;
    const etiket = alan.dataset.etiket ?? alan.name;
    const metin = alanHatasi(alan.validity, {
      etiket,
      tur: alan instanceof HTMLInputElement ? alan.type : undefined,
      secim: alan instanceof HTMLSelectElement,
      minLength: "minLength" in alan && alan.minLength > 0 ? alan.minLength : undefined,
      maxLength: "maxLength" in alan && alan.maxLength > 0 ? alan.maxLength : undefined,
    });
    if (metin) hatalar.set(alan.name, metin);
  }
  return hatalar;
}

/**
 * Adı verilen alana odaklanır ve görünür kılar. Kaydırma formun kendi
 * gövdesinde olur (pencere gövdesi); sabit kaydet çubuğu alanı örtmesin diye
 * ortaya hizalanır. Gizli yerel tarih alanında (TarihSecici) görünür kutuya geçilir.
 */
export function alanaGit(form: HTMLFormElement, ad: string) {
  const alan = form.elements.namedItem(ad);
  const hedef = alan instanceof RadioNodeList ? alan[0] : alan;
  if (!(hedef instanceof HTMLElement)) return;
  const gorunur = hedef.offsetParent === null
    ? hedef.closest(".form-alani")?.querySelector<HTMLElement>("input:not([type=hidden]):not([tabindex='-1']), button, select, textarea")
    : hedef;
  (gorunur ?? hedef).scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  (gorunur ?? hedef).focus({ preventScroll: true });
}
