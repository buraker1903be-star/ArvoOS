import { StgIcon } from "./settings-ui";
import { removeProviderSettings, saveProviderSettings } from "../finance/odeme-saglayici-actions";
import type { ProviderStatus } from "@/lib/payments/durum";

// Ödeme sağlayıcısı kartı: PayTR ve Garanti aynı kalıptan çiziliyor.
// Hangi alanların sorulacağı kayıt defterinden geliyor
// (lib/payments/saglayicilar.ts), burada kopya alan listesi yok.
//
// Sırlar hiçbir koşulda EKRANA GELMİYOR: yalnızca "kayıtlı mı" bilgisi var.
// Alan boş bırakılırsa mevcut değer korunur (lib/payments/kimlik.ts).

const tarih = (value: string | null) =>
  value ? new Date(value).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Henüz yok";

function rozet(status: ProviderStatus) {
  if (status.readFailed) return { tone: "danger" as const, text: "Durum okunamadı" };
  if (!status.connected) return { tone: "neutral" as const, text: "Bağlı değil" };
  if (!status.complete) return { tone: "danger" as const, text: "Bilgiler eksik" };
  if (!status.enabled) return { tone: "warning" as const, text: "Kapalı" };
  // Bilgiler tam ve açık ama akış hazır değilse bunu SÖYLEMEK gerekiyor:
  // "Bağlı" yazıp hiç tahsilat yapmamak en kötü yanlış bilgi.
  if (!status.spec.checkoutReady) return { tone: "warning" as const, text: "Kayıtlı · tahsilat henüz açılmadı" };
  if (!status.active) return { tone: "info" as const, text: `Yedek · ${status.merchantHint}` };
  return { tone: "success" as const, text: `Etkin · ${status.merchantHint}` };
}

export function OdemeSaglayiciKarti({ status }: { status: ProviderStatus }) {
  const { spec } = status;
  const durum = rozet(status);

  return (
    <div className="stg-paytr">
      <div className="stg-paytr-head">
        <div><b>{spec.name}</b><small>{spec.description}</small></div>
        <span className="status-pill" data-tone={durum.tone}>{durum.text}</span>
      </div>

      {status.readFailed ? (
        <p className="stg-muted">
          <StgIcon name="lock" size={16} />
          Kayıtlı ödeme bilgileri şu an okunamıyor. Form gösterilmiyor: kaydetmek, hâlâ duran
          bilgilerin üzerine yazabilirdi. Sayfayı yenileyin, sürerse sunucu günlüğüne bakın.
        </p>
      ) : status.available ? (
        <form className="panel-form" action={saveProviderSettings}>
          <input type="hidden" name="provider" value={spec.code} />
          <label>
            {spec.merchantLabel}
            <input name="merchant_id" inputMode="numeric" required defaultValue={status.merchantId ?? ""} autoComplete="off" />
          </label>

          {spec.secrets.map((secret) => {
            const kayitli = status.storedKeys.includes(secret.key);
            return (
              <label key={secret.key}>
                {secret.label}
                <input
                  name={secret.key}
                  type="password"
                  autoComplete="new-password"
                  required={secret.required && !kayitli}
                  placeholder={kayitli ? "Değiştirmek için yeni değeri girin" : secret.hint ?? ""}
                />
              </label>
            );
          })}

          {spec.hasModes ? (
            <label>
              Çalışma kipi
              <select name="mode" defaultValue={status.mode}>
                <option value="test">Test sunucusu</option>
                <option value="production">Canlı</option>
              </select>
            </label>
          ) : null}

          <label className="wide stg-check">
            <input name="is_enabled" type="checkbox" defaultChecked={!status.connected || status.enabled} />
            {spec.enableLabel}
          </label>

          <p className="wide stg-paytr-note">
            {spec.setupNote} Şifreler şifrelenerek saklanır, ekranda bir daha gösterilmez.
            {!spec.checkoutReady ? " Bu sağlayıcının tahsilat akışı henüz açılmadı; bilgiler şimdiden kaydedilebilir." : ""}
          </p>

          <div className="wide panel-form-actions">
            <button className="panel-primary" type="submit">{status.connected ? "Güncelle" : `${spec.name} bilgilerini kaydet`}</button>
          </div>
        </form>
      ) : (
        <p className="stg-muted">
          <StgIcon name="lock" size={16} />
          Sunucu şifreleme anahtarı henüz tanımlanmadı. Platform yöneticisi PAYMENT_CREDENTIALS_KEY değerini ekleyince bu alan açılır.
        </p>
      )}

      {status.connected ? (
        <div className="stg-paytr-foot">
          <span>Son test ödemesi: <b>{tarih(status.lastTestPaymentAt)}</b></span>
          <span>Son tahsilat: <b>{tarih(status.lastPaymentAt)}</b></span>
          <form action={removeProviderSettings}>
            <input type="hidden" name="provider" value={spec.code} />
            <button className="panel-secondary" type="submit">Bağlantıyı kaldır</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
