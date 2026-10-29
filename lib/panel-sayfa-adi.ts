/*
  PANEL ADRESİNİN OKUNUR ADI (29.10.2026) — saf.

  Personel detayının Hareketler sekmesi oturumun son sayfasını ham adres
  olarak yazıyordu: "/panel/operations/45ec0821-1578-4cf8-…". Yönetici
  bundan "hangi işin üstündeydi" sorusunun cevabını çıkaramıyordu, uzun
  kimlik de satırı iki satıra bölüyordu. Ad bu tablodan; kimlikli adres
  ("İş kaydı") ayrıca tıklanabilir bırakılır — kaydın kendisi oradan
  açılır, kimliği ekrana yazmaya gerek yok.

  Eşleşme EN UZUN önekle: "/panel/operations/isler" "/panel/operations"
  ile değil kendi adıyla görünmeli. Tanınmayan adres uydurma bir ad
  almaz; bölüm adı (bilinen en uzun önek) ya da "Panel" yazılır.
*/

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sabit adresler. Kimlik parçası ":id" ile yazılır. */
const ADLAR: Record<string, string> = {
  "/panel": "Ana ekran",
  "/panel/crm": "Talepler",
  "/panel/crm/genel-bakis": "CRM · Genel bakış",
  "/panel/crm/requests/:id": "Talep kaydı",
  "/panel/crm/musteri/:id": "Müşteri kartı",
  "/panel/crm/proposals": "Teklifler",
  "/panel/crm/proposals/:id": "Teklif",
  "/panel/crm/contracts": "Sözleşmeler",
  "/panel/crm/contracts/:id": "Sözleşme",
  "/panel/crm/contract-templates": "Sözleşme şablonları",
  "/panel/crm/takvim": "CRM · Takvim",
  "/panel/crm/whatsapp": "WhatsApp",
  "/panel/operations": "Operasyon · Genel bakış",
  "/panel/operations/:id": "İş kaydı",
  "/panel/operations/isler": "İşler",
  "/panel/operations/pano": "İş panosu",
  "/panel/operations/takvim": "Operasyon · Takvim",
  "/panel/operations/arsiv": "İş arşivi",
  "/panel/operations/ekip": "Operasyon ekibi",
  "/panel/operations/sablon": "İş şablonları",
  "/panel/finance": "Cari hesaplar",
  "/panel/finance/genel-bakis": "Finans · Genel bakış",
  "/panel/finance/musteri/:id": "Cari kartı",
  "/panel/finance/costs/:id": "Maliyet kaydı",
  "/panel/finance/invoices": "Faturalar",
  "/panel/finance/payment-plans": "Ödeme planları",
  "/panel/finance/raporlar": "Finans · Raporlar",
  "/panel/hr": "Personel",
  "/panel/hr/:id": "Personel kartı",
  "/panel/hr/genel-bakis": "İK · Genel bakış",
  "/panel/hr/departmanlar": "Departmanlar",
  "/panel/hr/confidentiality": "Gizlilik sözleşmeleri",
  "/panel/posta": "Posta",
  "/panel/posta/:id": "Posta yazışması",
  "/panel/posta/yeni": "Yeni posta",
  "/panel/posta/hazir-cevaplar": "Hazır cevaplar",
  "/panel/messages": "Mesajlar",
  "/panel/notifications": "Bildirimler",
  "/panel/documents": "Dokümanlar",
  "/panel/analitik": "Analitik",
  "/panel/billing": "Abonelik ve faturalama",
  "/panel/settings": "Ayarlar",
  "/panel/support": "Destek",
  "/panel/ekip": "Ekip",
};

export type SayfaAdi = { ad: string; /** Bir kaydı gösteriyorsa açılabilecek adres. */ kayit: string | null };

export function panelSayfaAdi(adres: string | null | undefined): SayfaAdi | null {
  if (!adres) return null;
  const yol = adres.split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";
  if (yol !== "/panel" && !yol.startsWith("/panel/")) return null;
  const parcalar = yol.split("/");
  const kimlikli = parcalar.some((p) => UUID.test(p));
  const kalip = parcalar.map((p) => (UUID.test(p) ? ":id" : p));

  // En uzun önek: kalıbı sondan kısaltarak tabloda ara.
  for (let son = kalip.length; son >= 2; son -= 1) {
    const anahtar = kalip.slice(0, son).join("/");
    const ad = ADLAR[anahtar];
    const tam = son === kalip.length;
    // "/panel" bölüm değil, ana ekran: yalnızca kendisi için.
    if (!ad || (son === 2 && !tam)) continue;
    return { ad, kayit: tam && kimlikli ? yol : null };
  }
  return { ad: "Panel", kayit: null };
}
