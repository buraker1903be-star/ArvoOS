import { brifingOku, type BriefField, type BriefValues } from "@/lib/is-brifingi";

/*
  Brifing formunun ve özetinin tek gövdesi.

  İki ekranda da aynı sorular görünüyor — satışçı fırsatta dolduruyor,
  operasyon işte okuyup düzeltiyor. İki ayrı kopya yazılsaydı biri yeni
  bir alan tipini basmayı unuttuğunda fark yalnızca canlıda görünürdü.

  Girdi adları "alan_<kod>": brifing alanları kurumun tanımladığı
  isimler, formun kendi alanlarıyla (workflow_id, opportunity_id)
  çakışmamalı.
*/

export function BrifingAlanlari({ alanlar, values }: { alanlar: BriefField[]; values: BriefValues | null }) {
  const kayit = values ?? {};
  return (
    <>
      {alanlar.map((alan) => {
        const ad = `alan_${alan.code}`;
        const ham = kayit[alan.code];
        const metin = typeof ham === "string" ? ham : "";
        const secilenler = Array.isArray(ham) ? ham : [];
        return (
          <label className="wide" key={alan.code}>
            {alan.label}{alan.is_required ? " *" : ""}
            {alan.field_type === "long_text" ? (
              <textarea name={ad} rows={3} maxLength={2000} defaultValue={metin} required={alan.is_required} />
            ) : alan.field_type === "date" ? (
              <input type="date" name={ad} defaultValue={metin} required={alan.is_required} />
            ) : alan.field_type === "bool" ? (
              <select name={ad} defaultValue={typeof ham === "boolean" ? (ham ? "evet" : "hayir") : ""} required={alan.is_required}>
                {/* Yanıtsız "hayır" değildir: soru henüz sorulmamış demektir. */}
                <option value="">Yanıtlanmadı</option>
                <option value="evet">Evet</option>
                <option value="hayir">Hayır</option>
              </select>
            ) : alan.field_type === "select" ? (
              <select name={ad} defaultValue={metin} required={alan.is_required}>
                <option value="">Seçiniz</option>
                {(alan.options ?? []).map((secenek) => <option value={secenek} key={secenek}>{secenek}</option>)}
              </select>
            ) : alan.field_type === "multi_select" ? (
              <span className="brifing-kutular">
                {(alan.options ?? []).map((secenek) => (
                  <label className="brifing-kutu" key={secenek}>
                    <input type="checkbox" name={ad} value={secenek} defaultChecked={secilenler.includes(secenek)} />
                    {secenek}
                  </label>
                ))}
              </span>
            ) : (
              <input name={ad} maxLength={2000} defaultValue={metin} required={alan.is_required} />
            )}
            {alan.hint ? <small className="brifing-ipucu">{alan.hint}</small> : null}
          </label>
        );
      })}
    </>
  );
}

/** Doldurulmuş brifingin okunur özeti. Boş yanıtlar da görünüyor: eksik bilgi saklanmamalı. */
export function BrifingOzeti({ alanlar, values }: { alanlar: BriefField[]; values: BriefValues | null }) {
  const satirlar = brifingOku(alanlar, values);
  if (!satirlar.length) return null;
  return (
    <dl className="brifing-ozet">
      {satirlar.map(({ alan, yazi }) => (
        <div key={alan.code} className={yazi === null ? "is-bos" : undefined}>
          <dt>{alan.label}</dt>
          <dd>{yazi ?? (alan.is_required ? "Yanıtlanmadı — zorunlu" : "Yanıtlanmadı")}</dd>
        </div>
      ))}
    </dl>
  );
}
