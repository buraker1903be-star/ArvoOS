"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/*
  ADRESİN #… KISMINDAKİ OTURUMU YAKALA (16.10.2026).

  Eski biçimli davet e-postasında düğme Supabase'in doğrulama adresine
  gidiyor ve davet (implicit akış) oturumu adresin #access_token=… kısmına
  koyup dönüyor. Sunucuda çalışan /auth/callback o kısmı göremediği için
  davetli buraya "bağlantı süresi dolmuş" diye düşüyordu — bağlantı
  aslında geçerliydi. Tarayıcı yönlendirmede #… kısmını korur; bu bileşen
  onu okuyup oturumu kurar ve şifre ekranına geçirir. Kanca yeni biçime
  geçince (doğrudan /auth/callback?token_hash=…) bu yol boşa düşer ama
  gönderilmiş eski e-postalar için kalır.
*/
export function HashOturumu() {
  const [hata, setHata] = useState(false);

  useEffect(() => {
    const parca = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const access = parca.get("access_token");
    const refresh = parca.get("refresh_token");
    if (!access || !refresh) return;
    const tur = parca.get("type");
    // Jeton adres çubuğunda ve geçmişte kalmasın.
    window.history.replaceState(null, "", window.location.pathname);
    /* Sunucu bu adrese "süresi dolmuş" diye yönlendirmişti; bağlantı geçerli.
       Uyarının yerine "doğrulanıyor" yazılıyor (state değil: efektte eşzamanlı
       state değişimi ikinci bir çizime yol açıyor). */
    const uyari = document.querySelector<HTMLElement>("[data-sunucu-hatasi]");
    if (uyari) { uyari.className = "login-success"; uyari.setAttribute("role", "status"); uyari.textContent = "Bağlantınız doğrulanıyor…"; }
    createClient().auth.setSession({ access_token: access, refresh_token: refresh }).then(({ error }) => {
      if (error) { uyari?.remove(); setHata(true); return; }
      window.location.replace(`/auth/set-password?next=%2Fpanel${tur === "recovery" ? "&tur=yenile" : ""}`);
    });
  }, []);

  return hata ? <div className="login-error" role="alert">Bağlantı doğrulanamadı. Aşağıdan yeni bir bağlantı isteyin.</div> : null;
}
