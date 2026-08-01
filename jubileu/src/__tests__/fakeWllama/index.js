// wllama FALSO, para exercitar o ciclo de vida real do cérebro pequeno sem
// baixar 1,32 GB. Serve o mesmo contrato que floor10SmallBrain usa: carregar,
// gerar em stream, encerrar. O `__wllamaCdn` do módulo aponta para esta pasta.
//
// Existe porque o defeito que ele reproduz — "depois de mandar mensagem, a
// vontade não volta a pensar" — só aparece na SEQUÊNCIA carregar → gerar →
// preemptar → tentar de novo, e nenhum teste conseguia montar essa sequência.

/** Deixa o teste soltar tokens no ritmo que quiser. */
export const controle = {
  /** Quantas vezes um engine foi construído. */
  construidos: 0,
  /** Quantas gerações começaram. */
  geracoes: 0,
  /** Quantos engines foram encerrados. */
  encerrados: 0,
  /** Prompts recebidos, para conferir a retomada. */
  prompts: [],
  /** Tokens que cada geração vai emitir. */
  tokens: ['Estou ', 'preso ', 'neste ', 'andar ', 'faz ', 'tempo ', 'demais.'],
  /** Espera entre um token e outro. */
  atrasoMs: 5,
  reset() {
    this.construidos = 0;
    this.geracoes = 0;
    this.encerrados = 0;
    this.prompts = [];
  },
};

const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

export class Wllama {
  constructor() {
    controle.construidos += 1;
    this.morto = false;
    this.cacheManager = {
      list: async () => [],
      delete: async () => {},
    };
  }

  async loadModelFromUrl(_url, params) {
    params?.progressCallback?.({ loaded: 1, total: 1 });
    await dorme(1);
  }

  getNumThreads() {
    return 4;
  }

  async createChatCompletion(opts) {
    controle.geracoes += 1;
    controle.prompts.push(
      (opts.messages ?? []).map((m) => m.content).join('\n'),
    );
    const engine = this;
    const tokens = controle.tokens.slice();
    return (async function* () {
      // Abre a resposta como o wllama faz (delta.role), para o consumidor
      // exercitar o caminho do `chunkOpensReply`.
      yield { choices: [{ delta: { role: 'assistant' } }] };
      for (const t of tokens) {
        if (engine.morto) return;
        await dorme(controle.atrasoMs);
        if (engine.morto) return;
        yield { choices: [{ delta: { content: t } }] };
      }
    })();
  }

  async exit() {
    this.morto = true;
    controle.encerrados += 1;
  }
}
