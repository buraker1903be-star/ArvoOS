// Teklif ve sözleşme için ortak, kapsamlı (scoped) belge stili.
// Belgeler panelden bağımsız çalıştığı için panel token'larına bağlı değil;
// kendi değişkenlerini .ad-root üzerinde tanımlar. Ekranda A4 kâğıt
// görünümü, yazdırmada (PDF) kenar boşlukları @page ile birebir aynıdır.

const cssString = (value: string) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ")}"`;

export function documentCss({ footerLeft }: { footerLeft: string }) {
  return `
@page{size:A4;margin:16mm 14mm 18mm;
 @bottom-left{content:${cssString(footerLeft)};font-family:-apple-system,"Helvetica Neue",Arial,sans-serif;font-size:7pt;color:#8a8f98}
 @bottom-right{content:"Sayfa " counter(page) " / " counter(pages);font-family:-apple-system,"Helvetica Neue",Arial,sans-serif;font-size:7pt;color:#8a8f98}
}
.ad-root{--ad-ink:#0b1b2e;--ad-ink-2:#23324a;--ad-text:#2a3442;--ad-muted:#626b78;--ad-soft:#8a909a;--ad-line:#e4ded2;--ad-line-2:#eeeae2;--ad-cream:#faf8f3;--ad-gold:#b8955a;--ad-gold-2:#dcc69d;--ad-ok:#1f6b45;--ad-ok-bg:#edf6f0;--ad-bad:#8c332e;--ad-bad-bg:#fbf0ef;
 --ad-font:var(--font-system,-apple-system,BlinkMacSystemFont,"SF Pro Text","Inter","Helvetica Neue",Arial,sans-serif);
 --ad-mono:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace;
 min-height:100vh;padding:28px 12px 56px;background:#e9e5dc;color:var(--ad-ink);font-family:var(--ad-font);font-size:9pt;line-height:1.6;-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums;-webkit-print-color-adjust:exact;print-color-adjust:exact;text-rendering:optimizeLegibility}
.ad-root *{box-sizing:border-box}
.ad-root img{max-width:100%}
.ad-toolbar{width:210mm;max-width:100%;margin:0 auto 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.ad-toolbar-actions{display:flex;gap:8px;flex-wrap:wrap;margin-left:auto}
.ad-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:40px;padding:0 16px;border-radius:10px;border:1px solid #cfc6b6;background:#fff;color:var(--ad-ink);font:600 13px/1.2 var(--ad-font);text-decoration:none;cursor:pointer;white-space:nowrap}
.ad-btn:hover{background:#faf8f3}
.ad-btn-primary{background:linear-gradient(180deg,#1d3354,#0b1b2e);border-color:#0b1b2e;color:#fff;box-shadow:0 0 0 1px rgba(201,166,106,.55),0 8px 18px rgba(11,27,46,.18)}
.ad-btn-primary:hover{background:linear-gradient(180deg,#243d63,#10233b)}
.ad-btn svg{width:15px;height:15px;flex:none}
.ad-sheet{position:relative;width:210mm;max-width:100%;min-height:297mm;margin:0 auto;padding:16mm 14mm 18mm;background:#fff;box-shadow:0 1px 0 rgba(11,27,46,.05),0 30px 80px rgba(11,27,46,.14);overflow-wrap:break-word}
.ad-band{height:2.2mm;margin:-16mm -14mm 10mm;background:linear-gradient(90deg,var(--ad-ink) 0 72%,var(--ad-brand) 72% 100%)}
.ad-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10mm;padding-bottom:5mm;border-bottom:.35mm solid var(--ad-ink)}
.ad-head-brand{min-width:0;flex:1}
.ad-head-brand img{display:block;max-width:60mm;max-height:17mm;width:auto;height:auto;object-fit:contain;object-position:left top}
.ad-wordmark{font-size:16pt;font-weight:700;letter-spacing:-.01em;color:var(--ad-ink)}
.ad-head-brand p{margin:2.2mm 0 0;color:var(--ad-muted);font-size:7.4pt;line-height:1.5;max-width:92mm;white-space:pre-line}
.ad-head-meta{text-align:right;flex:none;max-width:78mm}
.ad-kicker{font-size:6.6pt;font-weight:700;letter-spacing:.24em;text-transform:uppercase;color:var(--ad-brand)}
.ad-head-meta strong{display:block;margin-top:1.4mm;font-size:14pt;font-weight:700;letter-spacing:-.01em;color:var(--ad-ink)}
.ad-meta{display:grid;grid-template-columns:auto auto;justify-content:end;column-gap:3mm;row-gap:.5mm;margin:2mm 0 0;font-size:7.4pt;color:var(--ad-muted)}
.ad-meta dt{text-align:right}.ad-meta dd{margin:0;color:var(--ad-ink);font-weight:600;text-align:right}
.ad-rule{height:.3mm;margin-top:.7mm;background:linear-gradient(90deg,var(--ad-brand),rgba(184,149,90,0) 70%)}
.ad-title{padding:8mm 0 1mm}
.ad-title h1{margin:1.6mm 0 0;font-size:20pt;line-height:1.15;font-weight:700;letter-spacing:-.02em;color:var(--ad-ink)}
.ad-title p{margin:2.4mm 0 0;color:var(--ad-muted);font-size:8.8pt;max-width:160mm}
.ad-notice,.ad-error{margin:5mm 0 0;padding:3mm 4mm;border-radius:2mm;font-size:8.6pt;font-weight:600}
.ad-notice{background:var(--ad-ok-bg);color:var(--ad-ok);border:.2mm solid #cfe5d7}
.ad-error{background:var(--ad-bad-bg);color:var(--ad-bad);border:.2mm solid #efd0cd}
.ad-sec{margin-top:7mm}
.ad-sec-h{display:flex;align-items:center;gap:3mm;margin:0 0 3mm;font-size:7pt;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--ad-ink);break-after:avoid;page-break-after:avoid}
.ad-sec-h b{color:var(--ad-brand);font-weight:700}
.ad-sec-h:after{content:"";flex:1;height:.2mm;background:var(--ad-line)}
.ad-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:5mm}
.ad-party{padding:4.2mm 4.8mm;border:.2mm solid var(--ad-line);border-radius:2.4mm;background:var(--ad-cream);break-inside:avoid;page-break-inside:avoid;min-width:0}
.ad-party h3{margin:0 0 1.4mm;font-size:6.4pt;letter-spacing:.2em;text-transform:uppercase;color:var(--ad-brand);font-weight:700}
.ad-party strong{display:block;font-size:10.5pt;line-height:1.3;margin-bottom:1.6mm;color:var(--ad-ink)}
.ad-dl{display:grid;grid-template-columns:24mm minmax(0,1fr);gap:.7mm 3mm;margin:0;font-size:7.8pt;line-height:1.45}
.ad-dl dt{color:var(--ad-soft)}.ad-dl dd{margin:0;color:var(--ad-text);overflow-wrap:anywhere;white-space:pre-line}
.ad-facts{display:grid;grid-template-columns:1.25fr 1fr 1fr 1fr;border:.2mm solid var(--ad-line);border-radius:2.4mm;overflow:hidden;break-inside:avoid}
.ad-fact{padding:3.4mm 4mm;border-left:.2mm solid var(--ad-line);min-width:0}
.ad-fact:first-child{border-left:0}
.ad-fact small{display:block;font-size:6.2pt;letter-spacing:.16em;text-transform:uppercase;color:var(--ad-soft);font-weight:700}
.ad-fact strong{display:block;margin-top:1.2mm;font-size:9.6pt;font-weight:700;line-height:1.3;color:var(--ad-ink)}
.ad-fact-dark{background:var(--ad-ink)}
.ad-fact-dark small{color:var(--ad-gold-2)}.ad-fact-dark strong{color:#fff;font-size:11.5pt}
.ad-table-wrap{width:100%}
.ad-table{width:100%;border-collapse:collapse;font-size:8pt;line-height:1.45}
.ad-table thead{display:table-header-group}
.ad-table th{padding:2.2mm 2.4mm;text-align:left;font-size:6.2pt;letter-spacing:.14em;text-transform:uppercase;color:var(--ad-soft);font-weight:700;border-bottom:.35mm solid var(--ad-ink);white-space:nowrap}
.ad-table td{padding:2.5mm 2.4mm;border-bottom:.2mm solid var(--ad-line-2);vertical-align:top;color:var(--ad-text)}
.ad-table tr{break-inside:avoid;page-break-inside:avoid}
.ad-table td strong{color:var(--ad-ink);font-weight:700}
.ad-table ul{margin:1.2mm 0 0;padding-left:4mm;color:var(--ad-muted)}
.ad-table li{margin:.4mm 0}
.ad-table tfoot td{font-weight:700;color:var(--ad-ink);border-top:.35mm solid var(--ad-ink);border-bottom:0}
.ad-num{text-align:right!important;white-space:nowrap}
.ad-center{text-align:center!important}
.ad-pill{display:inline-block;padding:.3mm 2mm;border-radius:10mm;background:var(--ad-line-2);color:var(--ad-muted);font-size:6.8pt;font-weight:700;white-space:nowrap}
.ad-pill-ok{background:var(--ad-ok-bg);color:var(--ad-ok)}
.ad-pill-bad{background:var(--ad-bad-bg);color:var(--ad-bad)}
.ad-paylink{display:inline-block;margin-top:.8mm;font-size:7pt;font-weight:700;color:var(--ad-brand);text-decoration:none}
.ad-totals{margin:3mm 0 0 auto;width:92mm;max-width:100%;break-inside:avoid;page-break-inside:avoid}
.ad-totals>div{display:flex;justify-content:space-between;gap:4mm;padding:1.5mm 0;border-bottom:.2mm solid var(--ad-line-2);font-size:8.2pt;color:var(--ad-text)}
.ad-totals>div span:last-child{font-weight:600;color:var(--ad-ink);white-space:nowrap}
.ad-totals .ad-grand{margin-top:1.6mm;padding:3mm 4mm;border:0;border-radius:2mm;background:var(--ad-ink);color:#fff;font-size:10.5pt;font-weight:700}
.ad-totals .ad-grand span{color:#fff!important}
.ad-totals .ad-grand span:first-child{font-size:7pt;letter-spacing:.16em;text-transform:uppercase;color:var(--ad-gold-2)!important;align-self:center}
.ad-words{margin-top:1.6mm;font-size:7.2pt;color:var(--ad-muted);text-align:right;font-style:italic}
.ad-box{padding:4mm 4.8mm;border:.2mm solid var(--ad-line);border-radius:2.4mm;background:#fff;break-inside:avoid;page-break-inside:avoid}
.ad-box p{margin:0 0 1.6mm;font-size:8.2pt;color:var(--ad-text);line-height:1.6}
.ad-box p:last-child{margin-bottom:0}
.ad-list{margin:0;padding-left:4.6mm;font-size:8.2pt;color:var(--ad-text);line-height:1.6}
.ad-list li{margin:.8mm 0}
.ad-list li::marker{color:var(--ad-brand)}
.ad-articles{margin-top:1mm}
.ad-article{margin:0 0 4.6mm}
.ad-keep{break-inside:avoid;page-break-inside:avoid}
.ad-article h2{display:flex;gap:3mm;align-items:baseline;margin:0 0 1.8mm;padding-bottom:1.2mm;border-bottom:.2mm solid var(--ad-line-2);font-size:8.8pt;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--ad-ink);break-after:avoid;page-break-after:avoid}
.ad-article h2 em{font-style:normal;color:var(--ad-brand);font-size:7.2pt;letter-spacing:.18em;flex:none}
.ad-article h4{margin:2.4mm 0 1.2mm;font-size:8.2pt;font-weight:700;color:var(--ad-ink);break-after:avoid;page-break-after:avoid}
.ad-article p{margin:0 0 1.5mm;text-align:justify;-webkit-hyphens:auto;hyphens:auto;color:var(--ad-text);font-size:8.3pt;line-height:1.62;orphans:3;widows:3}
.ad-article p .ad-pn{color:var(--ad-ink);font-weight:700;margin-right:1.4mm;font-variant-numeric:tabular-nums}
.ad-article ul,.ad-article ol{margin:0 0 1.8mm;padding-left:7mm;color:var(--ad-text);font-size:8.3pt;line-height:1.58}
.ad-article li{margin:.6mm 0;text-align:justify}
.ad-article li::marker{color:var(--ad-brand)}
.ad-article .ad-block{margin:2mm 0 2.6mm}
.ad-sign{display:grid;grid-template-columns:1fr 1fr;gap:5mm;break-inside:avoid;page-break-inside:avoid}
.ad-sign-card{display:flex;flex-direction:column;min-width:0;padding:4.4mm 4.8mm;border:.2mm solid var(--ad-line);border-radius:2.4mm;background:#fff}
.ad-sign-card h3{margin:0;font-size:6.4pt;letter-spacing:.22em;text-transform:uppercase;color:var(--ad-brand);font-weight:700}
.ad-sign-name{margin-top:1.4mm;font-size:10pt;font-weight:700;line-height:1.3;color:var(--ad-ink)}
.ad-sign-sub{margin-top:.4mm;font-size:7.2pt;color:var(--ad-muted)}
.ad-sign-art{height:27mm;margin:3mm 0 2.2mm;display:flex;align-items:center;justify-content:center;border-bottom:.3mm solid var(--ad-ink);background:linear-gradient(180deg,#fff,#fcfbf8)}
.ad-sign-art img{max-height:25mm;max-width:100%;object-fit:contain}
.ad-sign-empty{color:#b3ab9c;font-size:6.8pt;letter-spacing:.2em;text-transform:uppercase}
.ad-sign-caption{font-size:6.6pt;letter-spacing:.14em;text-transform:uppercase;color:var(--ad-soft);text-align:center;margin-bottom:2.4mm}
.ad-esign{display:inline-flex;align-items:center;gap:1.6mm;align-self:flex-start;margin:0 0 2.2mm;padding:.9mm 2.6mm;border-radius:10mm;background:var(--ad-ok-bg);color:var(--ad-ok);font-size:6.8pt;font-weight:700;letter-spacing:.04em}
.ad-esign i{display:grid;place-items:center;width:3.4mm;height:3.4mm;border-radius:50%;background:var(--ad-ok);color:#fff;font-style:normal;font-size:6pt}
.ad-esign-pending{background:var(--ad-line-2);color:var(--ad-muted)}
.ad-audit{display:grid;grid-template-columns:auto minmax(0,1fr);gap:.8mm 3mm;margin:0;font-size:7pt;line-height:1.45}
.ad-audit dt{color:var(--ad-soft);white-space:nowrap}
.ad-audit dd{margin:0;color:var(--ad-ink);font-weight:600;overflow-wrap:anywhere}
.ad-hash{font-family:var(--ad-mono);font-size:6.3pt;font-weight:500!important;letter-spacing:.02em;word-break:break-all;color:var(--ad-ink-2)!important}
.ad-blank{display:grid;gap:4.5mm;margin-top:3mm;font-size:7pt;color:var(--ad-soft)}
.ad-blank span{display:block;padding-top:1mm;border-top:.2mm solid #cfc7b8}
.ad-await{display:flex;align-items:flex-start;gap:3mm;margin:3.4mm 0 3mm;padding:3.6mm 4mm;border:.2mm solid var(--ad-line-2);border-radius:2mm;background:var(--ad-cream)}
.ad-await-dot{flex:none;width:2.6mm;height:2.6mm;margin-top:1.1mm;border-radius:50%;background:var(--ad-gold);box-shadow:0 0 0 1mm rgba(184,149,90,.22)}
.ad-await b{display:block;font-size:9pt;color:var(--ad-ink)}
.ad-await p{margin:1mm 0 0;font-size:7.4pt;line-height:1.5;color:var(--ad-muted)}
.ad-consents{margin:3mm 0 0;padding:0;list-style:none;font-size:7.2pt;color:var(--ad-text);display:grid;gap:.8mm}
.ad-consents li:before{content:"✓";margin-right:1.6mm;color:var(--ad-ok);font-weight:700}
.ad-legal-note{margin:4mm 0 0;padding-top:2.6mm;border-top:.2mm dashed var(--ad-line);font-size:6.9pt;line-height:1.55;color:var(--ad-soft)}
.ad-annex{margin-top:9mm;padding-top:7mm;border-top:.35mm solid var(--ad-ink)}
.ad-annex-h{margin:0 0 1mm;font-size:12pt;font-weight:700;letter-spacing:-.01em;color:var(--ad-ink)}
.ad-annex-sub{margin:0 0 4mm;font-size:7.8pt;color:var(--ad-muted)}
.ad-annex .ad-table td:first-child{width:44mm;font-weight:700;color:var(--ad-ink)}
.ad-decision{padding:4.4mm 4.8mm;border-radius:2.4mm;border:.2mm solid #cfe5d7;background:linear-gradient(180deg,#f3faf5,#ebf5ee);break-inside:avoid}
.ad-decision.is-rejected{border-color:#efd0cd;background:linear-gradient(180deg,#fdf5f4,#faeeed)}
.ad-decision-badge{display:flex;align-items:center;gap:2.4mm;margin:0 0 3mm;font-size:10pt;font-weight:700;color:var(--ad-ok)}
.is-rejected .ad-decision-badge{color:var(--ad-bad)}
.ad-decision-badge i{display:grid;place-items:center;width:5.6mm;height:5.6mm;border-radius:50%;background:var(--ad-ok);color:#fff;font-style:normal;font-size:8pt}
.is-rejected .ad-decision-badge i{background:var(--ad-bad)}
.ad-decision .ad-audit{font-size:7.6pt}
.ad-decision-link{display:inline-block;margin-top:3.4mm;padding:2.4mm 4mm;border-radius:2mm;background:var(--ad-ok);color:#fff;font-size:8.4pt;font-weight:700;text-decoration:none}
.ad-actions{margin-top:6mm}
.ad-actions form{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.ad-actions button{min-height:48px;border-radius:10px;font:700 13px/1.2 var(--ad-font);letter-spacing:.06em;cursor:pointer}
.ad-accept{border:0;background:linear-gradient(180deg,#1d3354,#0b1b2e);color:#fff;box-shadow:0 0 0 1px rgba(201,166,106,.55),0 10px 22px rgba(11,27,46,.18)}
.ad-reject{border:1px solid #d9b4ae;background:#fff;color:var(--ad-bad)}
.ad-actions p{margin:3mm 0 0;font-size:7.6pt;color:var(--ad-muted);text-align:center}
.ad-status{margin-top:6mm;padding:3mm 4mm;border-radius:2mm;background:var(--ad-cream);border:.2mm solid var(--ad-line);font-size:8.4pt;color:var(--ad-text);text-align:center}
.ad-addendum{margin:0 0 5mm;padding:5mm;border:.2mm solid var(--ad-line);border-radius:2.4mm;background:#fff}
.ad-addendum.is-sent{border-color:var(--ad-gold-2);background:linear-gradient(180deg,#fffdf9,#fbf8f1)}
.ad-addendum-head{display:flex;align-items:flex-start;justify-content:space-between;gap:4mm;margin:0 0 3mm;break-after:avoid}
.ad-addendum-head h3{margin:1mm 0 .6mm;font-size:12pt;line-height:1.25;color:var(--ad-ink)}
.ad-addendum-head small{color:var(--ad-soft);font-size:7.4pt}
.ad-addendum>p,.ad-addendum-note{margin:0 0 3mm;font-size:8.6pt;line-height:1.55;color:var(--ad-text)}
.ad-addendum h4{margin:4mm 0 2mm;font-size:7pt;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--ad-ink);break-after:avoid}
.ad-addendum .ad-decision{margin-top:4mm}
.ad-addendum .ad-form{margin-top:5mm}
.ad-addendum .ad-field textarea{display:block;width:100%;min-height:84px;margin-top:2mm;padding:10px 12px;border:1px solid #d8d0c2;border-radius:10px;background:#fff;color:var(--ad-ink);font:500 14px/1.45 var(--ad-font);resize:vertical}
.ad-addendum .ad-field small{font-weight:500;color:var(--ad-muted)}
.ad-addendum .ad-actions-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.ad-addendum .ad-actions .ad-accept,.ad-addendum .ad-actions .ad-reject{width:100%;min-height:48px;margin:0;border-radius:10px;font:700 13px/1.2 var(--ad-font);letter-spacing:.06em;cursor:pointer}
.ad-addendum .ad-actions .ad-accept{border:0;background:linear-gradient(180deg,#1d3354,#0b1b2e);color:#fff;box-shadow:0 0 0 1px rgba(201,166,106,.55),0 10px 22px rgba(11,27,46,.18)}
.ad-addendum .ad-actions .ad-reject{border:1px solid #d9b4ae;background:#fff;color:var(--ad-bad);box-shadow:none}
@media (max-width:760px){.ad-table-wrap .ad-table.ad-table-compact{min-width:0}.ad-table-compact th,.ad-table-compact td{white-space:normal}.ad-table-compact td.ad-num{white-space:nowrap}}
@media (max-width:640px){.ad-addendum{padding:16px}.ad-addendum-head{flex-direction:column}.ad-addendum .ad-actions-row{grid-template-columns:1fr}}
.ad-related{margin:5mm 0 0;text-align:center}
.ad-foot{display:grid;grid-template-columns:1.2fr 1.4fr 1fr;gap:6mm;margin-top:9mm;padding-top:4mm;border-top:.2mm solid var(--ad-line);font-size:7pt;line-height:1.5;color:var(--ad-muted);break-inside:avoid}
.ad-foot strong{display:block;margin-bottom:.8mm;font-size:6.4pt;letter-spacing:.18em;text-transform:uppercase;color:var(--ad-ink)}
.ad-foot div{min-width:0;overflow-wrap:anywhere;white-space:pre-line}
.ad-foot .ad-right{text-align:right}
.ad-foot .ad-foot-note{grid-column:1/-1;margin:0;padding-top:2.4mm;border-top:.2mm dashed var(--ad-line-2);font-size:6.8pt;line-height:1.5;color:var(--ad-soft);white-space:pre-line}
.ad-bank{display:grid;grid-template-columns:repeat(auto-fit,minmax(38mm,1fr));border:.2mm solid var(--ad-line);border-radius:2.4mm;background:var(--ad-cream);overflow:hidden;break-inside:avoid;page-break-inside:avoid}
.ad-bank>div{min-width:0;padding:2.8mm 4mm;border-left:.2mm solid var(--ad-line)}
.ad-bank>div:first-child{border-left:0}
.ad-bank small{display:block;font-size:6.2pt;letter-spacing:.16em;text-transform:uppercase;color:var(--ad-soft);font-weight:700}
.ad-bank strong{display:block;margin-top:.8mm;font-size:8.6pt;font-weight:700;line-height:1.35;color:var(--ad-ink);overflow-wrap:anywhere}
.ad-bank-iban{grid-column:span 2}
.ad-bank-iban strong{font-family:var(--ad-mono);font-size:8.8pt;letter-spacing:.04em;white-space:nowrap;overflow-wrap:normal}
.ad-confidential{margin-top:3mm;text-align:center;font-size:6.6pt;letter-spacing:.12em;text-transform:uppercase;color:var(--ad-soft)}
.ad-form{margin:7mm 0 0;padding:6mm;border:.3mm solid var(--ad-brand);border-radius:3mm;background:linear-gradient(180deg,#fffdf9,#faf6ee);box-shadow:0 12px 30px rgba(11,27,46,.08)}
.ad-form-head h3{margin:1.2mm 0 1mm;font-size:13pt;color:var(--ad-ink)}
.ad-form-head p{margin:0 0 4mm;font-size:8.4pt;color:var(--ad-muted)}
.ad-field{display:block;margin:0 0 4mm;font-size:9pt;font-weight:700;color:var(--ad-ink)}
.ad-field input{display:block;width:100%;margin-top:2mm;padding:11px 12px;border:1px solid #d6ccba;border-radius:9px;font:500 15px/1.3 var(--ad-font);color:var(--ad-ink);background:#fff}
.ad-field input:focus{outline:2px solid var(--ad-brand);outline-offset:1px;border-color:var(--ad-brand)}
.ad-signature-field{margin:0 0 4mm}
.ad-signature-head{display:flex;align-items:center;justify-content:space-between;margin:0 0 2mm;font-size:9pt}
.ad-signature-head strong{color:var(--ad-ink)}
.ad-signature-head button{border:1px solid #d6ccba;background:#fff;color:var(--ad-text);font:600 12px/1 var(--ad-font);padding:8px 12px;border-radius:8px;cursor:pointer}
.ad-signature-canvas{display:block;width:100%;height:40mm;border:1.5px dashed #cdbf9f;border-radius:10px;background:repeating-linear-gradient(-45deg,#fffdf9,#fffdf9 10px,#f8f3ea 10px,#f8f3ea 20px);cursor:crosshair;touch-action:none}
.ad-signature-field small{display:block;margin-top:2mm;font-size:8pt;color:var(--ad-muted)}
.ad-consent-set{margin:0 0 4mm;padding:0;border:0}
.ad-consent-set legend{margin-bottom:2mm;font-size:9pt;font-weight:700;color:var(--ad-ink)}
.ad-check{display:flex;align-items:flex-start;gap:10px;margin:0 0 2.6mm;padding:10px 12px;border:1px solid var(--ad-line);border-radius:9px;background:#fff;cursor:pointer}
.ad-check input{margin-top:2px;width:18px;height:18px;flex:none;accent-color:#0b1b2e}
.ad-check span{font-size:8.6pt;line-height:1.5;color:var(--ad-text)}
.ad-check b{color:var(--ad-ink)}
.ad-check-optional{border-style:dashed}
.ad-form-error{margin:0 0 4mm;padding:2.6mm 3mm;border-radius:7px;background:var(--ad-bad-bg);color:var(--ad-bad);font-size:9pt;font-weight:700}
.ad-form-legal{margin:0 0 4mm;font-size:7.6pt;line-height:1.55;color:var(--ad-muted)}
.ad-form button[type=submit]{display:block;width:100%;min-height:50px;border:0;border-radius:10px;background:linear-gradient(180deg,#1d3354,#0b1b2e);box-shadow:0 0 0 1px rgba(201,166,106,.55),0 10px 22px rgba(11,27,46,.2);color:#fff;font:700 15px/1 var(--ad-font);letter-spacing:.03em;cursor:pointer}
.ad-printbar{position:sticky;top:0;z-index:5;width:210mm;max-width:100%;margin:0 auto 14px;padding:12px 14px;border-radius:12px;background:rgba(11,27,46,.94);color:#fff;display:flex;align-items:center;gap:12px;flex-wrap:wrap;box-shadow:0 12px 30px rgba(11,27,46,.25)}
.ad-printbar p{margin:0;flex:1 1 260px;font-size:12px;line-height:1.45;color:#d9dfe7}
.ad-printbar p b{color:#fff}
.ad-printbar .ad-btn{min-height:38px}
.ad-printbar .ad-btn:not(.ad-btn-primary){background:transparent;color:#fff;border-color:rgba(255,255,255,.35)}
@media screen{.ad-print-overlay{position:fixed;inset:0;z-index:2147483000;overflow:auto;-webkit-overflow-scrolling:touch}}
@media screen and (max-width:760px){
 .ad-root{padding:12px 0 40px}
 .ad-toolbar,.ad-printbar{margin-left:10px;margin-right:10px;width:auto}
 .ad-sheet{width:100%;min-height:0;padding:22px 18px 28px;font-size:10pt}
 .ad-band{margin:-22px -18px 18px}
 .ad-head{flex-direction:column;gap:14px}
 .ad-head-meta{text-align:left;max-width:none}
 .ad-meta{justify-content:start}.ad-meta dt,.ad-meta dd{text-align:left}
 .ad-grid-2,.ad-sign,.ad-foot{grid-template-columns:1fr}
 .ad-foot .ad-right{text-align:left}
 .ad-bank{grid-template-columns:1fr}
 .ad-bank>div{border-left:0;border-top:.2mm solid var(--ad-line)}
 .ad-bank>div:first-child{border-top:0}
 .ad-bank-iban{grid-column:auto}
 .ad-bank-iban strong{white-space:normal}
 .ad-facts{grid-template-columns:1fr 1fr}
 .ad-fact:nth-child(3){border-left:0}
 .ad-fact:nth-child(n+3){border-top:.2mm solid var(--ad-line)}
 .ad-totals{width:100%}
 .ad-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
 .ad-table-wrap .ad-table{min-width:520px}
 .ad-title h1{font-size:18pt}
 .ad-article p,.ad-article ul,.ad-article ol{font-size:9.6pt;text-align:left}
 .ad-dl{grid-template-columns:28mm minmax(0,1fr);font-size:9pt}
 .ad-actions form{grid-template-columns:1fr}
 .ad-form{padding:16px}
}
@media print{
 html,body{background:#fff!important;margin:0!important;padding:0!important}
 body:has(.ad-root) *:not(:has(.ad-root)):not(.ad-root):not(.ad-root *){display:none!important}
 body:has(.ad-root) *:has(.ad-root){display:block!important;position:static!important;inset:auto!important;margin:0!important;padding:0!important;border:0!important;width:auto!important;max-width:none!important;min-width:0!important;height:auto!important;min-height:0!important;overflow:visible!important;background:#fff!important;box-shadow:none!important;transform:none!important;filter:none!important}
 .ad-root{min-height:0;padding:0!important;background:#fff!important;font-size:9pt}
 .ad-print-overlay{position:static!important;overflow:visible!important}
 .ad-noprint,.print-hide{display:none!important}
 .ad-sheet{width:auto;max-width:none;min-height:0;margin:0;padding:0;box-shadow:none}
 .ad-band{margin:0 0 7mm}
 .ad-root a{color:inherit;text-decoration:none}
 .ad-annex{break-before:page;page-break-before:always;margin-top:0;padding-top:0;border-top:0}
 .ad-sign-block{break-inside:avoid;page-break-inside:avoid}
 .ad-foot{margin-top:7mm}
}
`;
}
