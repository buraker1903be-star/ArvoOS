export const CONFIDENTIALITY_AGREEMENT_VERSION = "2026.1";

export const CONFIDENTIALITY_AGREEMENT_TEXT = `PERSONEL GİZLİLİK VE SIR SAKLAMA SÖZLEŞMESİ

1. Amaç ve kapsam
Bu sözleşme; çalışanın görevi sırasında öğrendiği kurumsal, ticari, teknik, mali ve kişisel bilgilerin korunmasına ilişkin esasları düzenler.

2. Gizli bilgi
Müşteri ve personel bilgileri, fiyatlar, teklifler, sözleşmeler, iş planları, yazılım ve kaynak kodları, erişim bilgileri, raporlar, belgeler, yöntemler ve kamuya açık olmayan her türlü bilgi gizli bilgidir.

3. Çalışanın yükümlülükleri
Çalışan gizli bilgileri yalnızca görevinin gerektirdiği ölçüde kullanmayı; yetkisiz kişilerle paylaşmamayı; kopyalamamayı, kişisel cihaz veya hesaplara aktarmamayı ve bilgi güvenliği kurallarına uymayı kabul eder.

4. Kişisel veriler ve bilgi güvenliği
Çalışan, kişisel verileri yalnızca verilen yetki ve talimatlar kapsamında işler. Şifreleri paylaşmaz; şüpheli erişim, veri kaybı veya ihlal ihtimalini gecikmeden yöneticisine bildirir.

5. Fikri haklar
Görev kapsamında hazırlanan çalışma, belge, tasarım, yazılım, veri ve benzeri çıktılar üzerindeki haklar, yürürlükteki mevzuat ve taraflar arasındaki iş ilişkisi hükümleri çerçevesinde kuruma aittir.

6. İade ve silme
Görev veya iş ilişkisi sona erdiğinde çalışan, kuruma ait tüm fiziksel ve dijital varlıkları iade eder; yetkisiz kopyaları siler ve erişim araçlarını kullanmayı bırakır.

7. Süre
Gizlilik yükümlülüğü iş ilişkisi boyunca ve gizli bilgi niteliği devam ettiği sürece iş ilişkisinin sona ermesinden sonra da geçerlidir.

8. İhlal
Bu yükümlülüklerin ihlali halinde kurum, yürürlükteki mevzuattan doğan disiplin, tazminat ve diğer yasal haklarını kullanabilir.

9. Elektronik onay
Çalışan; sözleşmenin tamamını okuduğunu, anladığını ve elektronik imzasıyla özgür iradesiyle kabul ettiğini beyan eder.`;

export function confidentialityAgreementNumber(employeeId: string) {
  return `GIZ-${new Date().getFullYear()}-${employeeId.replaceAll("-", "").slice(0, 10).toUpperCase()}`;
}
