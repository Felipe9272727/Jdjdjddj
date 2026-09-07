/**
 * Floor3Grito.tsx — o BALÃO DE GRITO do Diabrete durante a escalada.
 *
 * Balão de GRITO, não de fala: pontas de estrela, porque ele está lá em cima,
 * longe, berrando. É assim que uma revista desenha voz que vem de fora do
 * quadro. O de conversa (a súplica, na cutscene da queda) é redondo — os dois
 * são a mesma boca em situações diferentes.
 *
 * O contorno é o truque de sempre: a mesma forma recortada duas vezes, a de trás
 * em tinta e um pouco maior. E ele TREME em degraus de 8 Hz, como o balão da
 * súplica e como os espinhos do andar — a mesma mão desenhou os três.
 *
 * Mora em arquivo próprio porque assim a bancada consegue fotografá-lo: para
 * vê-lo dentro do jogo seria preciso atravessar a intro e a apresentação do
 * Diabrete, e nesta caixa (SwiftShader, ~2 fps) isso passa de oito minutos. Com
 * o componente separado, `?f3preview&grito=…` desenha O MESMO componente que o
 * jogo usa, em dois segundos. Preview que renderiza uma cópia mentiria; esta
 * renderiza o original.
 */

// A estrela, calculada uma vez: vinte e dois pontos alternando entre a borda e
// 88,5% dela. Fica fora do componente para não ser remontada a cada quadro.
//
// AS PONTAS ERAM FUNDAS DEMAIS (80%), e ponta funda come área: o texto tinha de
// se afastar tanto da borda que o balão precisava ser enorme para caber duas
// linhas. Mais rasa, a estrela continua lendo como grito e devolve o miolo.
const FORMA = 'polygon(100.0% 50.0%, 92.5% 62.5%, 92.1% 77.0%, 79.0% 83.4%, 70.8% 95.5%, 56.3% 93.8%, 42.9% 99.5%, 31.6% 90.3%, 17.3% 87.8%, 12.8% 73.9%, 2.0% 64.1%, 5.8% 50.0%, 2.0% 35.9%, 12.8% 26.1%, 17.3% 12.2%, 31.6% 9.7%, 42.9% 0.5%, 56.3% 6.2%, 70.8% 4.5%, 79.0% 16.6%, 92.1% 23.0%, 92.5% 37.5%)';

const INK = '#140c08';
const PAPEL = '#f6efe0';

interface Props {
    texto: string;
    /** Sobe a cada fala nova; é o que reinicia a animação de entrada. */
    serie: number;
}

export default function Floor3Grito({ texto, serie }: Props) {
    if (!texto) return null;
    return (
        // ── ELE FALA DO CANTO, NÃO DO MEIO DA TELA ──────────────────────
        // No celular do dono do jogo este balão estava tomando METADE DA TELA:
        // 74vw de largura, enchimento de 38 por 58, e as pontas da estrela
        // comendo mais área ainda. Sentado no topo-centro, ele ainda brigava com
        // o contador de PINCÉIS e ficava bem em cima da linha de visão de quem
        // está pulando de plataforma em plataforma — que é a única coisa que o
        // jogador precisa enxergar.
        //
        // Vai para o canto de cima à esquerda e encolhe: o meio da tela é de
        // quem joga, o canto de baixo à direita é do botão de PULAR, o topo-
        // centro é do contador. Sobra este canto, e ele basta — a fala é curta.
        <div style={{ position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
            left: 'calc(env(safe-area-inset-left, 0px) + 10px)',
            zIndex: 70, pointerEvents: 'none', width: 'min(42vw, 300px)',
            fontFamily: "'Luckiest Guy', system-ui, sans-serif" }}>
            <style>{`
                @keyframes f3-grito-entra { 0%{transform:scale(0.3) rotate(-8deg);opacity:0}
                    60%{transform:scale(1.12) rotate(3deg);opacity:1} 100%{transform:scale(1) rotate(-1.2deg);opacity:1} }
                @keyframes f3-grito-treme { 0%{transform:rotate(-1.2deg) scale(1)} 33%{transform:rotate(0.9deg) scale(1.012)}
                    66%{transform:rotate(-0.5deg) scale(0.995)} 100%{transform:rotate(-1.2deg) scale(1)} }
            `}</style>
            <div key={serie} style={{ animation: 'f3-grito-entra .32s cubic-bezier(.2,1.5,.4,1) both' }}>
                <div style={{ position: 'relative', animation: 'f3-grito-treme .375s steps(1,end) infinite' }}>
                    <div style={{ position: 'absolute', inset: 'min(-0.6vw,-5px)', background: INK, clipPath: FORMA }} />
                    <div style={{ position: 'relative', background: PAPEL, color: INK, clipPath: FORMA,
                        padding: 'min(2.6vw,20px) min(3.4vw,26px)',
                        fontSize: 'min(3.4vw,15px)', lineHeight: 1.12, textAlign: 'center', letterSpacing: '.01em' }}>
                        {texto}
                    </div>
                </div>
            </div>
        </div>
    );
}
