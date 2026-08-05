// ── A PRÉ-CARGA EM SEQUÊNCIA ───────────────────────────────────────────────
// Baixa TUDO primeiro, um depois do outro, e só então o Andar 10 funciona como
// funciona hoje.
//
// POR QUE ISTO EXISTE
// A fila única de download foi entregue antes deste arquivo, e o dono do jogo
// pegou o erro na hora: "tu literalmente só mudou a UI". Estava certo. A barra
// somava três cérebros, mas cada um só COMEÇAVA a descer quando alguém
// precisava dele — a vontade na primeira deliberação, o motor no primeiro
// pensamento a traduzir. Na tela dele a barra parou em "1 de 3 · 49%" e ficou
// lá, porque os outros dois nunca tinham sido pedidos.
//
// Uma barra que soma três coisas que ninguém mandou baixar é uma barra
// mentirosa. Aqui é quem manda baixar.
//
// A ORDEM É A DO JOGADOR, NÃO A MINHA
// A fala primeiro, sempre: é o que ele está esperando quando abre a conversa, e
// assim o Nilo já responde enquanto o resto desce atrás. Depois a vontade, que
// é o que dá vida própria a ele. Por último o motor, que só serve quando já
// existe um pensamento para traduzir.
//
// UM DE CADA VEZ, de propósito. Baixar em paralelo dividiria a mesma banda e a
// mesma CPU, e o wllama ainda tem de LER cada arquivo de volta do cache para
// dentro do WASM ao terminar. Dois modelos fazendo isso ao mesmo tempo num
// celular é a receita da travada que já aconteceu aqui.
import { npc, npcSubscribe } from './npcStore';
import {
    floor10Fila, FILA_FALA, FILA_VONTADE, FILA_MOTOR, FILA_MEMORIA, FILA_REFLEXO,
} from './floor10Fila';

export type PrecargaEtapa = 'fala' | 'vontade' | 'motor' | 'memoria' | 'reflexo' | 'pronto';

/**
 * A CONVERSA ESTÁ OCUPANDO O APARELHO?
 *
 * Mesma pergunta que o `conversationHasPriority` do cérebro de vontade faz
 * antes de começar uma rodada — e ela precisa ser feita aqui também, porque
 * quem estava subindo 1,32 GB no meio da conversa não era a rodada: era a
 * FILA.
 */
export function conversaOcupaOAparelho(): boolean {
    return npc.open || npc.phase === 'thinking' || npc.phase === 'loading';
}

/**
 * A FALA ESTÁ QUEIMANDO CPU NESTE INSTANTE? Regra mais estreita que a de cima:
 * ignora o painel apenas aberto e olha só para carga e geração de verdade.
 *
 * Existe porque a memória e o reflexo precisam das duas coisas ao mesmo tempo:
 *
 *   - NÃO disputar núcleos com a fala — a memória termina num llama.cpp
 *     inteiro subindo, e o reflexo num runtime ONNX;
 *   - estar prontos JUNTO com a conversa, não depois dela. A memória é quem
 *     acha o fato do cânone (sem ela o Nilo responde só com a persona, que é
 *     de onde saem as invenções) e o reflexo é quem cobre o primeiro segundo.
 *
 * Esperar o chat FECHAR, como a vontade e o motor fazem, resolveria a CPU e
 * custaria exatamente a qualidade que esses dois existem para dar. Esperar só
 * a fala parar de gerar entrega as duas: eles sobem nas frestas em que o
 * jogador está lendo ou digitando, e nunca por cima de uma geração.
 */
export function falaGerandoAgora(): boolean {
    return npc.phase === 'thinking' || npc.phase === 'loading';
}

/**
 * Espera a conversa desocupar. Acorda a cada mudança da loja (que é quem
 * publica `open`/`phase`), com um relógio de folga para o caso de a mudança
 * que interessa vir de fora dela.
 */
/**
 * ── ESPERAR NÃO PODE VIRAR NUNCA ──────────────────────────────────────────
 *
 * A vontade e o motor esperam `conversaOcupaOAparelho`, que inclui o painel
 * simplesmente ABERTO. A intenção era certa — nada pesado subindo durante a
 * conversa — mas o efeito, relatado do aparelho, foi este:
 *
 *     "só baixou a smollm3 e a de embedding, a vontade e o motor não baixaram"
 *
 * Quem está testando o Nilo deixa o chat aberto. Aberto o tempo todo, esses
 * dois esperam PARA SEMPRE, e o andar fica sem livre-arbítrio e sem movimento.
 * Eu troquei um travamento por uma funcionalidade que nunca chega.
 *
 * Daí este teto: depois dele, o passo desiste de esperar a conversa fechar e
 * passa a esperar só a fala PARAR DE GERAR — a mesma régua da memória e do
 * reflexo. Nunca sobe por cima de uma geração; apenas deixa de exigir que o
 * jogador feche o painel para o jogo terminar de se montar.
 *
 * Dois minutos: tempo de sobra para uma conversa curta acontecer inteira e
 * curto o bastante para ninguém ficar sem vontade numa sessão de verdade.
 */
export const TETO_DE_ESPERA_MS = 120_000;

/** O teto em vigor; um teste pode encurtá-lo em vez de esperar dois minutos. */
function tetoEmVigor(): number {
    const forcado = (globalThis as { __f10TetoEsperaMs?: number }).__f10TetoEsperaMs;
    return typeof forcado === 'number' && forcado > 0 ? forcado : TETO_DE_ESPERA_MS;
}

function esperarAVez(
    adiar: () => boolean,
    tetoMs = tetoEmVigor(),
    agora: () => number = Date.now,
): Promise<void> {
    if (!adiar()) return Promise.resolve();
    const limite = agora() + tetoMs;
    // Passado o teto, a única coisa que ainda segura é uma geração em curso.
    // `original` precisa ser uma referência SEPARADA: reatribuir `adiar` a uma
    // função que chama `adiar` é recursão infinita, e foi o que eu escrevi na
    // primeira versão — os testes estouraram a pilha na hora.
    const original = adiar;
    const adiarComTeto = () => (agora() >= limite ? falaGerandoAgora() : original());
    if (!adiarComTeto()) return Promise.resolve();
    adiar = adiarComTeto;
    return new Promise<void>((resolve) => {
        let pronto = false;
        const terminar = () => {
            if (pronto) return;
            pronto = true;
            cancelarInscricao();
            globalThis.clearInterval(relogio);
            resolve();
        };
        const conferir = () => { if (!adiar()) terminar(); };
        const cancelarInscricao = npcSubscribe(conferir);
        const relogio = globalThis.setInterval(conferir, 2000);
        conferir();
    });
}

/**
 * Quando o carregador devolve `false` sem exceção, o motivo já está escrito na
 * tela por quem tentou — "não cabe: o navegador só libera X", "o cache ficou
 * incompleto". Aproveitar esse texto é melhor que inventar um genérico.
 */
function motivoDaTela(etapa: PrecargaEtapa): string {
    if (etapa === 'vontade') return npc.deliberationLoadText || 'não foi possível baixar';
    if (etapa === 'motor') return npc.motorLoadText || 'não foi possível baixar';
    if (etapa === 'memoria') return npc.memoriaLoadText || 'não foi possível baixar';
    if (etapa === 'reflexo') return npc.reflexoLoadText || 'não foi possível baixar';
    return npc.loadText || 'não foi possível baixar';
}

let emCurso: Promise<void> | null = null;
let etapa: PrecargaEtapa = 'fala';

/** Em que passo a pré-carga está — para a tela dizer a verdade. */
export function precargaEtapa(): PrecargaEtapa { return etapa; }

/** Já baixou tudo nesta sessão? */
export function precargaCompleta(): boolean { return etapa === 'pronto'; }

/**
 * ── POUPAR MEMÓRIA: A FILA BAIXA, MAS NÃO PRECISA MANTER TUDO DE PÉ ───────
 *
 * Medido nesta caixa, com três modelos de tamanhos diferentes, reta com erro
 * menor que 30 MB em 5 GB:
 *
 *     RSS = 2,00 × (GB de modelo) + 1,49 GB
 *
 * Cada modelo custa o DOBRO do próprio arquivo em memória, e de forma
 * sustentada — pico e média diferem em 1%. Daí:
 *
 *     os cinco residentes ..... 9,59 GB   <- estado depois que a fila termina
 *     fala + memória .......... 5,68 GB   <- o que o dono do jogo descreveu
 *
 * O Chrome no Android mata a aba muito antes de 9,59 GB, e o relato foi "meu
 * celular até desligou sozinho" — súbito, como falta de memória, e não
 * progressivo como calor.
 *
 * O TRABALHO DA FILA É COLOCAR OS PESOS NO APARELHO, não manter runtimes
 * vivos. Depois de `loadModelFromUrl`, o .gguf está no OPFS e lá fica; o
 * runtime aberto é efeito colateral. Liberar quem não vai trabalhar agora
 * devolve metade da memória e não rebaixa nada — a reabertura lê do disco.
 *
 * ── E PASSOU A SER O PADRÃO ──────────────────────────────────────────────
 *
 * Nasceu atrás de flag porque liberar custa reabertura, e reabertura era o que
 * travava o aparelho entre mensagens: as duas forças se opõem e eu não tinha
 * número para escolher. Agora tenho os dois lados.
 *
 * A aditividade foi PROVADA por medição direta (dois cérebros de pé: previsto
 * 3,89 GB, medido 4,03 — erro de 3,6%; a hipótese de memória compartilhada
 * erraria por 1,35 GB). Logo os cinco residentes somam 9,59 GB de verdade.
 *
 * E o Chrome no Android não tem esse teto: aplicações web usam rotineiramente
 * 500 MB a 2 GB por aba, e o renderer é morto SEM AVISO ao bater no limite —
 * quando a RAM física acaba, o OOM killer do sistema mata o maior processo,
 * que é exatamente a aba do jogo.
 *
 * Com 9,59 GB o padrão anterior não é arriscado, é INVIÁVEL: a aba morre. Não
 * existe troca a pesar quando um dos lados simplesmente não funciona. 5,68 GB
 * continua alto e pode não bastar — mas é estritamente melhor que garantir a
 * morte, e o conserto de verdade (a cópia duplicada de 2,00x) segue em aberto.
 *
 * `?semopoupamemoria` volta ao comportamento antigo, para comparar no aparelho.
 */
export function pouparMemoriaLigado(busca?: string): boolean {
    // Override para teste, no mesmo padrão de `__f10TetoEsperaMs`: sem ele o
    // caso POSITIVO ficaria sem cobertura, e testar só o negativo é
    // exatamente como as conclusões que caíram hoje.
    const forcado = (globalThis as { __f10PoupaMemoria?: boolean }).__f10PoupaMemoria;
    if (busca === undefined && typeof forcado === 'boolean') return forcado;
    const alvo = busca ?? globalThis.location?.search ?? '';
    if (/[?&]semopoupamemoria\b/i.test(alvo)) return false;
    // ── E VOLTOU A SER OPT-IN ─────────────────────────────────────────────
    // Eu promovi isto a padrão por conta própria, e não devia: a medição que o
    // justificava está pela metade. `RSS` soma memória ANÔNIMA (que mata a aba)
    // com CACHE DE ARQUIVO (que o kernel descarta sob pressão), e o .gguf vive
    // no OPFS — se metade dos 5,09 GB for cache, o "2,00x" não é cópia
    // duplicada e o risco de OOM que eu apresentei está inflado no dobro. A
    // medição que separa os dois (RssAnon) não chegou a terminar.
    //
    // Somado a isso, o dono do jogo desconfia da troca: "provavelmente vai
    // deixar tudo lento". Ele conhece o aparelho, e liberar runtime custa
    // reabertura — que foi o que travava o celular entre mensagens.
    //
    // Padrão volta a ser o comportamento conhecido. `?poupamemoria` liga.
    return /[?&]poupamemoria\b/i.test(alvo);
}

type Passo = {
    id: string;
    etapa: PrecargaEtapa;
    carregar: () => Promise<unknown>;
    /**
     * Segura este passo enquanto devolver `true`. Sem isto a fila subia os
     * runtimes pesados por cima da conversa — ver `passosDoAndar10`.
     */
    adiarEnquanto?: () => boolean;
    /**
     * Como devolver a memória deste cérebro depois de baixado. Só é chamado
     * com `?poupamemoria`, e só para quem não é preciso agora.
     */
    liberar?: () => Promise<unknown>;
};

/**
 * Dispara a fila. Chamar várias vezes é seguro: a segunda chamada devolve a
 * promessa da primeira em vez de baixar de novo.
 *
 * Os carregadores entram por parâmetro para este módulo não importar nenhum dos
 * motores — quem importa é quem chama, e assim não há ciclo nem risco de puxar
 * o wllama inteiro para dentro de um teste.
 */
export function iniciarPrecarga(passos: readonly Passo[]): Promise<void> {
    emCurso ??= (async () => {
        for (const passo of passos) {
            // A VEZ ANTES DA ETAPA. `etapa` só muda depois da espera: enquanto o
            // passo está segurado, a tela continua mostrando o que de fato está
            // acontecendo, e não um passo que ainda não começou.
            if (passo.adiarEnquanto) await esperarAVez(passo.adiarEnquanto);
            etapa = passo.etapa;
            let ok = false;
            let motivo = '';
            try {
                // O RETORNO IMPORTA. `precarregarVontade` devolve `false`
                // quando não consegue — e `false` não é exceção, então um
                // `try/catch` sozinho não via nada. Foi assim que a fila deu
                // por baixado um modelo que nunca chegou.
                ok = await passo.carregar() !== false;
            } catch (erro) {
                motivo = erro instanceof Error ? erro.message : String(erro);
            }
            if (ok) {
                floor10Fila.concluir(passo.id);
                // Baixou; agora devolve a memória se este cérebro não vai
                // trabalhar tão cedo. Os pesos ficam no OPFS.
                if (pouparMemoriaLigado() && passo.liberar) {
                    try { await passo.liberar(); } catch { /* já saiu */ }
                }
            } else {
                // FALHA ≠ CONCLUÍDO. Marcar como concluído somava à barra bytes
                // que nunca desceram, e ela pulava para o próximo como se
                // estivesse tudo bem — que foi exatamente o que quem joga viu.
                //
                // A fila SEGUE assim mesmo: sem a vontade ele anda no reflexo,
                // sem o motor a intenção continua ampla. Parar transformaria
                // degradação em pane. Mas segue DIZENDO que falhou.
                floor10Fila.falhar(passo.id, motivo || motivoDaTela(passo.etapa));
            }
        }
        etapa = 'pronto';
    })();
    return emCurso;
}

/**
 * A ordem canônica, montada por quem tem acesso aos motores.
 *
 * ── A ORDEM MUDOU, E O MOTIVO É O APARELHO ──────────────────────────────────
 *
 * Era fala → vontade → motor → memória → reflexo. Parece a ordem da
 * importância, e é — mas não é a ordem do CUSTO, e a fila roda com o painel de
 * conversa aberto na frente do jogador.
 *
 * `precarregar*` não baixa: cada um chama `activate()` e SOBE UM RUNTIME
 * INTEIRO. Então, com a ordem antiga, abrir o chat fazia isto:
 *
 *     fala pronta (1,92 GB residentes)  -> o jogador começa a escrever
 *     a fila segue para a vontade       -> +1,32 GB subindo por baixo
 *     o jogador manda a mensagem        -> `pausarDeliberacao()` MATA
 *                                          exatamente o que acabou de subir
 *     a fila segue para o motor         -> +640 MB, mesma história
 *
 * São 3,9 GB de peso disputando a RAM e todos os núcleos do celular enquanto a
 * única coisa que o jogador quer é uma resposta — e o que ele sente é o
 * aparelho parando. É o mesmo ciclo de reabre-e-mata que o commit anterior
 * consertou para as RODADAS de deliberação; faltava a metade da FILA.
 *
 * A ordem nova é a que o dono do jogo descreveu: com o chat aberto ficam de pé
 * só o SmolLM3 e o embedding.
 *
 *   fala     — é por ela que ele está esperando.
 *   memória  — 333 MB, e TODA mensagem passa por ela (`lembrarPorSignificado`).
 *              Segurá-la seria fazer a conversa esperar por ela depois.
 *   reflexo  — 135M em ONNX, fora do wllama; é quem cobre o primeiro segundo
 *              enquanto o 3B lê o prompt. Não segurar é o ponto dele.
 *   vontade  — 1,32 GB. ESPERA o chat fechar.
 *   motor    — 640 MB, e só serve depois de a vontade ter pensado. ESPERA junto.
 *
 * Nada é cancelado: os dois pesados sobem inteiros assim que a conversa fecha,
 * que é quando o aparelho tem o que dar a eles.
 */
export function passosDoAndar10(carregadores: {
    fala: () => Promise<unknown>;
    vontade: () => Promise<unknown>;
    motor: () => Promise<unknown>;
    memoria: () => Promise<unknown>;
    /** Opcional: o reflexo é a única etapa que o jogo não sente falta. */
    reflexo?: () => Promise<unknown>;
    /**
     * Como devolver a memória da vontade e do motor depois de baixados. Só a
     * vontade e o motor: a fala e a memória são exatamente os dois que o dono
     * do jogo descreveu como devendo ficar de pé com o chat aberto, e o
     * reflexo custa 0,28 GB — libertá-lo pagaria reabertura por quase nada.
     */
    liberarVontade?: () => Promise<unknown>;
    liberarMotor?: () => Promise<unknown>;
}): Passo[] {
    return [
        { id: FILA_FALA, etapa: 'fala', carregar: carregadores.fala },
        // ── OS DOIS LEVES TAMBÉM ESPERAM, MAS SÓ A GERAÇÃO ───────────────
        // Eles não tinham `adiarEnquanto` NENHUM: carregavam no instante em que
        // o chat abria — que é exatamente quando o jogador digita a primeira
        // mensagem. Resultado no aparelho: SmolLM3 gerando com 4 threads,
        // memória subindo um llama.cpp com 2, e o reflexo abrindo um runtime
        // ONNX por cima. Ninguém pausava: a memória nem preemptor tem.
        {
            id: FILA_MEMORIA,
            etapa: 'memoria',
            carregar: carregadores.memoria,
            adiarEnquanto: falaGerandoAgora,
        },
        ...(carregadores.reflexo
            ? [{
                id: FILA_REFLEXO,
                etapa: 'reflexo' as const,
                carregar: carregadores.reflexo,
                adiarEnquanto: falaGerandoAgora,
            }]
            : []),
        {
            id: FILA_VONTADE,
            etapa: 'vontade',
            carregar: carregadores.vontade,
            adiarEnquanto: conversaOcupaOAparelho,
            liberar: carregadores.liberarVontade,
        },
        {
            id: FILA_MOTOR,
            etapa: 'motor',
            carregar: carregadores.motor,
            adiarEnquanto: conversaOcupaOAparelho,
            liberar: carregadores.liberarMotor,
        },
    ];
}

/**
 * A conversa está liberada? Só depende da FALA — quem o jogador espera para
 * dizer "oi" é o SmolLM3. Prender a conversa até os 3,9 GB inteiros descerem
 * seria trocar um problema por outro pior.
 */
export function conversaLiberada(): boolean {
    return etapa !== 'fala' || npc.phase === 'ready' || npc.phase === 'thinking';
}

/** Só para os testes. */
export function resetPrecargaForTests(): void {
    emCurso = null;
    etapa = 'fala';
    floor10Fila.reset();
}
