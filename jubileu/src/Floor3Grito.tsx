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
// 80% dela. Fica fora do componente para não ser remontada a cada quadro.
const FORMA = 'polygon(100.0% 50.0%, 88.4% 61.3%, 92.1% 77.0%, 76.2% 80.2%, 70.8% 95.5%, 55.7% 89.6%, 42.9% 99.5%, 33.4% 86.4%, 17.3% 87.8%, 16.3% 71.6%, 2.0% 64.1%, 10.0% 50.0%, 2.0% 35.9%, 16.3% 28.4%, 17.3% 12.2%, 33.4% 13.6%, 42.9% 0.5%, 55.7% 10.4%, 70.8% 4.5%, 76.2% 19.8%, 92.1% 23.0%, 88.4% 38.7%)';

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
        <div style={{ position: 'fixed', top: 74, left: '50%', transform: 'translateX(-50%)',
            zIndex: 70, pointerEvents: 'none', width: 'min(74vw, 520px)',
            fontFamily: "'Luckiest Guy', system-ui, sans-serif" }}>
            <style>{`
                @keyframes f3-grito-entra { 0%{transform:scale(0.3) rotate(-8deg);opacity:0}
                    60%{transform:scale(1.12) rotate(3deg);opacity:1} 100%{transform:scale(1) rotate(-1.2deg);opacity:1} }
                @keyframes f3-grito-treme { 0%{transform:rotate(-1.2deg) scale(1)} 33%{transform:rotate(0.9deg) scale(1.012)}
                    66%{transform:rotate(-0.5deg) scale(0.995)} 100%{transform:rotate(-1.2deg) scale(1)} }
            `}</style>
            <div key={serie} style={{ animation: 'f3-grito-entra .32s cubic-bezier(.2,1.5,.4,1) both' }}>
                <div style={{ position: 'relative', animation: 'f3-grito-treme .375s steps(1,end) infinite' }}>
                    <div style={{ position: 'absolute', inset: 'min(-0.85vw,-7px)', background: INK, clipPath: FORMA }} />
                    <div style={{ position: 'relative', background: PAPEL, color: INK, clipPath: FORMA,
                        padding: 'min(4.6vw,38px) min(6.4vw,58px)',
                        fontSize: 'min(3.2vw,19px)', lineHeight: 1.15, textAlign: 'center', letterSpacing: '.02em' }}>
                        {texto}
                    </div>
                </div>
            </div>
        </div>
    );
}
