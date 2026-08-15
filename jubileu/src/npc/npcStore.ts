// Estado compartilhado entre o CORPO 3D do NPC (Floor10Npc, dentro do Canvas) e
// a UI de conversa (Floor10NpcChat, um overlay DOM fora do Canvas). Singleton
// observável simples — mesmo padrão dos outros módulos-estado do projeto
// (f6Escape / f9Eco). Sem dependência de three/react aqui.
import { useSyncExternalStore } from 'react';
import {
    INITIAL_FLOOR10_PERCEPTION,
    type Floor10Perception,
} from './floor10Perception';
import {
    INITIAL_FLOOR10_WILL,
    type Floor10WillCommand,
    type Floor10WillCommandAction,
    type Floor10WillSnapshot,
} from './floor10Will';
import { DOWNLOAD_ZERO, type DownloadSample } from './floor10Download';

export type NpcRole = 'system' | 'user' | 'assistant';
export type NpcMsg = { role: NpcRole; content: string };
export type NpcPhase = 'cold' | 'loading' | 'ready' | 'thinking' | 'error';

export type NpcState = {
    near: boolean;          // player está perto o suficiente pra conversar
    open: boolean;          // painel de conversa aberto
    phase: NpcPhase;        // ciclo de vida do modelo
    loadText: string;       // texto de progresso do download do modelo
    loadProgress: number;   // 0..1
    // Bytes de verdade, não só a fração. Uma porcentagem parada em 12% é
    // indistinguível de uma que ainda vai andar; "412 MB de 1,92 GB, parado há
    // 40s" não é. Foi a primeira coisa que faltou quando o download falhou.
    loadDownload: DownloadSample;
    modelLabel: string;     // "7B" / "3B" / ...
    history: NpcMsg[];      // conversa (sem o system prompt)
    streaming: string;      // resposta parcial sendo transmitida token a token
    speaking: boolean;      // true enquanto o NPC "fala" (pro corpo animar a boca)
    perception: Floor10Perception; // micro-IA dos olhos (sensores espaciais ao vivo)
    autonomy: Floor10WillSnapshot; // vontade atual escolhida pela Utility AI
    willCommand: Floor10WillCommand | null; // decisão verbal aceita pelo 2B
    autonomousSpeech: string; // iniciativa de fala fora do painel
    autonomousSpeechId: number;
    // ── DELIBERAÇÃO (o cérebro pequeno pensando por fora) ──────────────────
    // Visível na UI para dar para saber, olhando, se ele está vivo: sem isto o
    // segundo cérebro trabalharia invisível e não haveria como diferenciar
    // "pensando", "decidiu" e "não carregou".
    // 'reopening' existe porque a pausa passou a ENCERRAR o worker: voltar a
    // pensar exige reabrir o runtime lendo o .gguf do disco. Isso NÃO é
    // download — e mostrar a barra de download aqui fazia parecer que o jogo
    // estava baixando 1,32 GB de novo, além de esconder o "ele voltou".
    deliberationPhase: 'off' | 'loading' | 'reopening' | 'thinking' | 'decided' | 'unavailable';
    // ── O REFLEXO (ONNX, 135M) ─────────────────────────────────────────────
    // A quinta IA e a primeira fora do wllama. Ela não responde nada: cobre o
    // primeiro segundo, enquanto o 3B ainda está lendo o prompt.
    reflexoPhase: 'off' | 'loading' | 'reopening' | 'ready' | 'unavailable';
    reflexoLoadText: string;
    reflexoLoadProgress: number;
    reflexoDownload: DownloadSample;
    /** A reação curta em cartaz agora. Some quando a fala de verdade começa. */
    reflexo: string;
    deliberationLoadText: string;      // download/cache do cérebro pequeno
    deliberationLoadProgress: number;  // 0..1, progresso real do arquivo
    deliberationDownload: DownloadSample;
    deliberationGoal: string;   // a intenção que ele assinou
    deliberationCount: number;  // quantas vezes já deliberou nesta sessão
    // ── A BOLHA QUE O MICRO ESCREVEU ───────────────────────────────────────
    // Vazio = use a frase pronta da meta. Não é enfeite: era a mesma frase por
    // meta, para sempre, e como `approach-player` domina as rodadas o jogador
    // lia "acho que vou chegar mais perto." dezenas de vezes por partida.
    deliberationBubble: string;
    // ── O PENSAMENTO CRU, AO VIVO ──────────────────────────────────────────
    // O texto que o cérebro de vontade está escrevendo NESTE instante, token a
    // token. Existe porque, de fora, "pensando…" e "travado" eram a mesma
    // imagem: dava para esperar dois minutos sem saber se havia alguém
    // trabalhando. Aqui não se resume nem se enfeita nada — é o raciocínio dele,
    // como sai. A tela mostra ou não conforme a opção nas configurações.
    deliberationLive: string;
    /** Tokens por segundo da última rodada, medidos no aparelho. */
    deliberationTps: number;
    /** Quantos núcleos a última rodada realmente usou. */
    deliberationThreads: number;
    /** Quanto durou a última rodada de pensamento, em segundos. */
    deliberationSeconds: number;
    // ── CÓRTEX MOTOR (o TERCEIRO cérebro, 360M, que vira pensamento em ação) ─
    // Campos PRÓPRIOS, e isso é o ponto. Antes ele publicava nos campos da
    // deliberação: enquanto os 386 MB dele desciam, a tela mostrava uma barra
    // rotulada "Llama 3.2 1B" andando com o progresso de outro arquivo — e o
    // estado real do 1B sumia. Cada modelo que ocupa a rede tem a sua barra.
    motorPhase: 'off' | 'loading' | 'translating' | 'ready' | 'unavailable';
    motorLoadText: string;
    motorLoadProgress: number;  // 0..1
    motorDownload: DownloadSample;
    // ── MEMÓRIA (o QUARTO cérebro, 300M, que acha o fato pelo significado) ──
    // Também com campos próprios, pela mesma razão dos do motor: enquanto os
    // 333 MB descem, a barra tem de dizer QUAL arquivo está descendo.
    memoriaPhase: 'off' | 'loading' | 'ready' | 'unavailable';
    memoriaLoadText: string;
    memoriaLoadProgress: number;  // 0..1
    memoriaDownload: DownloadSample;
    /** Id do fato que ela escolheu na última fala — visível no ?mente. */
    memoriaLembrou: string;
    memoriaScore: number;
    /**
     * Por que a memória NÃO respondeu, quando não respondeu. Vazio = respondeu.
     *
     * Existe porque o silêncio dela era mudo: seis saídas em `null` e nenhuma
     * deixava rastro, então "estourou o teto" e "nenhum fato bateu" tinham a
     * mesma cara na tela — a de um acerto antigo que nunca era limpo.
     */
    memoriaMotivo: string;
    /** Cota do site medida no aparelho — o que decide se dá pra baixar. */
    storage: { quota: number | null; usage: number; needBytes: number };
    error: string;
    version: number;
};

const s: NpcState = {
    near: false, open: false, phase: 'cold', loadText: '', loadProgress: 0,
    loadDownload: DOWNLOAD_ZERO,
    modelLabel: '', history: [], streaming: '', speaking: false,
    perception: INITIAL_FLOOR10_PERCEPTION,
    autonomy: INITIAL_FLOOR10_WILL,
    willCommand: null,
    autonomousSpeech: '', autonomousSpeechId: 0,
    deliberationPhase: 'off', deliberationLoadText: '', deliberationLoadProgress: 0,
    reflexoPhase: 'off', reflexoLoadText: '', reflexoLoadProgress: 0,
    reflexoDownload: DOWNLOAD_ZERO, reflexo: '',
    deliberationDownload: DOWNLOAD_ZERO,
    storage: { quota: null, usage: 0, needBytes: 0 },
    deliberationGoal: '', deliberationCount: 0, deliberationBubble: '',
    deliberationLive: '', deliberationTps: 0, deliberationThreads: 0,
    deliberationSeconds: 0,
    motorPhase: 'off', motorLoadText: '', motorLoadProgress: 0,
    motorDownload: DOWNLOAD_ZERO,
    memoriaPhase: 'off', memoriaLoadText: '', memoriaLoadProgress: 0,
    memoriaDownload: DOWNLOAD_ZERO, memoriaLembrou: '', memoriaScore: 0,
    memoriaMotivo: '',
    error: '', version: 0,
};

const subs = new Set<() => void>();
export const npc = s;
export function npcSubscribe(fn: () => void) { subs.add(fn); return () => { subs.delete(fn); }; }
/**
 * ── UMA JANELA PARA A BANCADA MEDIR, E SÓ PARA ELA ────────────────────────
 *
 * A última medição do bloqueio de carga falhou por falta disto: o arnês lia o
 * TEXTO RENDERIZADO procurando as palavras do chat, e o roteiro entra pela
 * bancada, que mostra o estado de outro jeito. Deu "(nada na tela)" — não
 * porque nada acontecia, mas porque eu olhava para o lugar errado.
 *
 * O estado é a fonte; a tela é uma das interpretações dele. Medir pela tela é
 * medir a interpretação.
 *
 * Só existe com `?bancada`/`?comparacao`/`?mente` na URL: em jogo, nada é
 * publicado no `window`.
 */
function exporParaBancada(): void {
    try {
        const busca = globalThis.location?.search ?? '';
        if (!/[?&](bancada|comparacao|mente)\b/i.test(busca)) return;
        (globalThis as { __npcEstado?: NpcState }).__npcEstado = s;
    } catch { /* sem location: não é navegador */ }
}
exporParaBancada();

export function npcBump() { s.version++; for (const f of subs) f(); }
export function npcSet(patch: Partial<NpcState>) {
    // O teto do histórico mora AQUI porque aqui é o funil: o `wllamaEngine`
    // escreve a conversa por `npcSet({ history: [...] })` em cinco lugares
    // diferentes, e podar em cada um deles seria cinco chances de esquecer.
    Object.assign(s, patch);
    if (patch.history) s.history = podar(s.history);
    npcBump();
}
// Percepção muda várias vezes por segundo. O LLM lê o snapshot vivo direto,
// mas a UI não precisa re-renderizar para cada centímetro que o player anda.
export function npcPublishPerception(perception: Floor10Perception) {
    s.perception = perception;
}
export function npcPublishAutonomy(autonomy: Floor10WillSnapshot) {
    const changedDecision = autonomy.decisionId !== s.autonomy.decisionId;
    s.autonomy = autonomy;
    if (changedDecision) npcBump();
}
let nextWillCommandId = 0;
export function npcIssueWillCommand(action: Floor10WillCommandAction, reason: string) {
    s.willCommand = {
        id: ++nextWillCommandId,
        action,
        reason,
    };
    npcBump();
}
/**
 * ── O TETO DA CONVERSA, E POR QUE ELE PRECISA EXISTIR ────────────────────
 *
 * `history` crescia sem limite pela sessão inteira: cada fala autônoma do Nilo,
 * cada mensagem do painel, cada visita ao andar, tudo empilhado para sempre. Só
 * era podado na hora de montar o prompt, nunca para
 * exibir.
 *
 * E o custo não é memória — é ENGASGO NA DIGITAÇÃO. O painel republica a loja a
 * cada token do streaming, e o React refaz o `history.map(...)` inteiro em cada
 * uma dessas publicações. Numa sessão longa, a resposta do Nilo vai ficando
 * mais travada quanto mais vocês já conversaram, que é exatamente o contrário
 * do que deveria acontecer — e no celular que este projeto persegue isso é a
 * diferença entre ler e esperar.
 *
 * 60 mensagens é MUITO mais do que o modelo lê e muito mais do que cabe na
 * tela de uma vez. (Eu tinha escrito aqui "ele usa 6", citando `modelHistory`;
 * um revisor foi conferir e essa função é CÓDIGO MORTO — só o próprio teste
 * dela a chama. O prompt real usa `groundedModelHistory` com
 * `FLOOR10_HISTORY_VERBATIM = 4`. A folga é ainda maior do que eu disse, mas o
 * número que eu citei estava errado.) O que se perde é histórico que ninguém rolaria de
 * volta; o que se ganha é um custo por token que não cresce com a sessão.
 */
export const MAX_HISTORICO = 60;

function podar(lista: NpcMsg[]): NpcMsg[] {
    return lista.length > MAX_HISTORICO ? lista.slice(-MAX_HISTORICO) : lista;
}

export function npcAutonomousSay(content: string) {
    const speech = content.trim();
    if (!speech) return;
    s.history = podar([...s.history, { role: 'assistant', content: speech }]);
    s.autonomousSpeech = speech;
    s.autonomousSpeechId++;
    npcBump();
}
/**
 * ── O JOGADOR SAIU DO ANDAR 10 ────────────────────────────────────────────
 *
 * A loja do NPC vive fora do React, de propósito: o cérebro não pode reiniciar
 * porque um componente desmontou. Só que isso vale para o CÉREBRO, e não para o
 * que está na TELA — e a distinção não existia. Três coisas ficavam sujas:
 *
 *  - `near`: o `Floor10Npc` publica proximidade comparando com um ref LOCAL,
 *    que nasce `false` a cada montagem. Se a loja tinha `true` quando o
 *    jogador saiu (Nilo perto, seguindo ele), na volta o ref diz `false`, a
 *    loja diz `true`, e a comparação nunca dispara. Resultado: o aviso
 *    "💬 Conversar (E)" acende com o Nilo do outro lado da sala — e o E abre o
 *    painel de verdade — pelo resto da visita.
 *  - a bolha e a fase da deliberação: a última rodada antes de sair fica em
 *    `decided`, então o pensamento VELHO reaparece na hora em que ele volta,
 *    antes de qualquer raciocínio novo.
 *  - `autonomousSpeech`: o `Floor10NpcChat` cancela, ao desmontar, o próprio
 *    temporizador de 7 s que limparia a frase — então uma fala antiga
 *    ressurge, literal, muito depois.
 *
 * Nada disto é o cérebro: é o eco da visita anterior. `npcReset` não servia
 * porque apaga a CONVERSA (que deve sobreviver, é a memória dele) e não toca em
 * nenhum destes campos.
 */
export function npcSaiuDoAndar() {
    Object.assign(s, {
        near: false,
        streaming: '',
        speaking: false,
        autonomousSpeech: '',
        deliberationBubble: '',
        deliberationLive: '',
        deliberationGoal: '',
        // ── OS TRÊS QUE EU TINHA DEIXADO PARA TRÁS ───────────────────────
        //
        // Um revisor achou isto e a crítica é justa: eu consertei UM campo e
        // não olhei os irmãos com a mesma forma. Todos são estado de VISITA
        // guardado numa loja que sobrevive ao componente.
        //
        //  reflexo — texto do reflexo, desenhado no mesmo log da conversa que
        //            a bolha e a fala autônoma, e omitido junto com elas.
        //  willCommand — uma ordem verbal aceita numa visita ("me segue")
        //            voltava a valer no instante em que o jogador reentrava no
        //            andar, semanas de jogo depois. É o mesmo defeito do `near`:
        //            um ref local que renasce contra um campo que persiste.
        //  deliberationPhase 'decided' — este é o mais traiçoeiro. Eu zerava a
        //            META e a BOLHA e deixava a fase; aí `fraseBase('')` caía no
        //            texto genérico "decidi o que fazer." e nascia uma bolha
        //            NOVA, do nada, na volta. Consertar metade criou um sintoma
        //            que não existia antes.
        reflexo: '',
        willCommand: null,
        // `thinking` e `decided` são o desfecho de uma rodada que morreu com o
        // componente. `loading`/`reopening` NÃO entram: o modelo vive fora do
        // React e pode estar subindo de verdade. `unavailable` também fica — é
        // um fato sobre o aparelho, e zerar faria o jogo tentar a cada volta.
        deliberationPhase: s.deliberationPhase === 'thinking' || s.deliberationPhase === 'decided'
            ? 'off' : s.deliberationPhase,
    });
    npcBump();
}

export function npcReset() {
    Object.assign(s, { open: false, phase: s.phase === 'ready' || s.phase === 'thinking' ? 'ready' : s.phase,
        history: [], streaming: '', speaking: false, willCommand: null, autonomousSpeech: '', error: '' });
    npcBump();
}

// hook React. IMPORTANTE: o getSnapshot precisa devolver algo que MUDA a cada
// update — como o estado é mutado no lugar (mesma referência `s`), uso o
// contador `version` como snapshot. Se devolvesse `s`, o useSyncExternalStore
// via Object.is(s, s) === true e NUNCA re-renderizava (a UI ficava congelada até
// remontar). Devolvo `s` (dados vivos) e deixo a `version` disparar o re-render.
export function useNpc(): NpcState {
    useSyncExternalStore(npcSubscribe, () => s.version, () => s.version);
    return s;
}

// seletor enxuto: só o `open` (pro App congelar o player sem re-renderizar a
// cada token do streaming — o boolean só muda ao abrir/fechar).
export function useNpcOpen(): boolean {
    return useSyncExternalStore(npcSubscribe, () => s.open, () => s.open);
}
