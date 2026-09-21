// WhatsApp şablon gönderimi: gövde biçimi, numara normalleştirme ve
// "gitti mi" kararı. Kimliksiz 200'ü başarılı saymak, gitmeyen mesajı
// kuyruktan düşürüp müşteriye hiç ulaşmamasına yol açardı.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { messageBody, normalizePhone, sendWhatsappTemplates, templateBody, templateParam, windowOpen, type WhatsappSendItem } from "../../lib/whatsapp-send";
import { GRAPH_VERSION } from "../../lib/whatsapp-cloud";

const SENDER = { phoneNumberId: "555000", token: "gizli" };
const item = (d: Partial<WhatsappSendItem> = {}): WhatsappSendItem => ({
  ref: "r1", to: "905320000000", template: "randevu_hatirlatma",
  params: ["Ayşe", "Deneme Salon", "yarın", "14:00", "Saç kesimi"], ...d,
});

test("numara 905XXXXXXXXX biçimine getirilir, cep değilse reddedilir", () => {
  for (const raw of ["5320000000", "05320000000", "905320000000", "+90 532 000 00 00"]) {
    assert.equal(normalizePhone(raw), "905320000000");
  }
  assert.equal(normalizePhone("2160000000"), null);
  assert.equal(normalizePhone(""), null);
});

test("şablon parametresinde satır sonu ve fazla boşluk temizlenir", () => {
  // Meta yeni satır ya da 4+ boşluk içeren parametreyi reddediyor (132000).
  assert.equal(templateParam("Deneme\n  Salon   "), "Deneme Salon");
});

test("gövde onaylı şablonu ve dili taşır", () => {
  const govde = templateBody(item({ language: "tr" }));
  assert.equal(govde.type, "template");
  assert.equal(govde.template.name, "randevu_hatirlatma");
  assert.equal(govde.template.language.code, "tr");
  assert.deepEqual(govde.template.components[0].parameters.map((p) => p.text), ["Ayşe", "Deneme Salon", "yarın", "14:00", "Saç kesimi"]);
});

function sahteGetir(yanitlar: { ok: boolean; durum?: number; govde: unknown }[]) {
  const cagrilar: { adres: string; secenek: RequestInit }[] = [];
  let i = 0;
  const getir = (async (adres: string | URL, secenek?: RequestInit) => {
    cagrilar.push({ adres: String(adres), secenek: secenek ?? {} });
    const y = yanitlar[Math.min(i++, yanitlar.length - 1)];
    return { ok: y.ok, status: y.durum ?? (y.ok ? 200 : 400), json: async () => y.govde } as Response;
  }) as unknown as typeof fetch;
  return { getir, cagrilar };
}

test("başarılı gönderim mesaj kimliğini taşır", async () => {
  const { getir, cagrilar } = sahteGetir([{ ok: true, govde: { messages: [{ id: "wamid.1" }] } }]);
  const [sonuc] = await sendWhatsappTemplates([item()], SENDER, getir);
  assert.deepEqual(sonuc, { ref: "r1", to: "905320000000", sent: true, waMessageId: "wamid.1" });
  // Sürüm sabitten okunuyor: Meta sürümü emekli edince güncellenecek tek yer orası.
  assert.equal(cagrilar[0].adres, `https://graph.facebook.com/${GRAPH_VERSION}/555000/messages`);
  assert.equal((cagrilar[0].secenek.headers as Record<string, string>).Authorization, "Bearer gizli");
});

test("kimliksiz 200 gönderilmedi sayılır", async () => {
  const { getir } = sahteGetir([{ ok: true, govde: {} }]);
  const [sonuc] = await sendWhatsappTemplates([item()], SENDER, getir);
  assert.equal(sonuc.sent, false);
  assert.match(sonuc.error!, /mesaj kimliği döndürmedi/);
});

test("Meta hatası Türkçeye çevrilir ve diğer mesajlar devam eder", async () => {
  const { getir } = sahteGetir([
    { ok: true, govde: { messages: [{ id: "wamid.1" }] } },
    { ok: false, durum: 401, govde: { error: { code: 190, message: "Invalid OAuth access token" } } },
    { ok: true, govde: { messages: [{ id: "wamid.3" }] } },
  ]);
  const sonuc = await sendWhatsappTemplates(
    [item({ ref: "r1" }), item({ ref: "r2" }), item({ ref: "r3" })],
    SENDER,
    getir,
  );
  assert.deepEqual(sonuc.map((s) => [s.ref, s.sent]), [["r1", true], ["r2", false], ["r3", true]]);
  assert.match(sonuc[1].error!, /anahtarı geçersiz/);
});

test("ağ hatası mesajı düşürmez, sebebini taşır", async () => {
  const getir = (async () => { throw new Error("bağlanılamadı"); }) as unknown as typeof fetch;
  const [sonuc] = await sendWhatsappTemplates([item()], SENDER, getir);
  assert.equal(sonuc.sent, false);
  assert.match(sonuc.error!, /ulaşılamadı: bağlanılamadı/);
});

test("şablonsuz mesaj serbest metin olarak gider", () => {
  // Gelen kutusundan verilen yanıt: 24 saatlik pencere içinde şablon gerekmez.
  const govde = messageBody({ to: "905320000000", text: "Yarın 15:00 uygun." }) as { type: string; text: { body: string; preview_url: boolean } };
  assert.equal(govde.type, "text");
  assert.equal(govde.text.body, "Yarın 15:00 uygun.");
  assert.equal(govde.text.preview_url, false);
  // Şablon varsa serbest metne düşmez.
  assert.equal((messageBody(item()) as { type: string }).type, "template");
});

test("yanıt penceresi müşterinin son mesajından 24 saat sonra kapanır", () => {
  const simdi = Date.parse("2026-09-21T12:00:00Z");
  assert.equal(windowOpen("2026-09-21T11:00:00Z", simdi), true);
  assert.equal(windowOpen("2026-09-20T11:59:00Z", simdi), false);
  // Müşteri hiç yazmadıysa pencere hiç açılmadı.
  assert.equal(windowOpen(null, simdi), false);
});

describe("isimli şablon parametreleri", () => {
  test("nesne verilince her parametre kendi adını taşır", () => {
    /*
      Meta'da şablonun "Değişken türü" Ad seçilirse gövde {{kurum}} gibi
      isimli değişkenler kullanır ve her parametre parameter_name ister.
      Sıralı biçim gönderilirse 132012 ile reddedilir.
    */
    const govde = templateBody({
      to: "905307939100",
      template: "abonelik_yenileme",
      params: { kurum: "ARVOCULTURE GROUP", urun: "ArvoOS", tarih: "28 Eylül", ucret: "₺1.500,00" },
    }) as { template: { components: { parameters: { parameter_name?: string; text: string }[] }[] } };

    const p = govde.template.components[0].parameters;
    assert.deepEqual(p.map((x) => x.parameter_name), ["kurum", "urun", "tarih", "ucret"]);
    assert.equal(p[0].text, "ARVOCULTURE GROUP");
  });

  test("dizi verilince sıralı biçim korunur", () => {
    // Randevu hatırlatması sıralı şablon kullanıyor; o yol bozulmamalı.
    const govde = templateBody({
      to: "905307939100",
      template: "randevu_hatirlatma",
      params: ["Ayşe", "Deneme Salon", "22 Eylül", "14:30", "Saç kesimi"],
    }) as { template: { components: { parameters: { parameter_name?: string; text: string }[] }[] } };

    const p = govde.template.components[0].parameters;
    assert.equal(p[0].parameter_name, undefined);
    assert.deepEqual(p.map((x) => x.text), ["Ayşe", "Deneme Salon", "22 Eylül", "14:30", "Saç kesimi"]);
  });

  test("parametresiz şablonda components hiç gönderilmez", () => {
    // Boş dizi Meta'yı "gövde parametresi bekleniyor" sanmaya itiyor.
    const govde = templateBody({ to: "905307939100", template: "merhaba" }) as { template: Record<string, unknown> };
    assert.equal("components" in govde.template, false);
  });
});

describe("şablonun dinamik URL düğmesi", () => {
  const ANAHTAR = "9f2c1a7b4e6d08c35a1f9b2e7d4c6a8f0b3e5d7c9a1f2b4d";

  test("düğme parametresi ayrı bir bileşen olarak gider", () => {
    /*
      Bağlantı gövdeye değil düğmeye konuyor: Meta gövde değişkeni içindeki
      adresleri sık reddediyor ve müşteri dokunulabilir düğme yerine düz
      metin görüyordu.
    */
    const govde = templateBody({
      to: "905321234567",
      template: "teklif_hazir",
      params: { musteri: "Ayşe Yılmaz", kurum: "Akademik Merkez", belge_no: "TKL-2026-014" },
      urlButtonParam: ANAHTAR,
    }) as { template: { components: { type: string; sub_type?: string; index?: string; parameters: unknown[] }[] } };

    const dugme = govde.template.components.find((bilesen) => bilesen.type === "button");
    assert.ok(dugme, "düğme bileşeni yok");
    assert.equal(dugme.sub_type, "url");
    // Düğme parametresi gövdeden ayrı numaralanır; tek düğmede index "0".
    assert.equal(dugme.index, "0");
    assert.deepEqual(dugme.parameters, [{ type: "text", text: ANAHTAR }]);
  });

  test("düğme parametresi isimlendirilmez", () => {
    // İsimli şablonda bile düğme parametresi sıraya göre yerleşir;
    // parameter_name eklenirse Meta 132012 döndürür.
    const govde = templateBody({
      to: "905321234567",
      template: "teklif_hazir",
      params: { musteri: "Ayşe" },
      urlButtonParam: ANAHTAR,
    }) as { template: { components: { type: string; parameters: Record<string, unknown>[] }[] } };

    const dugme = govde.template.components.find((bilesen) => bilesen.type === "button");
    assert.ok(dugme && !("parameter_name" in dugme.parameters[0]));
  });

  test("düğme parametresi yoksa düğme bileşeni de gönderilmez", () => {
    // Mevcut şablonlarda (abonelik_yenileme) düğme yok; boş bir button
    // bileşeni Meta'da 132000'e yol açardı.
    const govde = templateBody({
      to: "905321234567",
      template: "abonelik_yenileme",
      params: { abone: "Akademik Merkez" },
    }) as { template: { components: { type: string }[] } };

    assert.ok(!govde.template.components.some((bilesen) => bilesen.type === "button"));
  });

  test("gövde parametresi olmayan şablonda yalnızca düğme gider", () => {
    const govde = templateBody({
      to: "905321234567",
      template: "sozlesme_imza",
      urlButtonParam: ANAHTAR,
    }) as { template: { components: { type: string }[] } };

    assert.deepEqual(govde.template.components.map((bilesen) => bilesen.type), ["button"]);
  });
});
