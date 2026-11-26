"use client";

import { useId, useState } from "react";

/*
  ŞİFRE GÖSTER/GİZLE (26.11.2026) — YALNIZCA YÖNETİM GİRİŞİNDE.

  Kiracı girişi dokunulmadan duruyor: bu bileşen yalnızca
  yonetim.arvo-os.com'da çiziliyor, markup'ın geri kalanı ve server
  action aynı. Düğme formu göndermesin diye type="button" — varsayılan
  type="submit"tir ve göz simgesine basan kullanıcı formu gönderirdi.

  Erişilebilirlik: durum aria-pressed ile bildiriliyor, etiket duruma
  göre değişiyor. Simge tek başına anlam taşımıyor.
*/
export function SifreAlani({ hataVar }: { hataVar?: boolean }) {
  const [acik, setAcik] = useState(false);
  const id = useId();
  return (
    <label htmlFor={id}>
      <span className="kg-etiket">Şifre<b className="kg-zorunlu" aria-hidden="true">*</b></span>
      <span className="kg-alan">
        <input
          id={id}
          name="password"
          type={acik ? "text" : "password"}
          autoComplete="current-password"
          required
          placeholder="Şifrenizi girin"
          aria-invalid={hataVar ? true : undefined}
        />
        <button
          type="button"
          className="kg-goz"
          onClick={() => setAcik((o) => !o)}
          aria-pressed={acik}
          aria-label={acik ? "Şifreyi gizle" : "Şifreyi göster"}
          title={acik ? "Şifreyi gizle" : "Şifreyi göster"}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
            <circle cx="12" cy="12" r="3.1" />
            {acik ? <path d="M4 20 20 4" /> : null}
          </svg>
        </button>
      </span>
    </label>
  );
}
