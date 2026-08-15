// ── A SALA DO RASCUNHO — a arquitetura fora do jogo ────────────────────────
//
// O pedido: "já faça uma arquitetura pré jogo, pra vermos como pode ficar, e
// qual lida melhor/mais rápido com essa arquitetura".
//
// No jogo esta arquitetura é invisível por construção: o jogador vê "Pensando
// localmente… 142s" e depois uma fala. Se o rascunho foi bom, se o 3B trocou
// uma frase ou três, se o atalho valeu — nada disso aparece. É o mesmo motivo
// por que o `?mente` e o `?campo` existem.
//
// Aqui as quatro etapas ficam abertas, lado a lado:
//
//     1. RASCUNHO ..... o modelo pequeno escreve, e o tempo dele
//     2. FRASES ....... numeradas, exatamente como o revisor as vê
//     3. VEREDITO ..... o que o 3B respondeu, preso na gramática
//     4. COSTURA ...... o que muda e o que sobrevive intacto
//
// E, em cima de cada texto, as provas de alucinação que dão para automatizar.
// O que elas não julgam — se soou como o Nilo — fica na tela, para leitura.
//
// POR QUE ISTO NÃO É A BANCADA
//
// `tools/f10-rascunhador.mjs` roda sozinha e cospe números; serve para comparar
// candidatos em série. Esta página serve para OLHAR uma resposta por vez e
// entender por que o número saiu como saiu — e para o dono do jogo abrir no
// celular dele, que é o aparelho que decide.
import { useCallback, useEffect, useState } from 'react';
import {
    RASCUNHADORES,
    definirRascunhador,
    rascunhadorEscolhido,
    type RascunhadorId,
} from './npc/floor10Rascunhadores';
import {
    aplicarRemendos,
    blocoDeRevisao,
    enumerarFrases,
    lerVeredito,
    remendosQueValem,
    type FraseNumerada,
    type Remendo,
} from './npc/floor10Remendo';
import {
    motivoDaReprovacao,
    provarAlucinacao,
    reprovou,
    type ProvaDeAlucinacao,
} from './npc/floor10Alucinacao';
import { buildFloor10SystemPrompt } from './npc/floor10Canon';
import { rascunharComReflexo, precarregarReflexo, reflexoJaCarregado } from './npc/floor10Reflexo';
import { rascunharComMotor, motorJaCarregado, precarregarMotor } from './npc/floor10MotorBrain';
import { rascunharFala, vontadeJaCarregada, precarregarVontade } from './npc/floor10SmallBrain';
import { npc } from './npc/npcStore';

/** As perguntas vieram das fotos de tela; cada uma cobra uma coisa diferente. */
const PERGUNTAS = [
    'Quem sou eu e pq estou aqui?',
    'Mas essa não foi minha pergunta, eu queria saber quem SOU EU. Estou perdido.',
    'Como você veio parar aqui?',
    'Esse hotel vai acabar?',
    'Tudo bem?',
];

type Etapa = {
    quem: RascunhadorId;
    pergunta: string;
    rascunho: string;
    msRascunho: number;
    frases: FraseNumerada[];
    veredito: string;
    msRevisao: number;
    remendos: Remendo[];
    descartados: number;
    final: string;
    provaRascunho: ProvaDeAlucinacao | null;
    provaFinal: ProvaDeAlucinacao | null;
    erro: string;
};

const VAZIO: Etapa = {
    quem: 'reflexo', pergunta: '', rascunho: '', msRascunho: 0, frases: [],
    veredito: '', msRevisao: 0, remendos: [], descartados: 0, final: '',
    provaRascunho: null, provaFinal: null, erro: '',
};

async function subir(quem: RascunhadorId): Promise<boolean> {
    if (quem === 'reflexo') {
        if (reflexoJaCarregado()) return true;
        return precarregarReflexo();
    }
    if (quem === 'motor') {
        if (motorJaCarregado()) return true;
        return precarregarMotor();
    }
    if (quem === 'vontade') {
        if (vontadeJaCarregada()) return true;
        return precarregarVontade();
    }
    return false;
}

async function rascunhar(
    quem: RascunhadorId,
    systemPrompt: string,
    pergunta: string,
): Promise<string> {
    if (quem === 'reflexo') return rascunharComReflexo(systemPrompt, pergunta);
    const historico = [{ role: 'user', content: pergunta }];
    if (quem === 'motor') return rascunharComMotor(systemPrompt, historico);
    if (quem === 'vontade') return rascunharFala(systemPrompt, historico);
    return '';
}

function Provas({ prova }: { prova: ProvaDeAlucinacao | null }) {
    if (!prova) return null;
    const ruim = reprovou(prova);
    const motivo = motivoDaReprovacao(prova);
    return (
        <div style={{
            marginTop: 6,
            fontSize: 12,
            color: ruim ? '#ff8080' : '#7fd18a',
        }}
        >
            {ruim ? '✕ reprovou' : '✓ passou'}
            {motivo ? ` · ${motivo}` : ''}
        </div>
    );
}

export default function Floor10Rascunho() {
    const [quem, setQuem] = useState<RascunhadorId>(() => rascunhadorEscolhido());
    const [pergunta, setPergunta] = useState(PERGUNTAS[0]);
    const [etapa, setEtapa] = useState<Etapa>(VAZIO);
    const [ocupado, setOcupado] = useState(false);
    const [aviso, setAviso] = useState('');

    useEffect(() => { definirRascunhador(quem); }, [quem]);

    const rodar = useCallback(async () => {
        setOcupado(true);
        setAviso('');
        setEtapa({ ...VAZIO, quem, pergunta });
        try {
            setAviso(`subindo ${quem}…`);
            if (!await subir(quem)) {
                setEtapa((e) => ({ ...e, erro: `não consegui subir o ${quem}` }));
                return;
            }
            // O MESMO prompt que o jogo monta — sem isso a sala mediria outra
            // coisa e o número não valeria para decidir nada.
            const systemPrompt = buildFloor10SystemPrompt(
                pergunta, [], npc.perception, npc.autonomy,
            );

            setAviso('rascunhando…');
            const t0 = performance.now();
            const rascunho = (await rascunhar(quem, systemPrompt, pergunta)).trim();
            const msRascunho = Math.round(performance.now() - t0);
            if (!rascunho) {
                setEtapa((e) => ({ ...e, msRascunho, erro: 'o rascunhador devolveu vazio' }));
                return;
            }
            const frases = enumerarFrases(rascunho);
            const provaRascunho = provarAlucinacao(rascunho, pergunta, '', npc.perception);
            setEtapa((e) => ({ ...e, rascunho, msRascunho, frases, provaRascunho }));

            setAviso(`o 3B está conferindo ${frases.length} frase(s)…`);
            const t1 = performance.now();
            // Importado aqui, e não no topo, porque `wllamaEngine` sobe o motor
            // da fala ao ser tocado — e abrir esta página não pode custar
            // 1,9 GB antes de alguém clicar em nada.
            const eng = await import('./npc/wllamaEngine');
            const veredito = await eng.revisarRascunhoParaBancada(
                systemPrompt, blocoDeRevisao(pergunta, frases),
            );
            const msRevisao = Math.round(performance.now() - t1);
            const lido = lerVeredito(veredito, frases.length);
            const valem = remendosQueValem(frases, lido.remendos);
            const final = aplicarRemendos(frases, valem);
            setEtapa((e) => ({
                ...e,
                veredito: veredito || '(vazio)',
                msRevisao,
                remendos: valem,
                descartados: lido.remendos.length - valem.length,
                final,
                provaFinal: provarAlucinacao(final, pergunta, '', npc.perception),
            }));
        } catch (erro) {
            setEtapa((e) => ({ ...e, erro: erro instanceof Error ? erro.message : String(erro) }));
        } finally {
            setOcupado(false);
            setAviso('');
        }
    }, [quem, pergunta]);

    const total = etapa.msRascunho + etapa.msRevisao;
    const caixa = {
        background: '#141414',
        border: '1px solid #2a2a2a',
        borderRadius: 8,
        padding: 12,
        marginBottom: 12,
    } as const;

    return (
        <div style={{
            fontFamily: 'ui-monospace, monospace',
            background: '#0b0b0b',
            color: '#ddd',
            minHeight: '100vh',
            padding: 16,
            maxWidth: 760,
            margin: '0 auto',
        }}
        >
            <h1 style={{ fontSize: 18, margin: '0 0 4px' }}>a sala do rascunho</h1>
            <p style={{ fontSize: 12, color: '#888', margin: '0 0 16px' }}>
                o modelo pequeno escreve, o SmolLM3 confere e troca só a frase errada.
                aqui as quatro etapas ficam abertas.
            </p>

            <div style={caixa}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>quem rascunha</div>
                {RASCUNHADORES.filter((r) => r.id !== 'nenhum').map((r) => (
                    <label key={r.id} style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>
                        <input
                            type="radio"
                            checked={quem === r.id}
                            onChange={() => setQuem(r.id)}
                            disabled={ocupado}
                        />
                        {' '}
                        {r.label}
                        <div style={{ fontSize: 11, color: '#777', marginLeft: 20 }}>
                            {r.portugues}
                            <br />
                            {r.nota}
                        </div>
                    </label>
                ))}
            </div>

            <div style={caixa}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>a pergunta</div>
                <select
                    value={PERGUNTAS.includes(pergunta) ? pergunta : ''}
                    onChange={(e) => setPergunta(e.target.value)}
                    disabled={ocupado}
                    style={{ width: '100%', marginBottom: 6, padding: 6, background: '#1c1c1c', color: '#ddd', border: '1px solid #333' }}
                >
                    {PERGUNTAS.map((p) => <option key={p} value={p}>{p}</option>)}
                    {!PERGUNTAS.includes(pergunta) && <option value="">(sua)</option>}
                </select>
                <input
                    value={pergunta}
                    onChange={(e) => setPergunta(e.target.value)}
                    disabled={ocupado}
                    style={{ width: '100%', padding: 6, background: '#1c1c1c', color: '#ddd', border: '1px solid #333' }}
                />
            </div>

            <button
                type="button"
                onClick={() => void rodar()}
                disabled={ocupado || !pergunta.trim()}
                style={{
                    width: '100%', padding: 10, fontSize: 14, marginBottom: 16,
                    background: ocupado ? '#333' : '#2d5a8c', color: '#fff',
                    border: 'none', borderRadius: 6,
                }}
            >
                {ocupado ? (aviso || 'rodando…') : 'rodar a arquitetura'}
            </button>

            {etapa.erro && (
                <div style={{ ...caixa, borderColor: '#7a2a2a', color: '#ff9090' }}>
                    {etapa.erro}
                </div>
            )}

            {etapa.rascunho && (
                <>
                    <div style={caixa}>
                        <div style={{ fontSize: 12, color: '#888' }}>
                            1 · rascunho ({etapa.quem}) ·
                            {' '}
                            {etapa.msRascunho}
                            ms
                        </div>
                        <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{etapa.rascunho}</div>
                        <Provas prova={etapa.provaRascunho} />
                    </div>

                    <div style={caixa}>
                        <div style={{ fontSize: 12, color: '#888' }}>
                            2 · como o revisor vê
                        </div>
                        <ol style={{ margin: '6px 0 0', paddingLeft: 22 }}>
                            {etapa.frases.map((f) => (
                                <li
                                    key={f.n}
                                    style={{
                                        color: etapa.remendos.some((r) => r.n === f.n)
                                            ? '#ff9d5c' : '#ddd',
                                    }}
                                >
                                    {f.texto}
                                </li>
                            ))}
                        </ol>
                    </div>
                </>
            )}

            {etapa.veredito && (
                <>
                    <div style={caixa}>
                        <div style={{ fontSize: 12, color: '#888' }}>
                            3 · veredito do SmolLM3 ·
                            {' '}
                            {etapa.msRevisao}
                            ms
                            {etapa.descartados > 0
                                && ` · ${etapa.descartados} remendo(s) descartado(s) por não mudar nada`}
                        </div>
                        <pre style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap', color: '#9cd' }}>
                            {etapa.veredito}
                        </pre>
                    </div>

                    <div style={caixa}>
                        <div style={{ fontSize: 12, color: '#888' }}>
                            4 · a fala que iria para a tela · total
                            {' '}
                            {total}
                            ms
                        </div>
                        <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{etapa.final}</div>
                        <Provas prova={etapa.provaFinal} />
                        <div style={{ marginTop: 8, fontSize: 11, color: '#777' }}>
                            {etapa.remendos.length === 0
                                ? 'o 3B aprovou sem escrever nada — é aqui que o desenho ganha'
                                : `o 3B trocou ${etapa.remendos.length} de ${etapa.frases.length} frase(s); `
                                  + 'se isso for a regra e não a exceção, o atalho não vale'}
                        </div>
                    </div>
                </>
            )}

            <p style={{ fontSize: 11, color: '#666', marginTop: 20 }}>
                as provas acima são as que dão para automatizar: cânone, língua, tamanho,
                detalhe inventado. se a fala soou como o Nilo, nenhuma delas sabe — isso é
                para ler.
            </p>
        </div>
    );
}
