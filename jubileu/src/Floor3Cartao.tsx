/**
 * Floor3Cartao.tsx — o CARTÃO de 1930 do Andar 3, em duas variantes.
 *
 * `placa` — o cartão de título da abertura, pousado sobre a cena e segurado
 *           pelas luvas que já estão ali fazendo "puck… puck!".
 * `tela`  — o cartão de desfecho, que toma a tela inteira quando o andar acaba.
 *
 * ── POR QUE UM SÓ ────────────────────────────────────────────────────────────
 *
 * O andar tinha DOIS vocabulários de cartão. A abertura era papel creme com
 * moldura de tinta; o desfecho da derrota era tela preta com texto vermelho de
 * contorno branco — que é linguagem de "GAME OVER" de arcade, não de curta de
 * 1930. E o desfecho da VITÓRIA não tinha cartão nenhum: quem ganhava ia direto
 * para o elevador, sem uma linha sequer sobre o que tinha acabado de fazer. O
 * caminho premiado era o único sem remate.
 *
 * Agora os três são o mesmo objeto: papel, moldura dupla, losango nos cantos e a
 * estrutura de três linhas que todo curta tinha. O andar abre e fecha com a
 * mesma coisa na mão, e os dois desfechos ficam comparáveis — que é o que faz
 * uma escolha PARECER uma escolha.
 */

const INK = '#140c08';
const PAPEL = '#f4efe2';
const VERMELHO = '#c0271a';

export interface CartaoProps {
    /** A linha de cima, pequena e espaçada (quem apresenta, ou a premissa). */
    acima: string;
    /** O título, grande. */
    titulo: string;
    /** A linha de baixo, o slogan. */
    abaixo: string;
    variante?: 'placa' | 'tela';
    /** Cor do título — o vermelho do andar por padrão. */
    corDoTitulo?: string;
    /** Segura o título fora do ar (a abertura o faz estalar depois, no "tá-dá"). */
    mostraTitulo?: boolean;
}

export default function Floor3Cartao({
    acima, titulo, abaixo, variante = 'tela',
    corDoTitulo = VERMELHO, mostraTitulo = true,
}: CartaoProps) {
    const placa = variante === 'placa';
    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: placa ? 80 : 95, pointerEvents: 'none',
            fontFamily: "'Luckiest Guy', system-ui, sans-serif",
            // O cartão de desfecho escurece o que ficou atrás; o de abertura não,
            // porque as luvas precisam continuar visíveis segurando-o.
            background: placa ? 'transparent' : 'rgba(10,7,18,0.92)',
            animation: placa ? undefined : 'f3cartao-fundo .45s ease-out both',
            display: placa ? undefined : 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            <style>{`
                @keyframes f3cartao-fundo { from{opacity:0} to{opacity:1} }
                @keyframes f3cartao-entra { 0%{transform:scale(0.2) rotate(-14deg);opacity:0}
                    55%{transform:scale(1.06) rotate(3deg);opacity:1}
                    78%{transform:scale(0.97) rotate(-2.4deg)}
                    100%{transform:scale(1) rotate(-1.5deg);opacity:1} }
                @keyframes f3cartao-titulo { 0%{transform:scale(0) rotate(-12deg);} 55%{transform:scale(1.25) rotate(6deg);}
                    75%{transform:scale(0.9) rotate(-3deg);} 100%{transform:scale(1) rotate(-2deg);} }
                @keyframes f3cartao-treme { 0%,100%{transform:rotate(-0.9deg);} 50%{transform:rotate(0.9deg);} }
                @keyframes f3cartao-sobe { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
            `}</style>

            <div style={placa
                // A placa para em 62% da altura: daí para baixo são as luvas, que
                // assim lêem como as mãos que a seguram.
                ? { position: 'absolute', left: '7%', right: '7%', top: '5%', height: '57%',
                    animation: 'f3cartao-entra 0.5s cubic-bezier(.2,1.5,.4,1) both' }
                : { width: 'min(86vw, 900px)', height: 'min(62vh, 460px)',
                    animation: 'f3cartao-entra 0.5s cubic-bezier(.2,1.5,.4,1) both' }}>
                <div style={{
                    width: '100%', height: '100%',
                    animation: 'f3cartao-treme 2.2s ease-in-out infinite',
                    background: PAPEL,
                    // Moldura grossa + filete interno: é a moldura dupla que faz o
                    // papel parecer impresso e não uma caixa de CSS.
                    border: `min(1.1vw,9px) solid ${INK}`,
                    boxShadow: `inset 0 0 0 min(0.35vw,3px) ${PAPEL},
                                inset 0 0 0 min(0.62vw,5px) ${INK},
                                0 min(1.2vw,10px) 0 rgba(20,12,8,0.35)`,
                    borderRadius: 4,
                    // Três faixas fixas, e não um empilhamento centralizado: assim o
                    // cartão sem título ainda lê como um cartão ESPERANDO o título,
                    // e nada se desloca quando ele chega.
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'flex-start',
                    paddingTop: '7%', paddingBottom: '5%',
                    position: 'relative', overflow: 'hidden',
                    backgroundImage: 'repeating-linear-gradient(96deg, rgba(20,12,8,0.035) 0 1px, transparent 1px 4px)',
                }}>
                    {[['6%', '5%'], ['6%', 'auto'], ['auto', '5%'], ['auto', 'auto']].map(([t, l], i) => (
                        <span key={i} style={{
                            position: 'absolute', top: t, left: l,
                            bottom: t === 'auto' ? '6%' : undefined, right: l === 'auto' ? '5%' : undefined,
                            width: 'min(1.4vw,11px)', height: 'min(1.4vw,11px)',
                            background: INK, transform: 'rotate(45deg)',
                        }} />
                    ))}

                    <div style={{
                        fontSize: 'min(2.1vw,15px)', color: INK, letterSpacing: '0.34em',
                        opacity: 0.72, marginBottom: '1.2%', textAlign: 'center', padding: '0 8%',
                        animation: 'f3cartao-sobe .4s ease-out both',
                    }}>
                        {acima}
                    </div>
                    <div style={{ width: 'min(9vw,74px)', height: 'min(0.4vw,3px)', background: INK, opacity: 0.55, marginBottom: '2.4%' }} />

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
                                  alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                        {mostraTitulo && (
                            <div style={{ animation: 'f3cartao-titulo 0.6s cubic-bezier(.2,1.4,.4,1) both', textAlign: 'center', padding: '0 5%' }}>
                                <span style={{
                                    display: 'inline-block',
                                    fontSize: 'min(11vw,96px)', lineHeight: 0.98, color: corDoTitulo,
                                    WebkitTextStroke: `min(0.85vw,7px) ${INK}`, paintOrder: 'stroke',
                                    letterSpacing: '0.04em', textShadow: `0 min(0.7vw,6px) 0 ${INK}`,
                                }}>{titulo}</span>
                                <div style={{
                                    marginTop: '4%', fontSize: 'min(3.2vw,21px)', color: INK,
                                    letterSpacing: '0.2em',
                                }}>
                                    {abaixo}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
