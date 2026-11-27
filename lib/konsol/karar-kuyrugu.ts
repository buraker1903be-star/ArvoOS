/*
  KARAR KUYRUĞUNUN DURUMU (27.11.2026).

  Ana Sayfa'nın karar kartı dört ayrı kaynaktan besleniyor (ödeme
  bildirimleri, sözleşme onayları, yenilemeler, destek talepleri) ve
  her biri ayrı ayrı okunamayabiliyor. Kart 27.11.2026'ya kadar iki
  bilgiyi BİRBİRİNDEN BAĞIMSIZ yazıyordu: boşsa "Bekleyen karar yok",
  okunamayan varsa ayrıca "… okunamadı". İkisi aynı anda çıkınca ekran
  kendi kendiyle çelişiyordu:

      Bekleyen karar yok.
      Destek talepleri okunamadı; bu kalemler listede eksik olabilir.

  Yönetici bunu okuyup "iş yok mu, bilmiyor muyuz?" diye soruyordu —
  oysa ikisi çok farklı: biri "bugün rahatsın", öteki "bakman gereken
  bir iş olabilir ama göremiyoruz".

  Karar tek yerde ve SAF: ekran yalnızca çiziyor. Dört hâl var ve
  üçünün metni farklı.
*/

export type KuyrukDurumu =
  /** Her kaynak okundu, kayıt var. */
  | { tur: "dolu"; okunamayan: [] }
  /** Her kaynak okundu, hiç kayıt yok — gerçekten boş. */
  | { tur: "bos"; okunamayan: [] }
  /** Kaynakların bir kısmı okunamadı ve gösterilecek kayıt YOK. */
  | { tur: "eksik_bos"; okunamayan: string[] }
  /** Kaynakların bir kısmı okunamadı ama bulunan kayıtlar var. */
  | { tur: "kismi"; okunamayan: string[] };

/**
 * Kaç kalem bulunduğuna ve hangi kaynakların okunamadığına bakarak
 * kartın hangi hâli göstereceğine karar verir.
 *
 * `okunamayan` listesi KAYNAK ADLARI taşır ("Destek talepleri"), hata
 * nesnesi değil: kullanıcıya gösterilen şey kaynağın adı.
 */
export function kuyrukDurumu({ kalemSayisi, okunamayan }: {
  kalemSayisi: number;
  okunamayan: readonly string[];
}): KuyrukDurumu {
  /* Aynı kaynak iki kez bildirilirse bir kez yazılır; sıra girdiden
     geliyor (ekranda kaynakların sırası sabit olsun diye). */
  const eksik = [...new Set(okunamayan.filter((x) => x.trim().length > 0))];
  if (eksik.length === 0) return kalemSayisi > 0 ? { tur: "dolu", okunamayan: [] } : { tur: "bos", okunamayan: [] };
  return kalemSayisi > 0 ? { tur: "kismi", okunamayan: eksik } : { tur: "eksik_bos", okunamayan: eksik };
}

/**
 * Durumun ekranda görünecek metni. Başlık ve açıklama AYRI: başlık
 * durumu bir bakışta söyler, açıklama hangi kaynağın eksik olduğunu.
 *
 * "dolu" hâlinde metin yok — kart kalemleri çiziyor.
 */
export function kuyrukMetni(durum: KuyrukDurumu): { baslik: string; aciklama?: string; ton: "notr" | "uyari" } | null {
  const kaynaklar = durum.okunamayan.join(", ");
  switch (durum.tur) {
    case "dolu":
      return null;
    case "bos":
      /* Hepsi okundu ve boş: bu İYİ haber, uyarı tonu almaz. */
      return { baslik: "Bekleyen karar yok.", ton: "notr" };
    case "eksik_bos":
      /*
        Gösterilecek kayıt yok AMA bunun "iş yok" demek olduğunu
        bilmiyoruz. Başlık bu belirsizliği söylemeli; "Bekleyen karar
        yok" demek yanlış olurdu.
      */
      return { baslik: "Karar listesi eksik.", aciklama: `${kaynaklar} okunamadı; bekleyen iş olup olmadığı bilinmiyor.`, ton: "uyari" };
    case "kismi":
      return { baslik: "Karar listesi eksik.", aciklama: `${kaynaklar} okunamadı; aşağıdaki işler bulunanlardan ibaret.`, ton: "uyari" };
  }
}
