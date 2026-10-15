"use client";

/*
  SON ÇARE EKRANI. Kök yerleşim (app/layout.tsx) ya da onun üstündeki bir
  şey patlarsa app/panel/error.tsx devreye giremez — o, panel yerleşiminin
  İÇİNDE. Böyle bir durumda Next'in gömülü İngilizce "Application error: a
  client-side exception has occurred" ekranı çıkıyordu.

  Bu bileşen kendi <html>/<body>'sini kurar ve hiçbir CSS dosyasına
  güvenmez: kökün patladığı durumda stil yüklendiğini varsaymak, aynı
  hatayı ikinci kez yapmak olur. Biçimler bu yüzden satır içi.
*/
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="tr">
      <body style={{ margin: 0, minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#f2f2f7", color: "#0b1b2e", fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',system-ui,'Segoe UI',Roboto,sans-serif" }}>
        <main style={{ width: "100%", maxWidth: 440, padding: "32px 28px", borderRadius: 20, background: "#fff", border: "1px solid #e3e3e8", boxShadow: "0 10px 28px rgba(11,27,46,.08)", textAlign: "center" }}>
          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 600, lineHeight: 1.3 }}>Uygulama açılamadı</h1>
          <p style={{ margin: "10px 0 0", color: "#6e6e73", fontSize: 14.5, lineHeight: 1.55 }}>
            Beklenmeyen bir hata oluştu. Sayfayı yenilemeyi deneyin; sorun devam
            ederse bu ekranın görüntüsünü yöneticinize iletin.
          </p>
          {error.digest ? (
            <p style={{ margin: "10px 0 0", color: "#9aa6b8", fontSize: 12.5 }}>Hata kodu: {error.digest}</p>
          ) : null}
          <button
            type="button"
            onClick={() => reset()}
            style={{ minHeight: 44, marginTop: 22, padding: "0 20px", border: 0, borderRadius: 12, background: "linear-gradient(180deg,#2c4368,#13243f)", color: "#fff", fontSize: 14.5, fontWeight: 600, cursor: "pointer" }}
          >
            Tekrar Dene
          </button>
        </main>
      </body>
    </html>
  );
}
