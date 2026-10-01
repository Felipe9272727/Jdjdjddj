/**
 * f13Selos.tsx — Os três selos das pistas, no canto de cima do HUD do Andar 13.
 *
 * Substitui a linha "? Ache a casa certa · 0/3 pistas". Em vez de um contador,
 * três selos de cera na ordem fixa (latão, fumaça, botão):
 *   - vazio: círculo tracejado de marrom claro com um "?" apagado;
 *   - conquistado: lacre vermelho de cera (#7a2f1f) com o desenho da pista
 *     gravado em ouro (#c9a13a), sem emoji nenhum — só traço de SVG.
 *
 * Quando um selo fica novo ele "carimba": entra grande e torto (escala 1.6),
 * bate no lugar e solta um clarao — 450 ms, só CSS (transform/opacity). Quem
 * compara é o React: as pistas do render anterior ficam guardadas num useRef, e
 * SÓ o selo que apareceu agora ganha o carimbo. Na primeira renderização não há
 * "anterior" conhecido, então nada anima (o HUD não pode explodir em animação
 * só porque abriu com pistas já achadas).
 *
 * O componente não conhece o mundo: o pai entrega o conjunto de pistas.
 * Sem estado global, sem WebGL, sem biblioteca nova.
 *
 * Props de `SelosDasPistas` (named export):
 *   - `pistas`: ReadonlySet<Pista> — as pistas já conquistadas (o tipo `Pista`
 *     e a tabela `PISTAS` vêm de './f13Lore');
 *   - `retrato`: boolean — selo de 26px (em paisagem, 30px);
 *   - `aberto`: boolean — mostra embaixo o nome curto de cada pista achada
 *     (`PISTAS[p].nome`); sem ele, só os selos.
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { PISTAS } from './f13Lore';
import type { Pista } from './f13Lore';

/** A ordem fixa da tira, da esquerda para a direita. */
const ORDEM: ReadonlyArray<Pista> = ['latao', 'fumaca', 'botao'];

/** O ouro com que cada pista é gravada dentro do lacre. */
const OURO = '#c9a13a';

/** A duração do carimbo, em milissegundos (bate com os @keyframes). */
const CARIMBO_MS = 450;

/** As props de `SelosDasPistas`. */
export interface PropsSelosDasPistas {
    /** As pistas já conquistadas pelo hóspede (tipo `Pista`, de './f13Lore'). */
    pistas: ReadonlySet<Pista>;
    /** Tela em retrato? Selo de 26px (em paisagem, 30px). */
    retrato: boolean;
    /** Mostrar o nome curto de cada pista conquistada embaixo dos selos? */
    aberto: boolean;
}

/** Quantas vezes cada selo já carimbou nesta montagem (ausente = nenhuma). */
type Carimbos = Partial<Record<Pista, number>>;

/**
 * A "assinatura" das pistas conquistadas neste render: "latao,fumaca".
 *
 * É uma string e não um Set de propósito: comparar strings é à prova de pai
 * descuidado. Se o pai mutar o mesmo Set no lugar (ou criar um Set novo com o
 * mesmo conteúdo a cada render), a assinatura continua igual — e o efeito sabe
 * exatamente o que mudou de verdade.
 */
function assinaturaDe(pistas: ReadonlySet<Pista>): string {
    return ORDEM.filter((p) => pistas.has(p)).join(',');
}

/** Volta da assinatura para as pistas conquistadas, na ordem da tira. */
function pistasDaAssinatura(assinatura: string): ReadonlyArray<Pista> {
    if (assinatura === '') return [];
    const ids = assinatura.split(',');
    return ORDEM.filter((p) => ids.includes(p));
}

/** O nome curto da pista, à prova de ficha faltando na tabela. */
function nomeDaPista(p: Pista): string {
    return PISTAS[p]?.nome ?? p;
}

export function SelosDasPistas({
    pistas,
    retrato,
    aberto,
}: PropsSelosDasPistas): ReactElement {
    const assinatura = assinaturaDe(pistas);
    const conquistadas = pistasDaAssinatura(assinatura);
    const quantas = conquistadas.length;
    const completa = quantas === ORDEM.length;

    /**
     * A assinatura do render anterior. Começa `null` de propósito: sem anterior
     * conhecido, nada carimba.
     */
    const anteriores = useRef<string | null>(null);

    /**
     * O contador de carimbos por pista. Ele entra na `key` do selo: quando sobe,
     * o React remonta aquele selo e a animação CSS começa do zero — sem timers,
     * sem estado preso e sem reiniciar os outros dois.
     */
    const [carimbos, setCarimbos] = useState<Carimbos>({});

    useEffect(() => {
        const antes = anteriores.current;
        // Registra já o retrato deste render (mesmo na primeira vez).
        anteriores.current = assinatura;

        // Primeira renderização: registra e sai calado.
        if (antes === null || antes === assinatura) return;

        const idsAntes = antes === '' ? [] : antes.split(',');
        const idsAgora = assinatura === '' ? [] : assinatura.split(',');

        // Só o que entrou agora (não estava antes e está agora) merece carimbo.
        const novas = ORDEM.filter((p) => idsAgora.includes(p) && !idsAntes.includes(p));
        if (novas.length === 0) return;

        setCarimbos((atual) => {
            const proximo: Carimbos = { ...atual };
            for (const p of novas) proximo[p] = (proximo[p] ?? 0) + 1;
            return proximo;
        });
    }, [assinatura]);

    const tamanho = retrato ? 26 : 30;
    const titulo = completa ? 'Casa certa achada' : 'Ache a casa certa';
    const rotulo = completa
        ? `${titulo}: as três pistas achadas, ${quantas} de 3`
        : `${titulo}: ${quantas} de 3 pistas`;

    return (
        <section className="f13selos" aria-label={rotulo}>
            <style>{CSS_DOS_SELOS}</style>

            <div className="f13selos-titulo">
                <span className="f13selos-marca" aria-hidden="true">{completa ? "ᚨ" : "?"}</span>
                <span className="f13selos-titulo-texto">{titulo}</span>
            </div>

            <div className="f13selos-linha">
                {ORDEM.map((p) => {
                    const conquistada = pistas.has(p);
                    const carimbo = carimbos[p] ?? 0;
                    const carimba = conquistada && carimbo > 0;

                    const classes = ['f13selo', conquistada ? 'f13selo-cheio' : 'f13selo-vazio'];
                    if (carimba) classes.push('f13selo-carimba');

                    return (
                        <span
                            key={`${p}-${carimbo}`}
                            className={classes.join(' ')}
                            style={{ width: tamanho, height: tamanho }}
                            role="img"
                            aria-label={
                                conquistada
                                    ? `${nomeDaPista(p)}, pista conquistada`
                                    : 'Selo vazio: pista ainda não achada'
                            }
                        >
                            {conquistada ? (
                                <DesenhoDaPista pista={p} />
                            ) : (
                                <span
                                    className="f13selo-questao"
                                    style={{ fontSize: Math.round(tamanho * 0.55) }}
                                    aria-hidden="true"
                                >
                                    ?
                                </span>
                            )}
                            {carimba && <span className="f13selo-clarao" aria-hidden="true" />}
                        </span>
                    );
                })}
            </div>

            {aberto && quantas > 0 && (
                <ul className="f13selos-nomes">
                    {conquistadas.map((p) => (
                        <li key={p} className="f13selo-nome">
                            {nomeDaPista(p)}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

/** O traço comum a todos os desenhos: só linha de ouro, sem preenchimento. */
const TRACO = {
    fill: 'none',
    stroke: OURO,
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
} as const;

/** O desenho de cada pista. Sem emoji: só traço, dentro do viewBox 24×24. */
const DESENHOS: Readonly<Record<Pista, ReactNode>> = {
    // A porta de latão: vão em arco, batente no chão e argola.
    latao: (
        <g {...TRACO}>
            <path d="M7 20V10.8a5 5 0 0 1 10 0V20" />
            <path d="M5.4 20h13.2" />
            <circle cx="14.2" cy="15" r="1.6" />
        </g>
    ),
    // A chaminé fria: cano tampado e, no lugar da fumaça, um floco de neve.
    fumaca: (
        <g {...TRACO}>
            <path d="M5.6 20V9.6h6V20" />
            <path d="M4.3 9.6h8.6" />
            <path d="M3.6 20h10" />
            <path d="M16.6 4.2v6" />
            <path d="M14.1 5.7l5 2.9" />
            <path d="M14.1 8.6l5-2.9" />
        </g>
    ),
    // O botão na parede: o disco e as duas ondas do "ding".
    botao: (
        <g {...TRACO}>
            <circle cx="8.6" cy="13" r="3.3" />
            <path d="M12.9 10.5a3.2 3.2 0 0 1 0 5" />
            <path d="M15.4 7.9a6.4 6.4 0 0 1 0 10.2" />
        </g>
    ),
};

function DesenhoDaPista({ pista }: { pista: Pista }): ReactElement {
    return (
        <svg
            className="f13selo-desenho"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
        >
            {DESENHOS[pista]}
        </svg>
    );
}

/** Pergaminho, lacre e carimbo. Tudo prefixado com f13selo. */
const CSS_DOS_SELOS = `
.f13selos {
  display: flex;
  flex-direction: column;
  gap: 5px;
  box-sizing: border-box;
  max-width: 100%;
  /* mora dentro do cartão do HUD: sem moldura própria (era borda dentro de borda) */
  padding: 1px 0 3px;
  color: #2a1d14;
  font-family: Georgia, 'Times New Roman', serif;
  pointer-events: none;
  user-select: none;
  -webkit-user-select: none;
}

.f13selos-titulo {
  display: flex;
  align-items: baseline;
  gap: 5px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: 0.2px;
  text-shadow: 0 1px 0 rgba(255, 252, 240, 0.7);
}

.f13selos-marca {
  color: #7a2f1f;
  font-size: 13px;
  line-height: 1;
}

.f13selos-linha {
  display: flex;
  align-items: center;
  gap: 7px;
}

.f13selo {
  position: relative;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border-radius: 50%;
  transform-origin: 50% 55%;
}

/* Vazio: círculo tracejado de marrom claro, com o "?" apagado. */
.f13selo-vazio {
  border: 1.5px dashed rgba(146, 116, 78, 0.85);
  background: radial-gradient(circle at 38% 32%, rgba(255, 252, 240, 0.75), rgba(42, 29, 20, 0.07) 72%);
  color: rgba(42, 29, 20, 0.3);
}

.f13selo-questao {
  font-size: 15px;
  font-weight: 700;
  line-height: 1;
}

/* Conquistado: lacre de cera vermelha, com a borda levemente irregular. */
.f13selo-cheio {
  border: 1px solid rgba(84, 30, 18, 0.9);
  border-radius: 47% 53% 52% 48% / 51% 48% 52% 49%;
  background: radial-gradient(circle at 36% 30%, #b0503a 0%, #8b3524 34%, #7a2f1f 58%, #4f1c12 100%);
  box-shadow:
    inset 0 1.5px 2px rgba(255, 214, 170, 0.4),
    inset 0 -2px 3px rgba(38, 10, 4, 0.6),
    0 1px 2px rgba(42, 29, 20, 0.45);
}

.f13selo-desenho {
  display: block;
  width: 64%;
  height: 64%;
  filter: drop-shadow(0 1px 0 rgba(48, 14, 6, 0.65));
}

/* O clarao do carimbo, atrás do lacre. */
.f13selo-clarao {
  position: absolute;
  inset: -40%;
  border-radius: 50%;
  pointer-events: none;
  will-change: transform, opacity;
  background: radial-gradient(circle, rgba(255, 250, 226, 0.95) 0%, rgba(255, 226, 156, 0.55) 42%, rgba(255, 226, 156, 0) 70%);
  animation: f13selo-clarao ${CARIMBO_MS}ms ease-out both;
}

/* O carimbo: entra grande e torto, bate no lugar e assenta. */
.f13selo-carimba {
  will-change: transform, opacity;
  animation: f13selo-carimbo ${CARIMBO_MS}ms cubic-bezier(0.22, 0.9, 0.3, 1.12) both;
}

@keyframes f13selo-carimbo {
  0%   { transform: scale(1.6) rotate(-15deg); opacity: 0.25; }
  45%  { transform: scale(0.9) rotate(5deg);   opacity: 1; }
  68%  { transform: scale(1.08) rotate(-2deg); }
  100% { transform: scale(1) rotate(0deg);     opacity: 1; }
}

@keyframes f13selo-clarao {
  0%   { opacity: 1;    transform: scale(0.35); }
  55%  { opacity: 0.45; transform: scale(1.35); }
  100% { opacity: 0;    transform: scale(2); }
}

/* Só aparecem com o HUD aberto: o nome curto de cada pista conquistada. */
.f13selos-nomes {
  display: flex;
  flex-wrap: wrap;
  gap: 1px 7px;
  margin: 1px 0 0;
  padding: 0;
  list-style: none;
}

.f13selo-nome {
  font-size: 11.5px;
  line-height: 1.25;
  color: #2a1d14;
  opacity: 0.88;
}

.f13selo-nome::before {
  content: '\\00b7';
  margin-right: 4px;
  color: #c9a13a;
  font-weight: 700;
}

@media (prefers-reduced-motion: reduce) {
  .f13selo-carimba { animation: none; }
  .f13selo-clarao { animation: none; opacity: 0; }
}
`;
