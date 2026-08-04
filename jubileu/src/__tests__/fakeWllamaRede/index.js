// wllama FALSO COM REDE RUIM — para provar a retentativa sem baixar 334 MB.
//
// O defeito que ele reproduz é o que apareceu na tela do dono do jogo:
// `TypeError: Failed to fetch` no meio do download e o cérebro morto até
// alguém recarregar a página. Num celular trocando de célula isso é rotina, e
// o wllama guarda no OPFS o que já desceu — a tentativa seguinte CONTINUA.
//
// O controle abaixo deixa o teste escolher quantas cargas falham antes de uma
// dar certo, e com qual erro.

export const controle = {
  /** Quantas vezes um engine foi construído. */
  construidos: 0,
  /** Quantas chamadas de carga aconteceram. */
  cargas: 0,
  /** As próximas N cargas falham. */
  falhasRestantes: 0,
  /** O erro que as falhas levantam. */
  erro: () => new TypeError('Failed to fetch'),
  /** Se > 0, a carga entrega esse tanto de progresso e depois SOME (trava). */
  travarApos: 0,
  /**
   * As próximas N cargas RESOLVEM com um modelo oco — nVocab/nLayer zerados.
   * Medido no Chromium com 48 MB de zeros: é isso que o wllama de verdade faz
   * com um GGUF truncado. Não é uma falha inventada.
   */
  cascasRestantes: 0,
  /** Quantas vezes o cache foi apagado. */
  apagados: 0,
  /** Quantos engines foram encerrados. */
  encerrados: 0,
  reset() {
    this.construidos = 0;
    this.cargas = 0;
    this.falhasRestantes = 0;
    this.travarApos = 0;
    this.cascasRestantes = 0;
    this.apagados = 0;
    this.encerrados = 0;
    this.erro = () => new TypeError('Failed to fetch');
  },
};

const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

export class Wllama {
  constructor() {
    controle.construidos += 1;
    this.morto = false;
    this.oco = false;
    this.cacheManager = {
      list: async () => [],
      delete: async () => { controle.apagados += 1; },
    };
  }

  async loadModelFromUrl(_url, params) {
    controle.cargas += 1;
    if (controle.travarApos > 0) {
      // Um download que anda um pouco e depois morre em silêncio: sem erro,
      // sem progresso, sem fim. É este o caso que só o vigia pega.
      for (let i = 1; i <= controle.travarApos; i += 1) {
        params?.progressCallback?.({ loaded: i, total: 1000 });
        await dorme(1);
      }
      await new Promise((_, reject) => {
        params?.signal?.addEventListener('abort', () => {
          const erro = new Error('interrompido');
          erro.name = 'AbortError';
          reject(erro);
        }, { once: true });
      });
      return;
    }
    if (controle.falhasRestantes > 0) {
      controle.falhasRestantes -= 1;
      // Metade do arquivo desceu antes de a rede cair — como no aparelho.
      params?.progressCallback?.({ loaded: 500, total: 1000 });
      await dorme(1);
      throw controle.erro();
    }
    params?.progressCallback?.({ loaded: 1000, total: 1000 });
    await dorme(1);
    // A CARGA RESOLVE MESMO ASSIM. É o ponto: o arquivo truncado não levanta
    // erro nenhum aqui — quem percebe é a conferência de metadata.
    if (controle.cascasRestantes > 0) {
      controle.cascasRestantes -= 1;
      this.oco = true;
    }
  }

  async getModelMetadata() {
    return this.oco
      ? { hparams: { nVocab: 0, nCtxTrain: 0, nEmbd: 0, nLayer: 0 }, meta: {} }
      : { hparams: { nVocab: 262144, nCtxTrain: 2048, nEmbd: 768, nLayer: 24 }, meta: {} };
  }

  getNumThreads() { return 2; }

  async createEmbedding() {
    return { data: [{ embedding: new Array(768).fill(0).map((_, i) => (i === 0 ? 1 : 0)) }] };
  }

  async createChatCompletion() {
    return { choices: [{ message: { content: 'MOTION: stay|none|0' } }] };
  }

  async exit() {
    this.morto = true;
    controle.encerrados += 1;
  }
}
