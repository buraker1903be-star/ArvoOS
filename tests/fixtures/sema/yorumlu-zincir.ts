// Zincirin ORTASINDA noktalı virgüllü yorum. Yorum ayıklanmazsa zincir
// orada kesiliyor ve sonraki süzgeçler hiç denetlenmiyordu.
export async function yorumlu(supabase: any) {
  return supabase
    .from("oturum_kayitlari")
    .select("id")
    /* Bu gerekçe uzun; içinde noktalı virgül var ve zinciri kesiyordu. */
    .eq("yok_boyle_sutun", "x");
}
