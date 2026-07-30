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
import { npc } from './npcStore';
import { floor10Fila, FILA_FALA, FILA_VONTADE, FILA_MOTOR } from './floor10Fila';

export type PrecargaEtapa = 'fala' | 'vontade' | 'motor' | 'pronto';

/**
 * Quando o carregador devolve `false` sem exceção, o motivo já está escrito na
 * tela por quem tentou — "não cabe: o navegador só libera X", "o cache ficou
 * incompleto". Aproveitar esse texto é melhor que inventar um genérico.
 */
function motivoDaTela(etapa: PrecargaEtapa): string {
    if (etapa === 'vontade') return npc.deliberationLoadText || 'não foi possível baixar';
    if (etapa === 'motor') return npc.motorLoadText || 'não foi possível baixar';
    return npc.loadText || 'não foi possível baixar';
}

let emCurso: Promise<void> | null = null;
let etapa: PrecargaEtapa = 'fala';

/** Em que passo a pré-carga está — para a tela dizer a verdade. */
export function precargaEtapa(): PrecargaEtapa { return etapa; }

/** Já baixou tudo nesta sessão? */
export function precargaCompleta(): boolean { return etapa === 'pronto'; }

type Passo = {
    id: string;
    etapa: PrecargaEtapa;
    carregar: () => Promise<unknown>;
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

/** A ordem canônica, montada por quem tem acesso aos motores. */
export function passosDoAndar10(carregadores: {
    fala: () => Promise<unknown>;
    vontade: () => Promise<unknown>;
    motor: () => Promise<unknown>;
}): Passo[] {
    return [
        { id: FILA_FALA, etapa: 'fala', carregar: carregadores.fala },
        { id: FILA_VONTADE, etapa: 'vontade', carregar: carregadores.vontade },
        { id: FILA_MOTOR, etapa: 'motor', carregar: carregadores.motor },
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
