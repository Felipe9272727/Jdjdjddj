/**
 * Floor3Balao.tsx — o BALÃO DE FALA do Andar 3, um só para o andar inteiro.
 *
 * ── O ANDAR TINHA DUAS VOZES ─────────────────────────────────────────────────
 *
 * A súplica do Diabrete pendurado ganhou balão desenhado — contorno de tinta
 * grosso, forma torta (os quatro cantos com raios diferentes, que é o que faz
 * parecer traçado à mão e não gerado) e a linha FERVILHANDO em degraus de 8 Hz,
 * o mesmo tremor dos espinhos do andar. O grito durante a escalada ganhou a
 * versão de estrela, porque ele berra de longe.
 *
 * E a APRESENTAÇÃO, que é a primeira coisa que o jogador ouve neste andar,
 * continuava com um retângulo arredondado de canto liso e sombra dura — o balão
 * antigo, de outro jogo. O andar se apresentava com uma voz e terminava com
 * outra.
 *
 * Agora é este componente nos dois lugares. Ele é o balão de CONVERSA (redondo,
 * com rabicho opcional); o de GRITO, com pontas de estrela, é o `Floor3Grito` —
 * são a mesma boca em situações diferentes, e por isso tremem igual.
 *
 * ── TAMANHO ──────────────────────────────────────────────────────────────────
 *
 * O dono do jogo reclamou, com razão, que o balão de grito cobria metade da tela
 * do celular dele. Este aqui é de cutscene (a tela é toda da cena, ninguém está
 * pulando), então pode ser maior — mas não tanto quanto era: `maxWidth` em vw
 * com teto em pixels, e conferido em 900×420, que é celular deitado.
 */

const INK = '#140c08';
const PAPEL = '#f6efe0';

export interface BalaoProps {
    texto: string;
    /** Quem fala: muda a cor da plaquinha e o lado do rabicho. */
    dono: 'diabrete' | 'jogador';
    /** Muda para reiniciar a animação de entrada (índice da fala). */
    serie: number | string;
    /** Rabicho apontando para baixo (o Diabrete pendurado no abismo). */
    rabicho?: 'nenhum' | 'cima' | 'baixo';
    /** Posicionamento; a cutscene põe no alto à direita, a súplica no rodapé. */
    style?: React.CSSProperties;
}

export default function Floor3Balao({
    texto, dono, serie, rabicho = 'nenhum', style,
}: BalaoProps) {
    const doDiabo = dono === 'diabrete';
    return (
        <div key={serie} style={{ position: 'relative', maxWidth: 'min(64vw, 460px)',
            fontFamily: "'Luckiest Guy', system-ui, sans-serif",
            animation: 'f3balao-entra .35s cubic-bezier(.2,1.5,.4,1) both', ...style }}>
            <style>{`
                @keyframes f3balao-entra { 0%{transform:scale(0.4) rotate(-6deg);opacity:0}
                    60%{transform:scale(1.08) rotate(2deg);opacity:1} 100%{transform:scale(1) rotate(-1.2deg);opacity:1} }
                /* O FERVILHAR DO CONTORNO: três desenhos da mesma forma trocados
                   em degraus. Com steps() o navegador NÃO interpola, ele salta —
                   que é a diferença entre tinta e animação de computador. É o
                   mesmo 8 Hz dos espinhos e do balão de grito. */
                @keyframes f3balao-ferve {
                    0%   { border-radius: 33% 40% 36% 44% / 52% 44% 56% 40%; }
                    33%  { border-radius: 41% 34% 44% 36% / 44% 55% 41% 52%; }
                    66%  { border-radius: 36% 43% 38% 41% / 49% 47% 50% 46%; }
                    100% { border-radius: 33% 40% 36% 44% / 52% 44% 56% 40%; }
                }
                @keyframes f3balao-treme { 0%{transform:rotate(-1.1deg)} 33%{transform:rotate(0.5deg)}
                    66%{transform:rotate(-0.4deg)} 100%{transform:rotate(-1.1deg)} }
            `}</style>

            <div style={{
                background: PAPEL, color: INK,
                border: 'min(0.95vw,9px) solid ' + INK,
                padding: 'min(2.4vw,20px) min(4.4vw,38px)',
                fontSize: 'min(3.6vw,21px)', lineHeight: 1.16, textAlign: 'center',
                letterSpacing: '.02em',
                boxShadow: '0 min(0.9vw,7px) 0 rgba(20,12,8,0.4)',
                animation: 'f3balao-ferve 0.375s steps(1,end) infinite, f3balao-treme 0.375s steps(1,end) infinite',
            }}>
                {texto}
            </div>

            {/* O rabicho aponta para quem fala. Ele é feito de dois triângulos —
                o de trás em tinta, o da frente em papel — porque assim ele ganha
                a mesma linha grossa do balão sem precisar de SVG. */}
            {rabicho !== 'nenhum' && (
                <>
                    <div style={{ position: 'absolute', left: '34%',
                        ...(rabicho === 'cima'
                            ? { top: 'min(-3.4vw,-26px)', borderBottom: 'min(3.6vw,28px) solid ' + INK }
                            : { bottom: 'min(-3.4vw,-26px)', borderTop: 'min(3.6vw,28px) solid ' + INK }),
                        width: 0, height: 0,
                        borderLeft: 'min(1.4vw,11px) solid transparent',
                        borderRight: 'min(2.8vw,22px) solid transparent' }} />
                    <div style={{ position: 'absolute', left: 'calc(34% + min(0.7vw,5px))',
                        ...(rabicho === 'cima'
                            ? { top: 'min(-2.0vw,-16px)', borderBottom: 'min(2.6vw,20px) solid ' + PAPEL }
                            : { bottom: 'min(-2.0vw,-16px)', borderTop: 'min(2.6vw,20px) solid ' + PAPEL }),
                        width: 0, height: 0,
                        borderLeft: 'min(1.0vw,8px) solid transparent',
                        borderRight: 'min(2.0vw,16px) solid transparent' }} />
                </>
            )}

            {/* Quem fala, assinado no canto do balão. */}
            <div style={{ position: 'absolute', left: 'min(2.4vw,18px)', bottom: 'min(-1.8vw,-14px)',
                transform: 'rotate(-2.5deg)',
                background: doDiabo ? '#c0271a' : '#2b6fb0', color: '#fff',
                WebkitTextStroke: `2px ${INK}`, paintOrder: 'stroke', padding: '2px 14px',
                fontSize: 'min(2.9vw,17px)', letterSpacing: '.08em',
                border: `min(0.42vw,3px) solid ${INK}`, borderRadius: 5,
                boxShadow: `0 3px 0 ${INK}` }}>
                {doDiabo ? 'O DIABRETE' : 'VOCÊ'}
            </div>
        </div>
    );
}
