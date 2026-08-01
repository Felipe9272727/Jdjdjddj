import { describe, expect, it } from 'vitest';
import {
    ARQUIVO_RASCUNHO,
    CAMINHO_RASCUNHO,
    especulativaLigada,
    parametrosEspeculativos,
    prepararEspeculativa,
    RASCUNHO_N_MAX,
    type MotorEspeculavel,
} from '../npc/floor10Especulativa';

/** Um motor de mentira com o mínimo que o preparo precisa enxergar. */
function motorFalso(opcoes: {
    blob?: Blob | null;
    semProxy?: boolean;
    semCache?: boolean;
    erroNoCache?: boolean;
} = {}) {
    const montados: Array<{ name: string; blob: Blob }> = [];
    const acoes: Array<{ nome: string; msg: Record<string, unknown> }> = [];
    const motor: MotorEspeculavel & { montados: typeof montados; acoes: typeof acoes } = {
        montados,
        acoes,
        cacheManager: opcoes.semCache ? undefined : {
            open: async () => {
                if (opcoes.erroNoCache) throw new Error('OPFS indisponível');
                return opcoes.blob === undefined ? new Blob(['x'.repeat(1000)]) : opcoes.blob;
            },
        },
        proxy: opcoes.semProxy ? undefined : {
            moduleInit: async (arquivos) => { montados.push(...arquivos); },
            wllamaAction: async (nome, msg) => { acoes.push({ nome, msg }); return {}; },
        },
    };
    return motor;
}

describe('floor10Especulativa — o encanamento que faltava na wllama', () => {
    it('desligada por padrão; só `?especulativa` liga', () => {
        expect(especulativaLigada('')).toBe(false);
        expect(especulativaLigada('?bancada')).toBe(false);
        expect(especulativaLigada('?especulativa')).toBe(true);
        expect(especulativaLigada('?bancada&especulativa')).toBe(true);
    });

    it('os parâmetros são os que o C++ da wllama já sabe ler', () => {
        const p = parametrosEspeculativos();
        // Nomes conferidos em cpp/wllama-context.h e em types/types.d.ts da 3.5.1.
        expect(p.spec_draft_model).toBe(CAMINHO_RASCUNHO);
        expect(p.spec_draft_n_max).toBe(RASCUNHO_N_MAX);
        expect(p).toHaveProperty('spec_draft_n_min');
        expect(p).toHaveProperty('spec_draft_p_min');
        expect(p).toHaveProperty('spec_draft_threads');
        // O rascunhador fica na CPU: a GPU deste andar já custou falas perdidas.
        expect(p.spec_draft_ngl).toBe(0);
    });

    it('monta o rascunhador junto dos shards e injeta os campos NA CARGA', async () => {
        const motor = motorFalso();
        const preparo = await prepararEspeculativa(motor, 'https://exemplo/rascunho.gguf');
        expect(preparo.ok).toBe(true);
        expect(preparo.bytes).toBe(1000);

        // A wllama continua chamando o que sempre chamou; o embrulho acrescenta.
        await motor.proxy!.moduleInit([
            { name: 'model-00001-of-00001.gguf', blob: new Blob(['principal']) },
        ]);
        expect(motor.montados.map((f) => f.name)).toEqual([
            'model-00001-of-00001.gguf',
            ARQUIVO_RASCUNHO,
        ]);

        await motor.proxy!.wllamaAction('load', { _name: 'load_req', n_ctx: 1536 });
        const carga = motor.acoes.find((a) => a.nome === 'load');
        expect(carga?.msg.n_ctx).toBe(1536); // o que já ia, continua indo
        expect(carga?.msg.spec_draft_model).toBe(CAMINHO_RASCUNHO);
    });

    it('SÓ a mensagem de carga é tocada — as outras passam intactas', async () => {
        const motor = motorFalso();
        await prepararEspeculativa(motor, 'https://exemplo/rascunho.gguf');
        await motor.proxy!.wllamaAction('cmpl', { _name: 'cmpl_req', data_json: '{}' });
        const cmpl = motor.acoes.find((a) => a.nome === 'cmpl');
        expect(cmpl?.msg).toEqual({ _name: 'cmpl_req', data_json: '{}' });
        expect(cmpl?.msg.spec_draft_model).toBeUndefined();
    });

    it('rascunhador ainda não baixado: recusa em silêncio, sem quebrar a fala', async () => {
        const motor = motorFalso({ blob: null });
        const preparo = await prepararEspeculativa(motor, 'https://exemplo/rascunho.gguf');
        expect(preparo.ok).toBe(false);
        expect(preparo.motivo).toMatch(/ainda não está no aparelho/);
        // E o mais importante: NADA foi embrulhado — a carga segue a de sempre.
        await motor.proxy!.wllamaAction('load', { _name: 'load_req' });
        expect(motor.acoes[0].msg.spec_draft_model).toBeUndefined();
    });

    it('arquivo vazio no cache também é recusa', async () => {
        const motor = motorFalso({ blob: new Blob([]) });
        expect((await prepararEspeculativa(motor, 'u')).ok).toBe(false);
    });

    it('cache que explode não derruba a carga', async () => {
        const motor = motorFalso({ erroNoCache: true });
        const preparo = await prepararEspeculativa(motor, 'u');
        expect(preparo.ok).toBe(false);
        expect(preparo.motivo).toMatch(/OPFS indisponível/);
    });

    it('build da wllama sem o proxy interno: recusa em vez de estourar', async () => {
        expect((await prepararEspeculativa(motorFalso({ semProxy: true }), 'u')).ok).toBe(false);
        expect((await prepararEspeculativa(motorFalso({ semCache: true }), 'u')).ok).toBe(false);
    });
});
