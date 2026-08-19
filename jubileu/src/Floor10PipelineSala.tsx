// ── A SALA DO PIPELINE (`?pipeline`) ──────────────────────────────────────
//
// POR QUE ELA EXISTE: o dono do jogo digitou `?pipeline`, esperou uma aba
// separada como as outras (`?rascunho`, `?campo`, `?mente`, `?bancada`) e não
// veio nada. Ele estava certo — toda peça experimental deste projeto ganhou
// uma sala, e o pipeline era a única com quatro modelos e nenhuma.
//
// Sem ela, "testar o pipeline" era abrir o jogo e sentir se a resposta veio
// mais rápido. Isso não distingue as três coisas que podem estar acontecendo:
// o pipeline rodou e ganhou, o pipeline rodou e o juiz marcou tudo (aí ele
// perde), ou o pipeline nem ligou e o 3B respondeu como sempre. As três se
// parecem na tela do jogo.
//
// Aqui cada etapa aparece com o tempo dela:
//
//     desabreviar → Bergamot pt→en → granite a400m → juiz de tom
//                 → LFM2.5 (só nas frases marcadas) → Bergamot en→pt
//
// ── DUAS URLs, E A DIFERENÇA IMPORTA ─────────────────────────────────────
//
//     ?pipeline        abre ESTA sala
//     ?pipeline=jogo   liga o pipeline dentro do jogo de verdade
//
// A sala chama `falarPeloPipelineReal`, que é EXATAMENTE o que o jogo chama —
// não uma reimplementação. Uma bancada que roda outro código mede outro
// programa, e este projeto já pagou por isso.
//
// ── NADA BAIXA SOZINHO ───────────────────────────────────────────────────
//
// São 983 MB somando as três peças. Abrir uma aba não pode custar isso, então
// cada uma tem botão e diz o próprio peso.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    FLOOR10_RASCUNHADOR_MODEL, baixarRascunhador, subirRascunhador,
    descarregarRascunhador, ultimoErroDoRascunhador,
} from './npc/floor10Rascunhador';
import { FLOOR10_TOM_MODEL, prepararJuizDeTom, ultimoErroDoJuiz } from './npc/floor10VetorDeTom';
import {
    FLOOR10_TRADUTOR_BYTES, prepararTradutor, desabreviar,
    traduzirPerguntaParaIngles, ultimoErroDoTradutor,
} from './npc/floor10Tradutor';
import { diagnosticar } from './npc/floor10Diagnostico';
import {
    SMALL_BRAIN_MODEL, baixarVontade, unloadSmallBrain,
} from './npc/floor10SmallBrain';
import { esperar } from './npc/floor10Carga';
import { falarPeloPipelineReal, pipelineDisponivel } from './npc/floor10PipelineReal';
import {
    enumerarEmIngles, type DesfechoDoRemendo, type PassoDoPipeline,
} from './npc/floor10Pipeline';
import { formatBytes, DOWNLOAD_ZERO, type DownloadSample } from './npc/floor10Download';
import { npc, npcSet, npcSubscribe } from './npc/npcStore';
import { liberarRolagem } from './npc/floor10PaginaRolavel';

/**
 * As perguntas de teste, em PORTUGUÊS e do jeito que o dono do jogo escreve.
 *
 * As três primeiras são as mesmas de `fala-modelo.mjs`, para dar comparação
 * direta com os números da bancada. As três últimas são abreviadas de
 * propósito: é nelas que o `desabreviar` aparece, e sem ele o Bergamot
 * entregava "pq vc n get out of that fucking?" ao rascunhador.
 */
const PERGUNTAS = [
    'Oi qual é o seu nome? Vc sabe porque estamos aqui?',
    'Esse hotel vai acabar algum dia?',
    'Se eu chamar o elevador, ele vem?',
    'vc ta preso aqui faz quanto tempo mano',
    'pq vc n sai desse andar?',
    'ta com medo desse lugar?',
];

type Peca = {
    /** Chave curta, usada para lembrar quem já subiu nesta sessão da sala. */
    id: string;
    nome: string;
    bytes: number;
    detalhe: string;
    /**
     * Se a peça sabe responder "já estou de pé", ela responde. O tradutor e o
     * juiz NÃO sabem — eles memoizam a promessa lá dentro e nunca expuseram um
     * predicado —, então a sala lembra por eles. Sem isto o botão diria
     * "carregar" para sempre, que é a tela mentindo sobre o próprio estado.
     */
    carregado?: () => boolean;
    carregar: () => Promise<unknown>;
    /**
     * O motivo da última falha, guardado pela própria peça.
     *
     * Existe porque os carregadores deste andar NÃO lançam: eles devolvem
     * `false`/`null` e mandam o motivo para a caixa-preta, para que um erro
     * nunca emudeça o NPC no jogo. Certo lá, inútil aqui — "falhou em instalar
     * o rascunhador" sem motivo não diz se foi rede, cota, CORS ou navegador
     * sem OPFS, e são quatro consertos diferentes.
     */
    motivo?: () => string;
    /**
     * Ela publica bytes em `npc.loadDownload` enquanto baixa?
     *
     * Só o rascunhador publica. O Bergamot e o transformers.js buscam os
     * arquivos por dentro, sem callback — para elas a barra anda em degrau, e
     * dizer isso é melhor que fingir precisão com o número de outra peça.
     */
    reportaProgresso?: boolean;
    /**
     * De onde ler o progresso, quando não for `npc.loadDownload`.
     *
     * O revisor publica em `npc.deliberationDownload` — o campo que a tela da
     * vontade usa no jogo. Sem este desvio a barra dele não aparecia, que foi
     * exatamente o relato: "não dá pra ver a barra de download do revisor".
     */
    amostraPropria?: () => DownloadSample | undefined;
};

type EstadoDaPeca = {
    estado: 'espera' | 'baixando' | 'pronto' | 'falhou';
    motivo?: string;
};

type Corrida = {
    pergunta: string;
    semAbreviacao: string;
    emIngles: string;
    /** Cada etapa do pipeline, na ordem em que aconteceu. */
    passos: PassoDoPipeline[];
    frases: string[];
    fala: string;
    marcadas: number;
    remendadas: number;
    limpezas: number;
    ms: number;
    msTraducao: number;
    erro: string;
};

const VAZIO: Corrida = {
    pergunta: '', semAbreviacao: '', emIngles: '', passos: [], frases: [], fala: '',
    marcadas: 0, remendadas: 0, limpezas: 0, ms: 0, msTraducao: 0, erro: '',
};

/** Ver o uso: uma janela para o aparelho respirar entre um passo e outro. */
const RESPIRO_ENTRE_PECAS_MS = 3_000;

/**
 * ── ESTA SALA É USADA NO CELULAR, E SÓ NO CELULAR ────────────────────────
 *
 * Relato: *"deixasse o ?pipeline mobile friendly, e scroll, pq tá muito ruim de
 * mexer do jeito que tá"*. Três coisas erradas, e as três são de layout:
 *
 * 1. TEXTO DE 12–14 px com `ui-monospace`. Legível no monitor, apertado no
 *    telefone. Vai a 15 px, e os rótulos secundários a 13.
 * 2. BOTÕES DE 6 px DE PADDING. O alvo mínimo confortável no toque é ~44 px de
 *    altura; os daqui tinham ~30. Agora têm `minHeight: 44`.
 * 3. TEXTO LONGO SEM QUEBRA. As URLs de erro e as frases em inglês empurravam a
 *    página para os lados, e aí o scroll vertical vira briga. `overflowWrap`
 *    resolve, e `overflowX: hidden` no corpo garante.
 */
const CAIXA = {
    background: '#141414',
    border: '1px solid #2a2a2a',
    borderRadius: 8,
    padding: '12px 14px',
    marginBottom: 10,
    // Sem isto, uma URL de erro estica a caixa e leva a página junto.
    overflowWrap: 'anywhere' as const,
};

/** O alvo mínimo de toque. Abaixo disso, errar o botão é o normal. */
const TOQUE = { minHeight: 44, fontSize: 15 };

export default function Floor10PipelineSala() {
    const [pergunta, setPergunta] = useState(PERGUNTAS[0]);
    const [corrida, setCorrida] = useState<Corrida>(VAZIO);
    // ── DOIS ESTADOS, E NÃO UM ───────────────────────────────────────────
    // Eles eram o mesmo `ocupado`, e o resultado apareceu na foto de tela do
    // dono do jogo: a fila baixando e o botão de RODAR dizendo "rodando…". Um
    // botão que mente sobre o que está acontecendo é pior que um botão inerte.
    const [baixando, setBaixando] = useState(false);
    const [ocupado, setOcupado] = useState(false);
    const [aviso, setAviso] = useState('');
    const [etapaViva, setEtapaViva] = useState('');
    // Quem já subiu NESTA sessão da sala. Ver o comentário em `Peca.carregado`:
    // duas das quatro peças não sabem responder isso sozinhas.
    const [subidas, setSubidas] = useState<ReadonlySet<string>>(new Set());
    // Redesenha quando uma peça de pé some (o botão de descarregar), para os
    // botões dizerem a verdade sem recarregar a página.
    const [tique, setTique] = useState(0);
    const [estados, setEstados] = useState<Record<string, EstadoDaPeca>>({});
    // A amostra viva da fila: o rascunhador reporta progresso em
    // `floor10Fila.progresso(FILA_RASCUNHO, …)` durante o download, e é daí que
    // sai a porcentagem da barra. As outras três peças não têm callback de
    // progresso (o Bergamot e o transformers.js baixam por dentro), então elas
    // andam em degrau — e a barra diz isso em vez de fingir precisão.
    const [amostra, setAmostra] = useState<DownloadSample | null>(null);
    const [linha, setLinha] = useState('');
    // O assinante do npcStore roda fora do render, então ele não enxerga o
    // `estados` do render atual. Uma ref mantém a versão viva.
    // De onde ler o progresso AGORA. Uma ref porque o assinante do npcStore
    // roda fora do render e não enxerga o `PECAS` nem o `estados` da vez.
    const amostraDaVezRef = useRef<() => DownloadSample | undefined>(() => undefined);

    // ── SEM ISTO A SALA NÃO ROLA ─────────────────────────────────────────
    // O `index.css` trava `html, body { overflow: hidden; touch-action: none }`
    // para o canvas 3D. Ver `floor10PaginaRolavel`: as salas são documentos e
    // herdavam a proibição — no celular não dava para chegar ao fim da página.
    useEffect(() => liberarRolagem(), []);

    // A `etapa` do npcStore é onde as peças reais escrevem em que passo estão
    // (`PECAS_REAIS` faz `npcSet({ etapa })`). Ler daqui mostra o pipeline
    // andando ao vivo, e é o MESMO campo que a bolha de espera do jogo lê.
    useEffect(() => npcSubscribe(() => {
        setEtapaViva(npc.etapa);
        // `loadDownload` é onde o rascunhador publica a amostra do download —
        // e ele NÃO publicava ali até agora, o que deixava a barra em 0 MB
        // enquanto os bytes andavam. `linha` é o texto vivo ("12 MB de 822 MB ·
        // 1,3 MB/s"), que é o que responde "está andando ou travou?".
        // A peça que está baixando decide DE ONDE ler: o revisor publica em
        // `deliberationDownload`, os outros em `loadDownload`. Sem isso a barra
        // dele ficava invisível — foi o relato.
        setAmostra((amostraDaVezRef.current() ?? npc.loadDownload) ?? null);
        setLinha(npc.deliberationLoadText || npc.loadText || '');
    }), []);

    const PECAS: Peca[] = [
        {
            id: 'rascunho',
            nome: 'rascunhador · granite 1B-A400M',
            bytes: FLOOR10_RASCUNHADOR_MODEL.bytes,
            detalhe: 'escreve o primeiro jato em inglês · 400M ativos por token',
            // A fila SÓ BAIXA. Subir os 822 MB para dentro do WASM é o passo
            // mais pesado de todos e ganhou botão próprio, para acontecer com o
            // aparelho parado — e não no meio de mais três downloads.
            carregado: () => false,
            carregar: baixarRascunhador,
            motivo: ultimoErroDoRascunhador,
            reportaProgresso: true,
        },
        {
            id: 'tradutor',
            nome: 'tradutor · Bergamot en↔pt',
            bytes: FLOOR10_TRADUTOR_BYTES,
            detalhe: 'os DOIS pares: leva a pergunta e traz a fala',
            // Agora o download é NOSSO (precisamos descompactar os `.gz` antes
            // de entregar ao Bergamot), então ele finalmente reporta bytes.
            carregar: () => prepararTradutor((baixados, total) => {
                npcSet({
                    loadDownload: { ...DOWNLOAD_ZERO, bytes: baixados, totalBytes: total },
                    loadText: `baixando o tradutor · ${formatBytes(baixados)} de ${formatBytes(total)}`,
                });
            }),
            motivo: ultimoErroDoTradutor,
            reportaProgresso: true,
        },
        {
            id: 'juiz',
            nome: 'juiz de tom · all-mpnet-base-v2',
            bytes: FLOOR10_TOM_MODEL.bytes,
            detalhe: 'marca o que soa errado · 5 de 6 nas cegas, 10 ms por frase',
            carregar: prepararJuizDeTom,
            motivo: ultimoErroDoJuiz,
        },
        {
            id: 'revisor',
            nome: `revisor · ${SMALL_BRAIN_MODEL.label}`,
            bytes: SMALL_BRAIN_MODEL.bytes,
            detalhe: 'só entra nas frases que o juiz marcou · é o mesmo arquivo da vontade',
            // ── SÓ BAIXA. NÃO SOBE. ──────────────────────────────────────
            //
            // Aqui estava `precarregarVontade`, que sobe um llama.cpp INTEIRO
            // de 1,25 GB — ao lado do granite de 822 MB que a primeira peça já
            // tinha subido. Dois llama.cpp com seus pools de thread, mais o
            // ONNX do juiz, mais o worker do Bergamot: quatro runtimes de pé ao
            // mesmo tempo num celular.
            //
            // O celular do dono do jogo DESLIGOU durante essa instalação.
            //
            // A fila do jogo nunca fez isso, e o comentário em
            // `passosDoAndar10` diz por quê, com as palavras dele: "quando
            // começa a baixar [a vontade], começa a travar meu celular todo".
            // Por isso ela usa `baixarVontade` — baixar é rede, subir é núcleo,
            // e os dois no mesmo passo foi o que travava o aparelho. Eu sabia
            // disso e escrevi a sala ignorando.
            carregado: () => false,
            carregar: baixarVontade,
            // Ele publica em `deliberationDownload`, e não em `loadDownload` —
            // é o campo que a tela da VONTADE usa no jogo há muito tempo. Sem
            // dizer isso aqui, a barra dele ficava invisível.
            reportaProgresso: true,
            amostraPropria: () => npc.deliberationDownload,
            // A vontade já escreve o próprio motivo na tela do jogo há muito
            // tempo; aqui é só reaproveitar o mesmo campo.
            motivo: () => npc.deliberationLoadText,
        },
    ];

    /**
     * Está de pé? Duas das quatro peças não sabem responder isso sozinhas — ver
     * o comentário em `Peca.carregado` —, então a sala lembra por elas.
     */
    const dePe = (p: Peca) => (p.carregado ? p.carregado() : subidas.has(p.id));
    amostraDaVezRef.current = () => PECAS
        .find((p) => estados[p.id]?.estado === 'baixando')?.amostraPropria?.();

    /**
     * ── A FILA: BAIXA TODAS, UMA DE CADA VEZ, E NÃO PARA NA PRIMEIRA FALHA ──
     *
     * Pedido do dono do jogo depois de o rascunhador falhar: uma barra só,
     * baixando tudo em fila, e o ERRO à vista quando uma falha.
     *
     * Três decisões, e cada uma tem um motivo:
     *
     * 1. UMA DE CADA VEZ. Quatro downloads paralelos dividem a mesma banda e a
     *    mesma CPU do celular, e o wllama ainda lê cada arquivo de volta do
     *    cache para dentro do WASM ao terminar. É a mesma regra da fila do jogo.
     *
     * 2. A FILA SEGUE depois de uma falha. Parar tudo porque o rascunhador não
     *    desceu esconderia que o tradutor e o juiz desceriam bem — e é a
     *    diferença entre "meu aparelho não aguenta" e "aquele arquivo não veio".
     *
     * 3. O MOTIVO VEM DA PEÇA, não do `catch` daqui. Os carregadores devolvem
     *    `false`/`null` em falha (regra do andar: erro não pode emudecer o NPC),
     *    então o `catch` local pegaria quase nada. Cada peça agora guarda o
     *    próprio `ultimoErro`, e é ele que aparece.
     */
    // Sem `useCallback`: ele depende de `PECAS` e `dePe`, que nascem de novo a
    // cada render. Memoizar exigiria uma lista de dependências que mente, e o
    // que se ganharia é zero — isto só roda no clique.
    const baixarTudo = async () => {
        setBaixando(true);
        setAviso('');
        setEstados(Object.fromEntries(PECAS.map((p) => [p.id, { estado: 'espera' as const }])));
        for (const peca of PECAS) {
            if (dePe(peca)) {
                setEstados((e) => ({ ...e, [peca.id]: { estado: 'pronto' } }));
                continue;
            }
            setEstados((e) => ({ ...e, [peca.id]: { estado: 'baixando' } }));
            // ── A LINHA VIVA É DA PEÇA ANTERIOR ATÉ A NOVA FALAR ─────────
            // Na foto de tela: o tradutor baixando e a linha dizendo "baixando
            // Rascunhador granite 1B-A400M · 822 MB de 822 MB". `loadText` e
            // `loadDownload` são globais, e só o rascunhador escreve neles —
            // então o texto do passo anterior ficava congelado por cima do
            // atual. Zerar aqui é o que impede a tela de mentir.
            setAmostra(null);
            setLinha('');
            let ok = false;
            let motivo = '';
            try {
                const r = await peca.carregar();
                ok = r !== false && r !== null && r !== undefined;
            } catch (erro) {
                motivo = erro instanceof Error ? erro.message : String(erro);
            }
            if (!ok && !motivo) motivo = peca.motivo?.() ?? '';
            if (ok) {
                setSubidas((s) => new Set(s).add(peca.id));
                setEstados((e) => ({ ...e, [peca.id]: { estado: 'pronto' } }));
            } else {
                setEstados((e) => ({
                    ...e,
                    [peca.id]: { estado: 'falhou', motivo: motivo || 'não subiu, e não disse por quê' },
                }));
            }
            setTique((t) => t + 1);
            // ── RESPIRO ENTRE AS PEÇAS ───────────────────────────────────
            // Quatro downloads colados, cada um terminando com o navegador
            // gravando centenas de MB no disco, não dão ao aparelho nenhuma
            // janela para dissipar calor nem para o coletor de lixo rodar. O
            // jogo já respira depois de descarregar (`RESPIRO_APOS_DESCARGA_MS`
            // = 12 s); aqui bastam 3 s entre passos.
            await esperar(RESPIRO_ENTRE_PECAS_MS);
        }
        setBaixando(false);
    };

    /**
     * ── SUBIR O RASCUNHADOR, SOZINHO ─────────────────────────────────────
     *
     * Separado da fila de propósito. A regra que o jogo já seguia e que eu
     * quebrei aqui: **baixar é rede, subir é núcleo**, e os dois no mesmo passo
     * travam o aparelho. A sala fazia baixar+subir do granite e, logo em
     * seguida, baixar+subir do LFM2.5 — dois llama.cpp de pé com seus pools de
     * thread, mais o ONNX do juiz, mais o worker do Bergamot.
     *
     * O celular do dono do jogo desligou no meio disso.
     *
     * Descarregar a vontade antes não é zelo: é a garantia de que nunca existem
     * dois llama.cpp de pé ao mesmo tempo. Ela volta sozinha quando o juiz
     * marcar uma frase — e aí o rascunhador já terminou de escrever.
     */
    const subirParaRodar = async () => {
        setOcupado(true);
        setAviso('descarregando a vontade, para não haver dois llama.cpp de pé…');
        try {
            await unloadSmallBrain();
            await esperar(RESPIRO_ENTRE_PECAS_MS);
            setAviso('subindo o rascunhador (822 MB para a RAM)…');
            const e = await subirRascunhador();
            setAviso(e ? '' : `não subiu: ${ultimoErroDoRascunhador() || 'sem motivo'}`);
        } catch (erro) {
            setAviso(`não subiu: ${erro instanceof Error ? erro.message : String(erro)}`);
        } finally {
            setOcupado(false);
            setTique((t) => t + 1);
        }
    };

    /** Uma peça só, para tentar de novo sem refazer a fila inteira. */
    const subir = useCallback(async (peca: Peca) => {
        setEstados((e) => ({ ...e, [peca.id]: { estado: 'baixando' } }));
        let ok = false;
        let motivo = '';
        try {
            const r = await peca.carregar();
            ok = r !== false && r !== null && r !== undefined;
        } catch (erro) {
            motivo = erro instanceof Error ? erro.message : String(erro);
        }
        if (!ok && !motivo) motivo = peca.motivo?.() ?? '';
        setEstados((e) => ({
            ...e,
            [peca.id]: ok
                ? { estado: 'pronto' }
                : { estado: 'falhou', motivo: motivo || 'não subiu, e não disse por quê' },
        }));
        if (ok) setSubidas((s) => new Set(s).add(peca.id));
        setTique((t) => t + 1);
    }, []);

    const rodar = useCallback(async () => {
        setOcupado(true);
        setCorrida({ ...VAZIO, pergunta });
        try {
            // As duas primeiras etapas ficam à vista porque são as que ninguém
            // vê no jogo — e foram as duas que quebraram na medição.
            const semAbreviacao = desabreviar(pergunta);
            setCorrida((c) => ({ ...c, semAbreviacao }));

            const t0 = performance.now();
            const emIngles = await traduzirPerguntaParaIngles(pergunta);
            const msTraducao = Math.round(performance.now() - t0);
            if (!emIngles) {
                setCorrida((c) => ({ ...c, msTraducao, erro: 'o tradutor não devolveu a pergunta em inglês' }));
                return;
            }
            setCorrida((c) => ({ ...c, emIngles, msTraducao }));

            // ── DAQUI PARA BAIXO É O CÓDIGO DO JOGO, SEM CÓPIA ──────────
            const t1 = performance.now();
            const saida = await falarPeloPipelineReal(emIngles, (passo) => {
                // Ao VIVO: cada etapa aparece assim que acontece, e não só no
                // fim. Numa corrida de 15 s isso é a diferença entre acompanhar
                // e olhar para um botão parado.
                setCorrida((c) => ({ ...c, passos: [...c.passos, passo] }));
            });
            const ms = Math.round(performance.now() - t1);
            if (!saida) {
                setCorrida((c) => ({
                    ...c,
                    ms,
                    erro: pipelineDisponivel()
                        ? 'o pipeline desistiu — veja a caixa-preta (`?bancada`) para o motivo'
                        : 'o pipeline não está disponível: falta subir o rascunhador',
                }));
                return;
            }
            setCorrida((c) => ({
                ...c,
                ms,
                fala: saida.fala,
                marcadas: saida.marcadas,
                remendadas: saida.remendadas,
                limpezas: saida.limpezas,
            }));
        } catch (erro) {
            setCorrida((c) => ({ ...c, erro: erro instanceof Error ? erro.message : String(erro) }));
        } finally {
            setOcupado(false);
        }
    }, [pergunta]);

    // `pipelineDisponivel()` só cobra o rascunhador — é ele que não pode ser
    // baixado na hora da fala. As outras três sobem sozinhas na primeira
    // chamada, então a sala roda sem elas; só fica mais lenta na primeira vez.
    const pronto = pipelineDisponivel();
    const faltando = PECAS.filter((p) => !dePe(p));
    const algumaFalhou = PECAS.some((p) => estados[p.id]?.estado === 'falhou');

    // ── A BARRA CONTA BYTES, NÃO PEÇAS ───────────────────────────────────
    //
    // Com 822 MB de um lado e 51 MB do outro, contar peças faria a barra pular
    // de 25% em 25% e mentir sobre quanto falta. Peça pronta conta INTEIRA;
    // a que está baixando conta o que já desceu, quando ela sabe dizer — só o
    // rascunhador sabe, e é justamente ele que domina o total.
    const bytesTotais = PECAS.reduce((s, p) => s + p.bytes, 0);
    const bytesFeitos = PECAS.reduce((s, p) => {
        if (dePe(p)) return s + p.bytes;
        // Só o rascunhador publica progresso; as outras três baixam por dentro
        // do Bergamot e do transformers.js, sem callback. Somar a amostra para
        // elas seria carimbar o número de uma peça na barra de outra.
        if (estados[p.id]?.estado === 'baixando' && p.reportaProgresso) {
            return s + Math.min(amostra?.bytes ?? 0, p.bytes);
        }
        return s;
    }, 0);
    const fracao = bytesTotais > 0 ? Math.max(0, Math.min(1, bytesFeitos / bytesTotais)) : 0;

    return (
        <div style={{
            // ── O CONTÊINER ROLA SOZINHO, DÊ O QUE DER NO html/body ──────
            //
            // Relato: "não está com scroll, nada tá funcionando pra mobile, eu
            // tenho que colocar site pra desktop". Eu NÃO consegui reproduzir
            // isso aqui — nas minhas medições, em viewport de celular com
            // toque, a sala rola 600 px e não estoura para os lados. Então o
            // que segue não é "o conserto do defeito que eu achei": é parar de
            // depender do html/body para rolar.
            //
            // `position: fixed` + `inset: 0` + `overflowY: auto` faz esta caixa
            // ser a região de rolagem. Ela funciona com o corpo travado
            // (`overflow: hidden`, que é o que o jogo pede para o canvas 3D) e
            // funciona sem. `WebkitOverflowScrolling` liga a rolagem por
            // inércia no Safari antigo, onde a ausência dela é justamente a
            // sensação de "não funciona no celular".
            position: 'fixed',
            inset: 0,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            // A rolagem é DESTA caixa, então ela também precisa da permissão de
            // toque — `touch-action: none` herdado mataria o arrasto.
            touchAction: 'pan-y',
            font: '15px/1.6 ui-monospace, monospace',
            color: '#ddd',
            background: '#0b0b0b',
            padding: '12px 12px 96px',
            // `margin: 0 auto` não centraliza dentro de um `fixed`; o miolo
            // ganha a largura máxima por conta própria, abaixo.
            boxSizing: 'border-box',
            // A página rola no eixo certo e NUNCA no outro. Sem o `hidden`, uma
            // frase em inglês sem espaço arrasta a tela para o lado e o scroll
            // vertical passa a brigar com o horizontal.
            overflowX: 'hidden',
            overflowWrap: 'anywhere',
            WebkitTextSizeAdjust: '100%',
        }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
            <h1 style={{ fontSize: 18, margin: '0 0 4px' }}>Sala do pipeline inglês-primeiro</h1>
            <p style={{ color: '#888', margin: '0 0 16px' }}>
                O jogador pergunta em português; o rascunhador, o juiz e o revisor trabalham em
                inglês. Esta sala mostra cada etapa com o tempo dela — no jogo você só vê a espera
                e depois a fala, e aí não dá para saber se o atalho valeu.
                <br />
                <code style={{ color: '#7fe0b0' }}>?pipeline</code> abre esta sala ·{' '}
                <code style={{ color: '#7fe0b0' }}>?pipeline=jogo</code> liga no jogo de verdade.
            </p>

            {/* ── A FILA, COM UMA BARRA SÓ ─────────────────────────────── */}
            <div style={CAIXA}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <strong>A instalação</strong>
                    <span style={{ color: '#888', flex: 1 }}>
                        {formatBytes(bytesFeitos)} de {formatBytes(bytesTotais)}
                        {' · '}{PECAS.filter((p) => dePe(p)).length} de {PECAS.length} peças
                    </span>
                </div>

                {/* A BARRA ÚNICA. Ela conta BYTES, não peças: com 822 MB de um
                    lado e 51 MB do outro, contar peças faria a barra pular de
                    25% em 25% e mentir sobre quanto falta. */}
                <div style={{
                    height: 10, background: '#1c1c1c', borderRadius: 5,
                    overflow: 'hidden', margin: '8px 0 4px',
                }}>
                    <div style={{
                        height: '100%',
                        width: `${Math.round(fracao * 100)}%`,
                        background: algumaFalhou
                            ? 'linear-gradient(90deg,#8a2f2f,#c2554a)'
                            : 'linear-gradient(90deg,#3a6df0,#7fe0b0)',
                        transition: 'width .3s',
                    }} />
                </div>

                <button
                    type="button"
                    onClick={() => void baixarTudo()}
                    disabled={baixando || ocupado}
                    style={{
                        marginTop: 6, marginBottom: 4,
                        background: baixando ? '#232323' : '#2a3550',
                        color: baixando ? '#666' : '#cfd6e4',
                        border: '1px solid #333', borderRadius: 6,
                        padding: '12px 16px', ...TOQUE, cursor: baixando ? 'default' : 'pointer',
                    }}
                >
                    {baixando
                        ? 'baixando…'
                        : (algumaFalhou ? 'tentar de novo o que faltou' : 'baixar tudo em fila')}
                </button>

                {/* ── O SINAL DE VIDA ──────────────────────────────────────
                    O relato foi "fica nisso eternamente". Sem velocidade nem
                    "parado há Ns" na tela, travado e lento são idênticos — e a
                    diferença decide se é para esperar ou desistir. */}
                {baixando && (
                    <div style={{
                        marginBottom: 6, fontSize: 12,
                        color: (amostra?.stalledSec ?? 0) >= 10 ? '#f5c96b' : '#7aa2ff',
                    }}>
                        {(amostra?.stalledSec ?? 0) >= 10
                            ? `parado há ${Math.round(amostra?.stalledSec ?? 0)}s — se passar do prazo, ele desiste e diz por quê`
                            : (linha
                                || 'baixando sem contador de bytes — esta peça não reporta progresso; '
                                 + 'se passar do prazo, ela desiste e diz por quê')}
                    </div>
                )}
                <div style={{ color: '#777', fontSize: 12, marginBottom: 4 }}>
                    Uma de cada vez: quatro downloads paralelos dividem a mesma banda e a mesma CPU
                    do celular. A fila SEGUE depois de uma falha — parar tudo esconderia que as
                    outras desceriam bem.
                </div>

                {PECAS.map((p) => {
                    const st: EstadoDaPeca = dePe(p)
                        ? { estado: 'pronto' }
                        : (estados[p.id] ?? { estado: 'espera' });
                    const cor = {
                        espera: '#666', baixando: '#7aa2ff', pronto: '#7fe0b0', falhou: '#ff9c9c',
                    }[st.estado];
                    const marca = {
                        espera: '·', baixando: '↓', pronto: '✓', falhou: '✗',
                    }[st.estado];
                    const d = st.motivo ? diagnosticar(st.motivo) : null;
                    return (
                        <div key={p.id} style={{
                            marginTop: 8, paddingTop: 8, borderTop: '1px solid #1e1e1e',
                        }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                                <span style={{ color: cor, width: 14 }}>{marca}</span>
                                <span style={{ flex: '1 1 240px' }}>
                                    {p.nome}
                                    <br />
                                    <span style={{ color: '#777', fontSize: 12 }}>{p.detalhe}</span>
                                </span>
                                <span style={{ color: '#888' }}>{formatBytes(p.bytes)}</span>
                                {st.estado === 'falhou' && (
                                    <button
                                        type="button"
                                        onClick={() => void subir(p)}
                                        disabled={baixando || ocupado}
                                        style={{
                                            background: '#20242e', color: '#cfd6e4',
                                            border: '1px solid #333', borderRadius: 6,
                                            padding: '10px 14px', ...TOQUE,
                                            cursor: ocupado ? 'default' : 'pointer',
                                        }}
                                    >
                                        de novo
                                    </button>
                                )}
                            </div>

                            {/* ── O ERRO, À VISTA ───────────────────────────── */}
                            {st.estado === 'falhou' && (
                                <div style={{
                                    marginTop: 6, padding: '8px 10px', borderRadius: 6,
                                    background: '#241616', border: '1px solid #4a2a2a',
                                }}>
                                    {d ? (
                                        <>
                                            <div style={{ color: '#ff9c9c' }}>{d.resumo}</div>
                                            <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: '#c9a0a0' }}>
                                                {d.saidas.map((s) => <li key={s}>{s}</li>)}
                                            </ul>
                                        </>
                                    ) : (
                                        <div style={{ color: '#ff9c9c' }}>
                                            não reconheci este erro — o texto cru vale mais que um
                                            palpite meu
                                        </div>
                                    )}
                                    {/* O texto CRU sempre aparece, mesmo com diagnóstico: o
                                        diagnóstico é hipótese, e a mensagem é o fato. */}
                                    <div style={{
                                        marginTop: 6, color: '#8a7a7a', fontSize: 12,
                                        wordBreak: 'break-word',
                                    }}>
                                        {st.motivo}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* ── SUBIR É UM PASSO SEPARADO, E SOZINHO ──────────────
                    Baixar é rede; subir é núcleo e memória. Os dois no mesmo
                    passo, quatro vezes seguidas, foi o que desligou o celular
                    do dono do jogo. Aqui ele acontece uma vez, com o aparelho
                    parado, e depois de tudo já estar no disco. */}
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #2a2a2a' }}>
                    <button
                        type="button"
                        onClick={() => void subirParaRodar()}
                        disabled={baixando || ocupado || pronto}
                        style={{
                            background: pronto ? '#1d3a2a' : '#2f6b4f',
                            color: pronto ? '#7fe0b0' : '#eaffee',
                            border: '1px solid #333', borderRadius: 6,
                            padding: '12px 16px', ...TOQUE,
                            cursor: (baixando || ocupado || pronto) ? 'default' : 'pointer',
                        }}
                    >
                        {pronto ? '✓ rascunhador de pé' : 'subir o rascunhador (822 MB para a RAM)'}
                    </button>
                    <div style={{ marginTop: 6, color: '#777', fontSize: 12 }}>
                        Baixar é rede; subir é núcleo e memória. Este passo roda sozinho, com o
                        resto parado — e descarrega o revisor antes, para nunca existirem dois
                        llama.cpp de pé ao mesmo tempo neste aparelho.
                    </div>
                </div>

                <div style={{ marginTop: 10, color: pronto ? '#7fe0b0' : '#f5c96b' }}>
                    {pronto
                        ? 'o pipeline pode rodar'
                        : 'falta subir o rascunhador — sem ele de pé o pipeline nem tenta'}
                </div>
                {pronto && faltando.length > 0 && (
                    <div style={{ marginTop: 4, color: '#888', fontSize: 12 }}>
                        {faltando.map((p) => p.nome.split(' · ')[0]).join(', ')} sobem sozinhos na
                        primeira chamada — a primeira corrida fica mais lenta, e os tempos abaixo
                        incluem o download.
                    </div>
                )}
                {/* O `tique` existe para o React redesenhar os botões quando uma
                    peça termina de subir. Sem ele os "✓ de pé" só apareceriam
                    na próxima interação. */}
                <span hidden>{tique}</span>
            </div>

            {/* ── A PERGUNTA ───────────────────────────────────────────── */}
            <div style={CAIXA}>
                <strong>A pergunta, em português</strong>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    {PERGUNTAS.map((q, i) => (
                        <button
                            key={q}
                            type="button"
                            onClick={() => setPergunta(q)}
                            style={{
                                background: pergunta === q ? '#2a3550' : '#181818',
                                color: '#cfd6e4', border: '1px solid #333',
                                borderRadius: 6, padding: '10px 16px', cursor: 'pointer', ...TOQUE,
                            }}
                        >
                            {i + 1}
                        </button>
                    ))}
                </div>
                <textarea
                    value={pergunta}
                    onChange={(e) => setPergunta(e.target.value)}
                    rows={2}
                    style={{
                        width: '100%', marginTop: 8, background: '#0b0b0b', color: '#ddd',
                        border: '1px solid #333', borderRadius: 6, padding: 10,
                        font: 'inherit', fontSize: 16, boxSizing: 'border-box',
                    }}
                />
                <button
                    type="button"
                    onClick={() => void rodar()}
                    disabled={ocupado || !pronto}
                    style={{
                        marginTop: 8, background: pronto ? '#2f6b4f' : '#232323',
                        color: pronto ? '#eaffee' : '#666',
                        border: '1px solid #333', borderRadius: 6,
                        padding: '12px 16px', ...TOQUE, cursor: ocupado || !pronto ? 'default' : 'pointer',
                    }}
                >
                    {ocupado ? (etapaViva || 'rodando…') : 'rodar o pipeline'}
                </button>
                {aviso && <div style={{ color: '#f5c96b', marginTop: 8 }}>{aviso}</div>}
            </div>

            {/* ── AS ETAPAS ────────────────────────────────────────────── */}
            {corrida.pergunta && (
                <div style={CAIXA}>
                    <strong>As etapas</strong>
                    <Etapa
                        n="1"
                        titulo="desabreviar"
                        nota="microssegundos · sem isto o Bergamot copia `vc`, `pq` e `n` crus para o inglês"
                        texto={corrida.semAbreviacao}
                        mudou={corrida.semAbreviacao !== corrida.pergunta}
                    />
                    <Etapa
                        n="2"
                        titulo={`Bergamot pt → en · ${corrida.msTraducao} ms`}
                        nota="daqui para baixo tudo é em inglês, inclusive o juiz"
                        texto={corrida.emIngles}
                    />
                    {/* ── CADA ETAPA, COM O CONTEÚDO ─────────────────────
                        Pedido do dono do jogo: "não consigo ver o rascunho, não
                        consigo ver pra onde o juiz apontou erro, e nem o lsfm
                        corrigindo". A sala mostrava dois passos de cinco, e
                        contador não responde "o que ele escreveu?". */}
                    {corrida.passos.map((p, i) => <Passo key={i} p={p} />)}

                    {corrida.fala && (
                        <>
                            <div style={{
                                marginTop: 8, padding: 12, borderRadius: 6,
                                background: '#12261c', border: '1px solid #24503a',
                            }}>
                                <div style={{ color: '#7fe0b0', fontSize: 12, marginBottom: 4 }}>
                                    a fala que chegaria ao jogador
                                </div>
                                <div style={{ fontSize: 15 }}>{corrida.fala}</div>
                            </div>
                            {/* ── E ESTA COMPARAÇÃO ESTAVA MENTINDO ────────
                                Ela punha o total desta corrida contra os 13,4 s
                                do SmolLM3 "na bancada" — e na PRIMEIRA corrida o
                                total inclui a carga fria de cada modelo. A tela
                                mostrou 38,7 s e disse que o pipeline perdeu,
                                enquanto quem estava usando sentia o contrário.
                                Comparar corrida fria com número morno é
                                comparar duas coisas diferentes. */}
                            <div style={{ marginTop: 10, color: '#888' }}>
                                total <strong style={{ color: '#ddd' }}>
                                    {((corrida.ms + corrida.msTraducao) / 1000).toFixed(1)}s
                                </strong>
                                {corrida.marcadas === 0
                                    ? ' · o juiz não marcou nada, que é onde o pipeline ganha'
                                    : ' · com frase marcada entra a troca de modelo, e o ganho encolhe'}
                            </div>
                            <div style={{ marginTop: 6, color: '#666', fontSize: 12 }}>
                                O SmolLM3 sozinho custou 13,4 s na bancada — mas só compare com uma
                                corrida MORNA. Na primeira, este total inclui a carga fria de cada
                                modelo, e aí ele mede instalação, não conversa.
                            </div>
                            <div style={{ marginTop: 6, color: '#666', fontSize: 12 }}>
                                {enumerarEmIngles(corrida.fala).length} frase(s) na saída
                            </div>
                        </>
                    )}
                    {corrida.erro && (
                        <div style={{ color: '#ff9c9c', marginTop: 10 }}>{corrida.erro}</div>
                    )}
                </div>
            )}

            <div style={{ ...CAIXA, color: '#777', fontSize: 12 }}>
                <strong style={{ color: '#999' }}>O que esta sala NÃO testa</strong>
                <br />
                Memória e histórico. O rascunhador recebe a persona e a pergunta, e nada mais — é
                o teto de 1024 de contexto que compra os 3,2 s. No jogo isso significa que o Nilo
                responde bem a pergunta solta e pior a &quot;e aquilo que você disse antes?&quot;.
                Essa metade só dá para sentir com <code>?pipeline=jogo</code>.
                <br /><br />
                <button
                    type="button"
                    onClick={() => void descarregarRascunhador().then(() => {
                        setSubidas((s) => { const n = new Set(s); n.delete('rascunho'); return n; });
                        setTique((t) => t + 1);
                    })}
                    style={{
                        background: '#2a1d1d', color: '#ff9c9c', border: '1px solid #4a2a2a',
                        borderRadius: 6, padding: '10px 14px', cursor: 'pointer', ...TOQUE,
                    }}
                >
                    descarregar o rascunhador
                </button>
                <span> — devolve ~98% da RAM em menos de 5 s (medido)</span>
            </div>
        </div>
        </div>
    );
}

/**
 * Uma etapa do pipeline, com o CONTEÚDO e não só o número.
 *
 * O juiz aparece marcando frases pelo índice; sem ver as frases numeradas,
 * "marcou a 2" não diz nada. Por isso o passo `frases` desenha a lista inteira
 * e os marcados ficam em vermelho depois.
 */
function Passo({ p }: { p: PassoDoPipeline }) {
    const cx = { marginTop: 10, paddingLeft: 10, borderLeft: '2px solid #2a2a2a' };
    const tit = { color: '#a8bcf0' };
    const sub = { color: '#666', fontSize: 12 };
    if (p.passo === 'rascunho') {
        return (
            <div style={cx}>
                <div style={tit}>3. o granite rascunhou · {(p.ms / 1000).toFixed(1)}s</div>
                <div style={sub}>em inglês — é onde ele erra menos e onde o juiz enxerga</div>
                <div style={{ marginTop: 4 }}>{p.textoEmIngles}</div>
            </div>
        );
    }
    if (p.passo === 'limpeza') {
        return (
            <div style={cx}>
                <div style={tit}>· limpeza na frase {p.n} (de graça, sem modelo)</div>
                <div style={{ ...sub, textDecoration: 'line-through' }}>{p.antes}</div>
                <div>{p.depois}</div>
            </div>
        );
    }
    if (p.passo === 'frases') {
        return (
            <div style={cx}>
                <div style={tit}>· {p.frases.length} frase(s) para o juiz</div>
                <ol style={{ margin: '4px 0 0', paddingLeft: 22 }}>
                    {p.frases.map((f, i) => <li key={i}>{f}</li>)}
                </ol>
            </div>
        );
    }
    if (p.passo === 'juiz') {
        return (
            <div style={cx}>
                <div style={tit}>4. o juiz de tom · {p.ms} ms</div>
                <div style={sub}>
                    {p.marcadas.length === 0
                        ? 'não marcou nada — é aqui que o pipeline ganha do 3B'
                        : 'cada marcada custa uma chamada de revisor (~30 s medidos)'}
                </div>
                {p.marcadas.length === 0 ? (
                    <div style={{ marginTop: 4, color: '#7fe0b0' }}>
                        ✓ nenhuma frase fora do tom
                    </div>
                ) : (
                    <div style={{ marginTop: 4 }}>
                        {/* O MOTIVO, que antes morria aqui. Ele vai junto ao
                            revisor (2/6 → 4/6 medidos) e aparece na tela pelo
                            mesmo preço: dá para ver se o juiz marcou por um
                            motivo que faz sentido, ou só por parecer errado. */}
                        {p.marcadas.map((m) => (
                            <div key={m.n} style={{ marginTop: 4 }}>
                                <span style={{ color: '#ff9c9c' }}>✗ frase {m.n}</span>
                                <span style={{ ...sub, marginLeft: 6 }}>
                                    {m.porque || 'marcou sem saber dizer por quê — o revisor vai às cegas'}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }
    if (p.passo === 'remendo') {
        return (
            <div style={cx}>
                <div style={tit}>5. o LFM2.5 na frase {p.n} · {(p.ms / 1000).toFixed(1)}s</div>
                <div style={{ ...sub, textDecoration: 'line-through' }}>{p.antes}</div>
                <Desfecho d={p.desfecho} />
            </div>
        );
    }
    return (
        <div style={cx}>
            <div style={tit}>6. Bergamot en → pt · {p.ms} ms</div>
            <div style={sub}>{p.antesEmIngles}</div>
            <div style={{ marginTop: 4 }}>{p.depoisEmPtBr}</div>
        </div>
    );
}

/**
 * ── BUG OU ESCOLHA, LADO A LADO ──────────────────────────────────────────
 *
 * A pergunta que este pedaço de tela existe para responder foi feita assim:
 * *"ele simplesmente decide não mudar (...) será um bug, ou uma escolha?"* —
 * e a tela de antes não conseguia responder, porque escrevia a MESMA linha
 * ("não remendou — o revisor não estava de pé, ou desistiu") para quatro
 * desfechos que não têm nada em comum além do resultado.
 *
 * Cada linha aqui diz também de QUEM é a culpa, porque é isso que decide o que
 * fazer a seguir: aumentar prazo, trocar de modelo, ou não mexer em nada.
 */
function Desfecho({ d }: { d: DesfechoDoRemendo }) {
    const sub = { color: '#666', fontSize: 12 };
    if (d.tipo === 'trocou') return <div style={{ color: '#7fe0b0' }}>{d.depois}</div>;
    if (d.tipo === 'manteve') {
        return (
            <div style={{ color: '#f5c96b' }}>
                devolveu a MESMA frase — foi ESCOLHA dele, não falha. Ele leu, achou
                que estava bom e não mexeu. Custou o preço cheio mesmo assim.
            </div>
        );
    }
    if (d.tipo === 'sem-revisor') {
        return (
            <div style={{ color: '#f5c96b' }}>
                o revisor não estava de pé, e não subiu — nada foi tentado (por isso 0,0s)
            </div>
        );
    }
    if (d.tipo === 'cortado') {
        return (
            <div>
                <div style={{ color: '#ff9c9c' }}>
                    CORTADO: ele estava escrevendo e o prazo (ou o teto de tokens) chegou
                    antes de a frase fechar. A original ficou.
                </div>
                {d.parcial
                    ? <div style={{ ...sub, marginTop: 4 }}>o que deu tempo: “{d.parcial}”</div>
                    : <div style={{ ...sub, marginTop: 4 }}>não saiu um token sequer</div>}
            </div>
        );
    }
    if (d.tipo === 'erro') {
        return <div style={{ color: '#ff9c9c' }}>tropeçou: {d.erro}</div>;
    }
    return (
        <div style={{ color: '#f5c96b' }}>
            rodou até o fim e ficou mudo — custou o tempo inteiro e não escreveu nada
        </div>
    );
}

function Etapa({ n, titulo, nota, texto, mudou }: {
    n: string; titulo: string; nota: string; texto: string; mudou?: boolean;
}) {
    return (
        <div style={{ marginTop: 10, paddingLeft: 10, borderLeft: '2px solid #2a2a2a' }}>
            <div style={{ color: '#a8bcf0' }}>
                {n}. {titulo}
                {mudou === false && <span style={{ color: '#666' }}> (não mudou nada)</span>}
            </div>
            <div style={{ color: '#666', fontSize: 12 }}>{nota}</div>
            {texto && <div style={{ marginTop: 4 }}>{texto}</div>}
        </div>
    );
}
