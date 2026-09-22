// Teklif ve sözleşme için ortak, kapsamlı (scoped) belge stili.
// Belgeler panelden bağımsız çalıştığı için panel token'larına bağlı değil;
// kendi değişkenlerini .doc-root üzerinde tanımlar. Ekranda A4 kâğıt
// görünümü, yazdırmada (PDF) kenar boşlukları @page ile birebir aynıdır.
//
// SINIF ÖNEKİ `doc-` OLMALI, `ad-` DEĞİL. Sınıflar eskiden ad-root, ad-sheet
// diye başlıyordu; reklam engelleyiciler `ad-` önekini reklam sanıp kozmetik
// filtreyle display:none basıyor. Sonuç: sunucu belgeyi eksiksiz üretiyor,
// tarayıcı da alıyor, ama müşteri bomboş bir sayfa görüyor — imzaya
// gönderdiğimiz sözleşme dahil. Hiçbir hata da görünmüyor, teşhisi zor.
// Yeni sınıf eklerken ad-, ads-, banner-, sponsor- gibi önekleri kullanmayın.

const cssString = (value: string) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ")}"`;

export function documentCss({ footerLeft }: { footerLeft: string }) {
  return `
@page{size:A4;margin:16mm 14mm 18mm;
 @bottom-left{content:${cssString(footerLeft)};font-family:-apple-system,"Helvetica Neue",Arial,sans-serif;font-size:7pt;color:#8a8f98}
 @bottom-right{content:"Sayfa " counter(page) " / " counter(pages);font-family:-apple-system,"Helvetica Neue",Arial,sans-serif;font-size:7pt;color:#8a8f98}
}
.doc-root{--doc-ink:#0b1b2e;--doc-ink-2:#23324a;--doc-text:#2a3442;--doc-muted:#626b78;--doc-soft:#8a909a;--doc-line:#e4ded2;--doc-line-2:#eeeae2;--doc-cream:#faf8f3;--doc-gold:#b8955a;--doc-gold-2:#dcc69d;--doc-ok:#1f6b45;--doc-ok-bg:#edf6f0;--doc-bad:#8c332e;--doc-bad-bg:#fbf0ef;
 --doc-font:var(--font-system,-apple-system,BlinkMacSystemFont,"SF Pro Text","Inter","Helvetica Neue",Arial,sans-serif);
 --doc-mono:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace;
 min-height:100vh;padding:28px 12px 56px;background:#e9e5dc;color:var(--doc-ink);font-family:var(--doc-font);font-size:9pt;line-height:1.6;-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums;-webkit-print-color-adjust:exact;print-color-adjust:exact;text-rendering:optimizeLegibility}
.doc-root *{box-sizing:border-box}
.doc-root img{max-width:100%}
.doc-toolbar{width:210mm;max-width:100%;margin:0 auto 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.doc-toolbar-actions{display:flex;gap:8px;flex-wrap:wrap;margin-left:auto}
.doc-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:40px;padding:0 16px;border-radius:10px;border:1px solid #cfc6b6;background:#fff;color:var(--doc-ink);font:600 13px/1.2 var(--doc-font);text-decoration:none;cursor:pointer;white-space:nowrap}
.doc-btn:hover{background:#faf8f3}
.doc-btn-primary{background:linear-gradient(180deg,#1d3354,#0b1b2e);border-color:#0b1b2e;color:#fff;box-shadow:0 0 0 1px rgba(201,166,106,.55),0 8px 18px rgba(11,27,46,.18)}
.doc-btn-primary:hover{background:linear-gradient(180deg,#243d63,#10233b)}
.doc-btn svg{width:15px;height:15px;flex:none}
.doc-sheet{position:relative;width:210mm;max-width:100%;min-height:297mm;margin:0 auto;padding:16mm 14mm 18mm;background:#fff;box-shadow:0 1px 0 rgba(11,27,46,.05),0 30px 80px rgba(11,27,46,.14);overflow-wrap:break-word}
.doc-band{height:2.2mm;margin:-16mm -14mm 10mm;background:linear-gradient(90deg,var(--doc-ink) 0 72%,var(--doc-brand) 72% 100%)}
.doc-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10mm;padding-bottom:5mm;border-bottom:.35mm solid var(--doc-ink)}
.doc-head-brand{min-width:0;flex:1}
.doc-head-brand img{display:block;max-width:60mm;max-height:17mm;width:auto;height:auto;object-fit:contain;object-position:left top}
.doc-wordmark{font-size:16pt;font-weight:700;letter-spacing:-.01em;color:var(--doc-ink)}
.doc-head-brand p{margin:2.2mm 0 0;color:var(--doc-muted);font-size:7.4pt;line-height:1.5;max-width:92mm;white-space:pre-line}
.doc-head-meta{text-align:right;flex:none;max-width:78mm}
.doc-kicker{font-size:6.6pt;font-weight:700;letter-spacing:.24em;text-transform:uppercase;color:var(--doc-brand)}
.doc-head-meta strong{display:block;margin-top:1.4mm;font-size:14pt;font-weight:700;letter-spacing:-.01em;color:var(--doc-ink)}
.doc-meta{display:grid;grid-template-columns:auto auto;justify-content:end;column-gap:3mm;row-gap:.5mm;margin:2mm 0 0;font-size:7.4pt;color:var(--doc-muted)}
.doc-meta dt{text-align:right}.doc-meta dd{margin:0;color:var(--doc-ink);font-weight:600;text-align:right}
.doc-rule{height:.3mm;margin-top:.7mm;background:linear-gradient(90deg,var(--doc-brand),rgba(184,149,90,0) 70%)}
.doc-title{padding:8mm 0 1mm}
.doc-title h1{margin:1.6mm 0 0;font-size:20pt;line-height:1.15;font-weight:700;letter-spacing:-.02em;color:var(--doc-ink)}
.doc-title p{margin:2.4mm 0 0;color:var(--doc-muted);font-size:8.8pt;max-width:160mm}
.doc-notice,.doc-error{margin:5mm 0 0;padding:3mm 4mm;border-radius:2mm;font-size:8.6pt;font-weight:600}
.doc-notice{background:var(--doc-ok-bg);color:var(--doc-ok);border:.2mm solid #cfe5d7}
.doc-error{background:var(--doc-bad-bg);color:var(--doc-bad);border:.2mm solid #efd0cd}
.doc-sec{margin-top:7mm}
.doc-sec-h{display:flex;align-items:center;gap:3mm;margin:0 0 3mm;font-size:7pt;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--doc-ink);break-after:avoid;page-break-after:avoid}
.doc-sec-h b{color:var(--doc-brand);font-weight:700}
.doc-sec-h:after{content:"";flex:1;height:.2mm;background:var(--doc-line)}
.doc-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:5mm}
.doc-party{padding:4.2mm 4.8mm;border:.2mm solid var(--doc-line);border-radius:2.4mm;background:var(--doc-cream);break-inside:avoid;page-break-inside:avoid;min-width:0}
.doc-party h3{margin:0 0 1.4mm;font-size:6.4pt;letter-spacing:.2em;text-transform:uppercase;color:var(--doc-brand);font-weight:700}
.doc-party strong{display:block;font-size:10.5pt;line-height:1.3;margin-bottom:1.6mm;color:var(--doc-ink)}
.doc-dl{display:grid;grid-template-columns:24mm minmax(0,1fr);gap:.7mm 3mm;margin:0;font-size:7.8pt;line-height:1.45}
.doc-dl dt{color:var(--doc-soft)}.doc-dl dd{margin:0;color:var(--doc-text);overflow-wrap:anywhere;white-space:pre-line}
.doc-facts{display:grid;grid-template-columns:1.25fr 1fr 1fr 1fr;border:.2mm solid var(--doc-line);border-radius:2.4mm;overflow:hidden;break-inside:avoid}
.doc-fact{padding:3.4mm 4mm;border-left:.2mm solid var(--doc-line);min-width:0}
.doc-fact:first-child{border-left:0}
.doc-fact small{display:block;font-size:6.2pt;letter-spacing:.16em;text-transform:uppercase;color:var(--doc-soft);font-weight:700}
.doc-fact strong{display:block;margin-top:1.2mm;font-size:9.6pt;font-weight:700;line-height:1.3;color:var(--doc-ink)}
.doc-fact-dark{background:var(--doc-ink)}
.doc-fact-dark small{color:var(--doc-gold-2)}.doc-fact-dark strong{color:#fff;font-size:11.5pt}
.doc-table-wrap{width:100%}
.doc-table{width:100%;border-collapse:collapse;font-size:8pt;line-height:1.45}
.doc-table thead{display:table-header-group}
.doc-table th{padding:2.2mm 2.4mm;text-align:left;font-size:6.2pt;letter-spacing:.14em;text-transform:uppercase;color:var(--doc-soft);font-weight:700;border-bottom:.35mm solid var(--doc-ink);white-space:nowrap}
.doc-table td{padding:2.5mm 2.4mm;border-bottom:.2mm solid var(--doc-line-2);vertical-align:top;color:var(--doc-text)}
.doc-table tr{break-inside:avoid;page-break-inside:avoid}
.doc-table td strong{color:var(--doc-ink);font-weight:700}
.doc-table ul{margin:1.2mm 0 0;padding-left:4mm;color:var(--doc-muted)}
.doc-table li{margin:.4mm 0}
.doc-table tfoot td{font-weight:700;color:var(--doc-ink);border-top:.35mm solid var(--doc-ink);border-bottom:0}
.doc-num{text-align:right!important;white-space:nowrap}
.doc-center{text-align:center!important}
.doc-pill{display:inline-block;padding:.3mm 2mm;border-radius:10mm;background:var(--doc-line-2);color:var(--doc-muted);font-size:6.8pt;font-weight:700;white-space:nowrap}
.doc-pill-ok{background:var(--doc-ok-bg);color:var(--doc-ok)}
.doc-pill-bad{background:var(--doc-bad-bg);color:var(--doc-bad)}
.doc-paylink{display:inline-block;margin-top:.8mm;font-size:7pt;font-weight:700;color:var(--doc-brand);text-decoration:none}
.doc-totals{margin:3mm 0 0 auto;width:92mm;max-width:100%;break-inside:avoid;page-break-inside:avoid}
.doc-totals>div{display:flex;justify-content:space-between;gap:4mm;padding:1.5mm 0;border-bottom:.2mm solid var(--doc-line-2);font-size:8.2pt;color:var(--doc-text)}
.doc-totals>div span:last-child{font-weight:600;color:var(--doc-ink);white-space:nowrap}
.doc-totals .doc-grand{margin-top:1.6mm;padding:3mm 4mm;border:0;border-radius:2mm;background:var(--doc-ink);color:#fff;font-size:10.5pt;font-weight:700}
.doc-totals .doc-grand span{color:#fff!important}
.doc-totals .doc-grand span:first-child{font-size:7pt;letter-spacing:.16em;text-transform:uppercase;color:var(--doc-gold-2)!important;align-self:center}
.doc-words{margin-top:1.6mm;font-size:7.2pt;color:var(--doc-muted);text-align:right;font-style:italic}
.doc-box{padding:4mm 4.8mm;border:.2mm solid var(--doc-line);border-radius:2.4mm;background:#fff;break-inside:avoid;page-break-inside:avoid}
.doc-box p{margin:0 0 1.6mm;font-size:8.2pt;color:var(--doc-text);line-height:1.6}
.doc-box p:last-child{margin-bottom:0}
.doc-list{margin:0;padding-left:4.6mm;font-size:8.2pt;color:var(--doc-text);line-height:1.6}
.doc-list li{margin:.8mm 0}
.doc-list li::marker{color:var(--doc-brand)}
.doc-articles{margin-top:1mm}
.doc-article{margin:0 0 4.6mm}
.doc-keep{break-inside:avoid;page-break-inside:avoid}
.doc-article h2{display:flex;gap:3mm;align-items:baseline;margin:0 0 1.8mm;padding-bottom:1.2mm;border-bottom:.2mm solid var(--doc-line-2);font-size:8.8pt;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--doc-ink);break-after:avoid;page-break-after:avoid}
.doc-article h2 em{font-style:normal;color:var(--doc-brand);font-size:7.2pt;letter-spacing:.18em;flex:none}
.doc-article h4{margin:2.4mm 0 1.2mm;font-size:8.2pt;font-weight:700;color:var(--doc-ink);break-after:avoid;page-break-after:avoid}
.doc-article p{margin:0 0 1.5mm;text-align:justify;-webkit-hyphens:auto;hyphens:auto;color:var(--doc-text);font-size:8.3pt;line-height:1.62;orphans:3;widows:3}
.doc-article p .doc-pn{color:var(--doc-ink);font-weight:700;margin-right:1.4mm;font-variant-numeric:tabular-nums}
.doc-article ul,.doc-article ol{margin:0 0 1.8mm;padding-left:7mm;color:var(--doc-text);font-size:8.3pt;line-height:1.58}
.doc-article li{margin:.6mm 0;text-align:justify}
.doc-article li::marker{color:var(--doc-brand)}
.doc-article .doc-block{margin:2mm 0 2.6mm}
.doc-sign{display:grid;grid-template-columns:1fr 1fr;gap:5mm;break-inside:avoid;page-break-inside:avoid}
.doc-sign-card{display:flex;flex-direction:column;min-width:0;padding:4.4mm 4.8mm;border:.2mm solid var(--doc-line);border-radius:2.4mm;background:#fff}
.doc-sign-card h3{margin:0;font-size:6.4pt;letter-spacing:.22em;text-transform:uppercase;color:var(--doc-brand);font-weight:700}
.doc-sign-name{margin-top:1.4mm;font-size:10pt;font-weight:700;line-height:1.3;color:var(--doc-ink)}
.doc-sign-sub{margin-top:.4mm;font-size:7.2pt;color:var(--doc-muted)}
.doc-sign-art{height:27mm;margin:3mm 0 2.2mm;display:flex;align-items:center;justify-content:center;border-bottom:.3mm solid var(--doc-ink);background:linear-gradient(180deg,#fff,#fcfbf8)}
.doc-sign-art img{max-height:25mm;max-width:100%;object-fit:contain}
.doc-sign-empty{color:#b3ab9c;font-size:6.8pt;letter-spacing:.2em;text-transform:uppercase}
.doc-sign-caption{font-size:6.6pt;letter-spacing:.14em;text-transform:uppercase;color:var(--doc-soft);text-align:center;margin-bottom:2.4mm}
.doc-esign{display:inline-flex;align-items:center;gap:1.6mm;align-self:flex-start;margin:0 0 2.2mm;padding:.9mm 2.6mm;border-radius:10mm;background:var(--doc-ok-bg);color:var(--doc-ok);font-size:6.8pt;font-weight:700;letter-spacing:.04em}
.doc-esign i{display:grid;place-items:center;width:3.4mm;height:3.4mm;border-radius:50%;background:var(--doc-ok);color:#fff;font-style:normal;font-size:6pt}
.doc-esign-pending{background:var(--doc-line-2);color:var(--doc-muted)}
.doc-audit{display:grid;grid-template-columns:auto minmax(0,1fr);gap:.8mm 3mm;margin:0;font-size:7pt;line-height:1.45}
.doc-audit dt{color:var(--doc-soft);white-space:nowrap}
.doc-audit dd{margin:0;color:var(--doc-ink);font-weight:600;overflow-wrap:anywhere}
.doc-hash{font-family:var(--doc-mono);font-size:6.3pt;font-weight:500!important;letter-spacing:.02em;word-break:break-all;color:var(--doc-ink-2)!important}
.doc-blank{display:grid;gap:4.5mm;margin-top:3mm;font-size:7pt;color:var(--doc-soft)}
.doc-blank span{display:block;padding-top:1mm;border-top:.2mm solid #cfc7b8}
.doc-await{display:flex;align-items:flex-start;gap:3mm;margin:3.4mm 0 3mm;padding:3.6mm 4mm;border:.2mm solid var(--doc-line-2);border-radius:2mm;background:var(--doc-cream)}
.doc-await-dot{flex:none;width:2.6mm;height:2.6mm;margin-top:1.1mm;border-radius:50%;background:var(--doc-gold);box-shadow:0 0 0 1mm rgba(184,149,90,.22)}
.doc-await b{display:block;font-size:9pt;color:var(--doc-ink)}
.doc-await p{margin:1mm 0 0;font-size:7.4pt;line-height:1.5;color:var(--doc-muted)}
.doc-consents{margin:3mm 0 0;padding:0;list-style:none;font-size:7.2pt;color:var(--doc-text);display:grid;gap:.8mm}
.doc-consents li:before{content:"✓";margin-right:1.6mm;color:var(--doc-ok);font-weight:700}
.doc-legal-note{margin:4mm 0 0;padding-top:2.6mm;border-top:.2mm dashed var(--doc-line);font-size:6.9pt;line-height:1.55;color:var(--doc-soft)}
.doc-annex{margin-top:9mm;padding-top:7mm;border-top:.35mm solid var(--doc-ink)}
.doc-annex-h{margin:0 0 1mm;font-size:12pt;font-weight:700;letter-spacing:-.01em;color:var(--doc-ink)}
.doc-annex-sub{margin:0 0 4mm;font-size:7.8pt;color:var(--doc-muted)}
.doc-annex .doc-table td:first-child{width:44mm;font-weight:700;color:var(--doc-ink)}
.doc-decision{padding:4.4mm 4.8mm;border-radius:2.4mm;border:.2mm solid #cfe5d7;background:linear-gradient(180deg,#f3faf5,#ebf5ee);break-inside:avoid}
.doc-decision.is-rejected{border-color:#efd0cd;background:linear-gradient(180deg,#fdf5f4,#faeeed)}
.doc-decision-badge{display:flex;align-items:center;gap:2.4mm;margin:0 0 3mm;font-size:10pt;font-weight:700;color:var(--doc-ok)}
.is-rejected .doc-decision-badge{color:var(--doc-bad)}
.doc-decision-badge i{display:grid;place-items:center;width:5.6mm;height:5.6mm;border-radius:50%;background:var(--doc-ok);color:#fff;font-style:normal;font-size:8pt}
.is-rejected .doc-decision-badge i{background:var(--doc-bad)}
.doc-decision .doc-audit{font-size:7.6pt}
.doc-decision-link{display:inline-block;margin-top:3.4mm;padding:2.4mm 4mm;border-radius:2mm;background:var(--doc-ok);color:#fff;font-size:8.4pt;font-weight:700;text-decoration:none}
.doc-actions{margin-top:6mm}
.doc-actions form{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.doc-actions button{min-height:48px;border-radius:10px;font:700 13px/1.2 var(--doc-font);letter-spacing:.06em;cursor:pointer}
.doc-accept{border:0;background:linear-gradient(180deg,#1d3354,#0b1b2e);color:#fff;box-shadow:0 0 0 1px rgba(201,166,106,.55),0 10px 22px rgba(11,27,46,.18)}
.doc-reject{border:1px solid #d9b4ae;background:#fff;color:var(--doc-bad)}
.doc-actions p{margin:3mm 0 0;font-size:7.6pt;color:var(--doc-muted);text-align:center}
.doc-status{margin-top:6mm;padding:3mm 4mm;border-radius:2mm;background:var(--doc-cream);border:.2mm solid var(--doc-line);font-size:8.4pt;color:var(--doc-text);text-align:center}
.doc-track{display:flex;align-items:center;justify-content:space-between;gap:4mm;margin:0 0 5mm;padding:3.4mm 4mm;border:.2mm solid var(--doc-line);border-radius:2.4mm;background:var(--doc-cream)}
.doc-track div{display:flex;flex-direction:column;gap:1mm;min-width:0}
.doc-track b{font-size:9.4pt;color:var(--doc-ink)}
.doc-track span{font-size:8.4pt;color:var(--doc-muted)}
.doc-track code{font:700 9.4pt var(--doc-mono);letter-spacing:.08em;color:var(--doc-ink)}
@media (max-width:640px){.doc-track{flex-direction:column;align-items:stretch}.doc-track .doc-btn{width:100%}}
.doc-addendum{margin:0 0 5mm;padding:5mm;border:.2mm solid var(--doc-line);border-radius:2.4mm;background:#fff}
.doc-addendum.is-sent{border-color:var(--doc-gold-2);background:linear-gradient(180deg,#fffdf9,#fbf8f1)}
.doc-addendum-head{display:flex;align-items:flex-start;justify-content:space-between;gap:4mm;margin:0 0 3mm;break-after:avoid}
.doc-addendum-head h3{margin:1mm 0 .6mm;font-size:12pt;line-height:1.25;color:var(--doc-ink)}
.doc-addendum-head small{color:var(--doc-soft);font-size:7.4pt}
.doc-addendum>p,.doc-addendum-note{margin:0 0 3mm;font-size:8.6pt;line-height:1.55;color:var(--doc-text)}
.doc-addendum h4{margin:4mm 0 2mm;font-size:7pt;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--doc-ink);break-after:avoid}
.doc-addendum .doc-decision{margin-top:4mm}
.doc-addendum .doc-form{margin-top:5mm}
.doc-addendum .doc-field textarea{display:block;width:100%;min-height:84px;margin-top:2mm;padding:10px 12px;border:1px solid #d8d0c2;border-radius:10px;background:#fff;color:var(--doc-ink);font:500 14px/1.45 var(--doc-font);resize:vertical}
.doc-addendum .doc-field small{font-weight:500;color:var(--doc-muted)}
.doc-addendum .doc-actions-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.doc-addendum .doc-actions .doc-accept,.doc-addendum .doc-actions .doc-reject{width:100%;min-height:48px;margin:0;border-radius:10px;font:700 13px/1.2 var(--doc-font);letter-spacing:.06em;cursor:pointer}
.doc-addendum .doc-actions .doc-accept{border:0;background:linear-gradient(180deg,#1d3354,#0b1b2e);color:#fff;box-shadow:0 0 0 1px rgba(201,166,106,.55),0 10px 22px rgba(11,27,46,.18)}
.doc-addendum .doc-actions .doc-reject{border:1px solid #d9b4ae;background:#fff;color:var(--doc-bad);box-shadow:none}
@media (max-width:760px){.doc-table-wrap .doc-table.doc-table-compact{min-width:0}.doc-table-compact th,.doc-table-compact td{white-space:normal}.doc-table-compact td.doc-num{white-space:nowrap}}
@media (max-width:640px){.doc-addendum{padding:16px}.doc-addendum-head{flex-direction:column}.doc-addendum .doc-actions-row{grid-template-columns:1fr}}
.doc-related{margin:5mm 0 0;text-align:center}
.doc-foot{display:grid;grid-template-columns:1.2fr 1.4fr 1fr;gap:6mm;margin-top:9mm;padding-top:4mm;border-top:.2mm solid var(--doc-line);font-size:7pt;line-height:1.5;color:var(--doc-muted);break-inside:avoid}
.doc-foot strong{display:block;margin-bottom:.8mm;font-size:6.4pt;letter-spacing:.18em;text-transform:uppercase;color:var(--doc-ink)}
.doc-foot div{min-width:0;overflow-wrap:anywhere;white-space:pre-line}
.doc-foot .doc-right{text-align:right}
.doc-foot .doc-foot-note{grid-column:1/-1;margin:0;padding-top:2.4mm;border-top:.2mm dashed var(--doc-line-2);font-size:6.8pt;line-height:1.5;color:var(--doc-soft);white-space:pre-line}
.doc-bank{display:grid;grid-template-columns:repeat(auto-fit,minmax(38mm,1fr));border:.2mm solid var(--doc-line);border-radius:2.4mm;background:var(--doc-cream);overflow:hidden;break-inside:avoid;page-break-inside:avoid}
.doc-bank>div{min-width:0;padding:2.8mm 4mm;border-left:.2mm solid var(--doc-line)}
.doc-bank>div:first-child{border-left:0}
.doc-bank small{display:block;font-size:6.2pt;letter-spacing:.16em;text-transform:uppercase;color:var(--doc-soft);font-weight:700}
.doc-bank strong{display:block;margin-top:.8mm;font-size:8.6pt;font-weight:700;line-height:1.35;color:var(--doc-ink);overflow-wrap:anywhere}
.doc-bank-iban{grid-column:span 2}
.doc-bank-iban strong{font-family:var(--doc-mono);font-size:8.8pt;letter-spacing:.04em;white-space:nowrap;overflow-wrap:normal}
.doc-confidential{margin-top:3mm;text-align:center;font-size:6.6pt;letter-spacing:.12em;text-transform:uppercase;color:var(--doc-soft)}
.doc-form{margin:7mm 0 0;padding:6mm;border:.3mm solid var(--doc-brand);border-radius:3mm;background:linear-gradient(180deg,#fffdf9,#faf6ee);box-shadow:0 12px 30px rgba(11,27,46,.08)}
.doc-form-head h3{margin:1.2mm 0 1mm;font-size:13pt;color:var(--doc-ink)}
.doc-form-head p{margin:0 0 4mm;font-size:8.4pt;color:var(--doc-muted)}
.doc-field{display:block;margin:0 0 4mm;font-size:9pt;font-weight:700;color:var(--doc-ink)}
.doc-field input{display:block;width:100%;margin-top:2mm;padding:11px 12px;border:1px solid #d6ccba;border-radius:9px;font:500 15px/1.3 var(--doc-font);color:var(--doc-ink);background:#fff}
.doc-field input:focus{outline:2px solid var(--doc-brand);outline-offset:1px;border-color:var(--doc-brand)}
.doc-signature-field{margin:0 0 4mm}
.doc-signature-head{display:flex;align-items:center;justify-content:space-between;margin:0 0 2mm;font-size:9pt}
.doc-signature-head strong{color:var(--doc-ink)}
.doc-signature-head button{border:1px solid #d6ccba;background:#fff;color:var(--doc-text);font:600 12px/1 var(--doc-font);padding:8px 12px;border-radius:8px;cursor:pointer}
.doc-signature-canvas{display:block;width:100%;height:40mm;border:1.5px dashed #cdbf9f;border-radius:10px;background:repeating-linear-gradient(-45deg,#fffdf9,#fffdf9 10px,#f8f3ea 10px,#f8f3ea 20px);cursor:crosshair;touch-action:none}
.doc-signature-field small{display:block;margin-top:2mm;font-size:8pt;color:var(--doc-muted)}
.doc-consent-set{margin:0 0 4mm;padding:0;border:0}
.doc-consent-set legend{margin-bottom:2mm;font-size:9pt;font-weight:700;color:var(--doc-ink)}
.doc-check{display:flex;align-items:flex-start;gap:10px;margin:0 0 2.6mm;padding:10px 12px;border:1px solid var(--doc-line);border-radius:9px;background:#fff;cursor:pointer}
.doc-check input{margin-top:2px;width:18px;height:18px;flex:none;accent-color:#0b1b2e}
.doc-check span{font-size:8.6pt;line-height:1.5;color:var(--doc-text)}
.doc-check b{color:var(--doc-ink)}
.doc-check-optional{border-style:dashed}
.doc-form-error{margin:0 0 4mm;padding:2.6mm 3mm;border-radius:7px;background:var(--doc-bad-bg);color:var(--doc-bad);font-size:9pt;font-weight:700}
.doc-form-legal{margin:0 0 4mm;font-size:7.6pt;line-height:1.55;color:var(--doc-muted)}
.doc-form button[type=submit]{display:block;width:100%;min-height:50px;border:0;border-radius:10px;background:linear-gradient(180deg,#1d3354,#0b1b2e);box-shadow:0 0 0 1px rgba(201,166,106,.55),0 10px 22px rgba(11,27,46,.2);color:#fff;font:700 15px/1 var(--doc-font);letter-spacing:.03em;cursor:pointer}
.doc-printbar{position:sticky;top:0;z-index:5;width:210mm;max-width:100%;margin:0 auto 14px;padding:12px 14px;border-radius:12px;background:rgba(11,27,46,.94);color:#fff;display:flex;align-items:center;gap:12px;flex-wrap:wrap;box-shadow:0 12px 30px rgba(11,27,46,.25)}
.doc-printbar p{margin:0;flex:1 1 260px;font-size:12px;line-height:1.45;color:#d9dfe7}
.doc-printbar p b{color:#fff}
.doc-printbar .doc-btn{min-height:38px}
.doc-printbar .doc-btn:not(.doc-btn-primary){background:transparent;color:#fff;border-color:rgba(255,255,255,.35)}
@media screen{.doc-print-overlay{position:fixed;inset:0;z-index:2147483000;overflow:auto;-webkit-overflow-scrolling:touch}}
@media screen and (max-width:760px){
 .doc-root{padding:12px 0 40px}
 .doc-toolbar,.doc-printbar{margin-left:10px;margin-right:10px;width:auto}
 .doc-sheet{width:100%;min-height:0;padding:22px 18px 28px;font-size:10pt}
 .doc-band{margin:-22px -18px 18px}
 .doc-head{flex-direction:column;gap:14px}
 .doc-head-meta{text-align:left;max-width:none}
 .doc-meta{justify-content:start}.doc-meta dt,.doc-meta dd{text-align:left}
 .doc-grid-2,.doc-sign,.doc-foot{grid-template-columns:1fr}
 .doc-foot .doc-right{text-align:left}
 .doc-bank{grid-template-columns:1fr}
 .doc-bank>div{border-left:0;border-top:.2mm solid var(--doc-line)}
 .doc-bank>div:first-child{border-top:0}
 .doc-bank-iban{grid-column:auto}
 .doc-bank-iban strong{white-space:normal}
 .doc-facts{grid-template-columns:1fr 1fr}
 .doc-fact:nth-child(3){border-left:0}
 .doc-fact:nth-child(n+3){border-top:.2mm solid var(--doc-line)}
 .doc-totals{width:100%}
 .doc-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
 .doc-table-wrap .doc-table{min-width:520px}
 .doc-title h1{font-size:18pt}
 .doc-article p,.doc-article ul,.doc-article ol{font-size:9.6pt;text-align:left}
 .doc-dl{grid-template-columns:28mm minmax(0,1fr);font-size:9pt}
 .doc-actions form{grid-template-columns:1fr}
 .doc-form{padding:16px}
}
@media print{
 html,body{background:#fff!important;margin:0!important;padding:0!important}
 body:has(.doc-root) *:not(:has(.doc-root)):not(.doc-root):not(.doc-root *){display:none!important}
 body:has(.doc-root) *:has(.doc-root){display:block!important;position:static!important;inset:auto!important;margin:0!important;padding:0!important;border:0!important;width:auto!important;max-width:none!important;min-width:0!important;height:auto!important;min-height:0!important;overflow:visible!important;background:#fff!important;box-shadow:none!important;transform:none!important;filter:none!important}
 .doc-root{min-height:0;padding:0!important;background:#fff!important;font-size:9pt}
 .doc-print-overlay{position:static!important;overflow:visible!important}
 .doc-noprint,.print-hide{display:none!important}
 .doc-sheet{width:auto;max-width:none;min-height:0;margin:0;padding:0;box-shadow:none}
 .doc-band{margin:0 0 7mm}
 .doc-root a{color:inherit;text-decoration:none}
 .doc-annex{break-before:page;page-break-before:always;margin-top:0;padding-top:0;border-top:0}
 .doc-sign-block{break-inside:avoid;page-break-inside:avoid}
 .doc-foot{margin-top:7mm}
}
`;
}
