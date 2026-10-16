/*
  KURUM SEKTÖRLERİ — TEK KAYNAK (16.10.2026).

  Liste yalnızca yeni müşteri sihirbazının içindeydi; kurumun Ayarlar
  ekranı sektörü veritabanındaki koduyla yazıyordu ("Sektör: general").
  Sektör konsolda elle de yazılabildiği için listede olmayan bir değer
  (zaten okunur bir metin) olduğu gibi gösterilir. Saf modül.
*/
export const SEKTORLER = [
  { value: "general", label: "Genel" },
  { value: "akademik-danismanlik", label: "Akademik danışmanlık" },
  { value: "egitim", label: "Eğitim" },
  { value: "saglik", label: "Sağlık" },
  { value: "hukuk-danismanlik", label: "Hukuk ve danışmanlık" },
  { value: "ajans-yazilim", label: "Ajans ve yazılım" },
  { value: "perakende", label: "Perakende ve e-ticaret" },
] as const;

/** Sektör kodunun okunur adı; listede yoksa değerin kendisi. */
export const sektorAdi = (kod: string | null | undefined) =>
  kod ? SEKTORLER.find((s) => s.value === kod)?.label ?? kod : "";
