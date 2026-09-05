// ── A FAIXA DA NÉVOA DO ANDAR 3 ──────────────────────────────────────────────
//
// A névoa do andar era fixa em 60 → 240 enquanto o `far` da câmera do jogo é
// 40, 80 ou 120 conforme a qualidade escolhida no menu. Na qualidade baixa ela
// nem começava antes do plano de corte (60 > 40): a escadaria infinita sumia de
// uma vez, com uma borda dura, em vez de se dissolver no céu. Na alta chegava a
// um terço da opacidade no corte — ainda um pulo visível.
//
// Isto mora num arquivo próprio (e não dentro do Floor3.tsx) porque é uma
// conta, e uma conta pode ser conferida contra os `far` que o menu realmente
// oferece — que é o que o teste faz.
export const NEVOA_INICIO = 0.45;   // fração do `far` onde a dissolução começa
export const NEVOA_FIM    = 0.97;   // ...e onde ela fecha, logo antes do corte

export function faixaDaNevoa(far: number): { near: number; far: number } {
    const alcance = far > 0 ? far : 120;
    return { near: alcance * NEVOA_INICIO, far: alcance * NEVOA_FIM };
}
