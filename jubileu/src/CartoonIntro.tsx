/**
 * CartoonIntro.tsx — o CARTÃO DE TÍTULO do Andar 3.
 *
 * O trabalho pesado (a íris creme, as luvas de borracha fazendo "puck… puck!" e
 * todos os efeitos) acontece em 3D dentro do Canvas (CartoonIntro3D.tsx). Esta
 * camada de DOM é o cartão por cima, guiada pelo `stage` que a linha do tempo 3D
 * empurra para cá — assim os dois andam em compasso. A intro NÃO pode ser
 * pulada: ela toca até o fim e se dispensa sozinha, e esta camada nunca captura
 * clique (`pointer-events: none`).
 *
 * ── POR QUE ISTO FOI REFEITO ─────────────────────────────────────────────────
 *
 * A primeira versão era um TEXTO, não um cartão: "ANDAR 3" em vermelho, a 12% do
 * topo, solto no meio da tela. Na bancada, rodando o jogo de verdade, o que se
 * via era aquele texto pousado no VÃO DA PORTA do elevador — competindo com o
 * batente, com a parede e com o painel — e a linha de baixo cortada ao meio
 * pelas luvas. Não anunciava nada. Era uma legenda em cima de uma sala
 * realista, e a piada da intro é justamente que o mundo VIRA desenho.
 *
 * Um cartão de 1930 é um objeto: papel creme, moldura de tinta grossa, filete
 * interno, ornamento de canto, e a estrutura de três linhas que todo curta tinha
 * — quem apresenta, o título, e o slogan. É isso agora. E ele fica logo acima
 * das luvas, que passam a ler como as MÃOS QUE SEGURAM o cartão: elas já estavam
 * lá, eu só não estava usando.
 *
 * O tempo vem dos beats que o áudio já tocava: o cartão entra no "boing"
 * (stage 3) ainda em branco, e o título ESTALA no "tá-dá" (stage 4). Meio
 * segundo entre um e outro — o tempo de uma piada.
 */

interface Props {
    stage: number;       // coreografia vinda do CartoonIntro3D (3 = cartão, 4 = título, 5 = saindo)
}

const INK = '#140c08';
const PAPEL = '#f4efe2';
const VERMELHO = '#c0271a';

export default function CartoonIntro({ stage }: Props) {
    const mostraCartao = stage >= 3 && stage < 5;
    const mostraTitulo = stage >= 4 && stage < 5;

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 80, pointerEvents: 'none',
                background: 'transparent',
                fontFamily: "'Luckiest Guy', system-ui, sans-serif",
            }}
        >
            <style>{`
                @keyframes ci-cartao { 0%{transform:scale(0.2) rotate(-14deg);opacity:0}
                    55%{transform:scale(1.06) rotate(3deg);opacity:1}
                    78%{transform:scale(0.97) rotate(-2.4deg)}
                    100%{transform:scale(1) rotate(-1.5deg);opacity:1} }
                @keyframes ci-title { 0%{transform:scale(0) rotate(-12deg);} 55%{transform:scale(1.25) rotate(6deg);}
                    75%{transform:scale(0.9) rotate(-3deg);} 100%{transform:scale(1) rotate(-2deg);} }
                @keyframes ci-wobble { 0%,100%{transform:rotate(-0.9deg);} 50%{transform:rotate(0.9deg);} }
                @keyframes ci-sobe { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
            `}</style>

            {mostraCartao && (
                // O cartão para em 62% da altura: daí para baixo são as luvas, que
                // assim passam a ler como as mãos que o seguram.
                <div style={{
                    position: 'absolute', left: '7%', right: '7%', top: '5%', height: '57%',
                    animation: 'ci-cartao 0.5s cubic-bezier(.2,1.5,.4,1) both',
                }}>
                    <div style={{
                        width: '100%', height: '100%',
                        animation: 'ci-wobble 2.2s ease-in-out infinite',
                        background: PAPEL,
                        // Moldura grossa + filete interno: a moldura dupla é o que
                        // faz o papel parecer impresso e não uma caixa de CSS.
                        border: `min(1.1vw,9px) solid ${INK}`,
                        boxShadow: `inset 0 0 0 min(0.35vw,3px) ${PAPEL},
                                    inset 0 0 0 min(0.62vw,5px) ${INK},
                                    0 min(1.2vw,10px) 0 rgba(20,12,8,0.35)`,
                        borderRadius: 4,
                        // TRÊS FAIXAS FIXAS, e não um empilhamento centralizado.
                        // Com `justifyContent: center` o cartão em branco (o meio
                        // segundo entre o "boing" e o "tá-dá") punha a linha de
                        // cima no meio de um retângulo vazio, e quando o título
                        // estalava tudo pulava de lugar. Agora o cabeçalho mora no
                        // topo e o título tem a sua faixa reservada: o cartão em
                        // branco lê como um cartão ESPERANDO o título, que é a
                        // piada, e nada se desloca quando ele chega.
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'flex-start',
                        paddingTop: '7%', paddingBottom: '5%',
                        position: 'relative', overflow: 'hidden',
                        // Grão de papel: riscos finos, quase invisíveis, que tiram o
                        // chapado do creme.
                        backgroundImage: `repeating-linear-gradient(96deg, rgba(20,12,8,0.035) 0 1px, transparent 1px 4px)`,
                    }}>
                        {/* ornamento de canto — quatro losangos de tinta */}
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
                            opacity: 0.72, marginBottom: '1.2%',
                            animation: 'ci-sobe .4s ease-out both',
                        }}>
                            LIMINAL SYSTEMS APRESENTA
                        </div>

                        {/* filete curto de separação */}
                        <div style={{ width: 'min(9vw,74px)', height: 'min(0.4vw,3px)', background: INK, opacity: 0.55, marginBottom: '2.4%' }} />

                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
                                      alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                        {mostraTitulo && (
                            <div style={{ animation: 'ci-title 0.6s cubic-bezier(.2,1.4,.4,1) both', textAlign: 'center' }}>
                                <span style={{
                                    display: 'inline-block',
                                    fontSize: 'min(14.5vw,118px)', lineHeight: 0.98, color: VERMELHO,
                                    WebkitTextStroke: `min(0.85vw,7px) ${INK}`, paintOrder: 'stroke',
                                    letterSpacing: '0.04em', textShadow: `0 min(0.7vw,6px) 0 ${INK}`,
                                }}>ANDAR&nbsp;3</span>
                                <div style={{
                                    marginTop: '3%', fontSize: 'min(3.4vw,22px)', color: INK,
                                    letterSpacing: '0.2em',
                                }}>
                                    ✦ AND NOW… IN GLORIOUS CARTOON ✦
                                </div>
                            </div>
                        )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
