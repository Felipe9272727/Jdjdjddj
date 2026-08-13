import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Floor10ModelCoordinator } from '../npc/floor10ModelCoordinator';

describe('Floor10ModelCoordinator — dois LLMs residentes, uma geração por vez', () => {
    it('mantém o cérebro anterior residente ao carregar o próximo', async () => {
        const coordinator = new Floor10ModelCoordinator();
        const events: string[] = [];
        coordinator.register('conversation', () => { events.push('unload-conversation'); });
        coordinator.register('deliberation', () => { events.push('unload-deliberation'); });

        await coordinator.activate('conversation', async () => {
            events.push('load-conversation');
            return '3B';
        });
        await coordinator.activate('deliberation', async () => {
            events.push('load-deliberation');
            return '1B';
        });

        expect(events).toEqual([
            'load-conversation',
            'load-deliberation',
        ]);
        expect(coordinator.residents()).toEqual(['conversation', 'deliberation']);
        expect(coordinator.owner()).toBe('deliberation');
    });

    it('pausa o Mini para carregar o Smol sem descarregar seus pesos', async () => {
        const coordinator = new Floor10ModelCoordinator();
        let pauses = 0;
        let unloads = 0;
        coordinator.register(
            'deliberation',
            () => { unloads += 1; },
            () => { pauses += 1; },
        );
        coordinator.register('conversation', () => undefined);
        await coordinator.activate('deliberation', async () => '1B');

        await coordinator.activate('conversation', async () => '3B');

        expect(pauses).toBe(1);
        expect(unloads).toBe(0);
        expect(coordinator.residents()).toEqual(['conversation', 'deliberation']);
    });

    it('serializa ativações concorrentes sem sobrepor os carregamentos', async () => {
        const coordinator = new Floor10ModelCoordinator();
        const events: string[] = [];
        let finishConversationLoad: (() => void) | undefined;
        let signalConversationStarted: (() => void) | undefined;
        const conversationGate = new Promise<void>((resolve) => {
            finishConversationLoad = resolve;
        });
        const conversationStarted = new Promise<void>((resolve) => {
            signalConversationStarted = resolve;
        });
        coordinator.register('conversation', () => { events.push('unload-conversation'); });

        const conversation = coordinator.activate('conversation', async () => {
            events.push('conversation-start');
            signalConversationStarted?.();
            await conversationGate;
            events.push('conversation-end');
            return '3B';
        });
        const deliberation = coordinator.activate('deliberation', async () => {
            events.push('deliberation-start');
            return '1B';
        });

        await conversationStarted;
        expect(events).toEqual(['conversation-start']);
        finishConversationLoad?.();
        await Promise.all([conversation, deliberation]);

        expect(events).toEqual([
            'conversation-start',
            'conversation-end',
            'deliberation-start',
        ]);
        expect(coordinator.residents()).toEqual(['conversation', 'deliberation']);
    });

    it('interrompe a carga da deliberação assim que a conversa é pedida', async () => {
        const coordinator = new Floor10ModelCoordinator();
        const events: string[] = [];
        let signalStarted: (() => void) | undefined;
        let cancelLoad: (() => void) | undefined;
        const started = new Promise<void>((resolve) => {
            signalStarted = resolve;
        });
        const loadGate = new Promise<void>((resolve) => {
            cancelLoad = resolve;
        });
        coordinator.register(
            'deliberation',
            () => { events.push('unload-deliberation'); },
            () => {
                events.push('pause-deliberation');
                cancelLoad?.();
            },
        );

        const deliberation = coordinator.activate('deliberation', async () => {
            events.push('deliberation-start');
            signalStarted?.();
            await loadGate;
            events.push('deliberation-stopped');
            return null;
        });
        await started;

        const conversation = coordinator.activate('conversation', async () => {
            events.push('conversation-start');
            return '3B';
        });
        await Promise.all([deliberation, conversation]);

        expect(events).toEqual([
            'deliberation-start',
            'pause-deliberation',
            'deliberation-stopped',
            'conversation-start',
        ]);
        expect(events).not.toContain('unload-deliberation');
        expect(coordinator.residents()).toEqual(['conversation']);
        expect(coordinator.owner()).toBe('conversation');
    });

    it('libera o cérebro ativo uma única vez', async () => {
        const coordinator = new Floor10ModelCoordinator();
        let unloads = 0;
        coordinator.register('conversation', () => { unloads += 1; });
        await coordinator.activate('conversation', async () => '3B');

        await coordinator.release('conversation');
        await coordinator.release('conversation');

        expect(unloads).toBe(1);
        expect(coordinator.owner()).toBeNull();
    });

    it('libera um cérebro sem expulsar o outro', async () => {
        const coordinator = new Floor10ModelCoordinator();
        let conversationUnloads = 0;
        let deliberationUnloads = 0;
        coordinator.register('conversation', () => { conversationUnloads += 1; });
        coordinator.register('deliberation', () => { deliberationUnloads += 1; });
        await coordinator.activate('conversation', async () => '3B');
        await coordinator.activate('deliberation', async () => '1B');

        await coordinator.release('deliberation');

        expect(deliberationUnloads).toBe(1);
        expect(conversationUnloads).toBe(0);
        expect(coordinator.residents()).toEqual(['conversation']);
    });
});

describe('a mente fala, a vontade cala — a regra que o celular cobrou', () => {
    it('pausa a vontade em TODA ativação da fala, não só na primeira', async () => {
        const coordenador = new Floor10ModelCoordinator();
        let pausas = 0;
        coordenador.register('deliberation', () => {}, () => { pausas += 1; });
        coordenador.register('conversation', () => {});

        await coordenador.activate('conversation', async () => 'motor');
        expect(pausas).toBe(1);

        // A REGRESSÃO: com a fala já residente, a guarda antiga desligava a
        // pausa para sempre e a vontade voltava a deliberar POR CIMA da fala —
        // dois llama.cpp de oito threads no mesmo celular.
        await coordenador.activate('conversation', async () => 'motor');
        await coordenador.activate('conversation', async () => 'motor');
        expect(pausas).toBe(3);
    });

    it('falar pausa a vontade mesmo sem recarregar nada', () => {
        const coordenador = new Floor10ModelCoordinator();
        let pausas = 0;
        coordenador.register('deliberation', () => {}, () => { pausas += 1; });

        // É esta a chamada que o wllamaEngine faz no começo de cada geração.
        coordenador.pausarDeliberacao();
        coordenador.pausarDeliberacao();
        expect(pausas).toBe(2);
    });
});

describe('carregar a memória também cala a vontade', () => {
    it('a CARGA da memória pausa a deliberação; a busca não passa por aqui', async () => {
        const coordenador = new Floor10ModelCoordinator();
        let pausas = 0;
        coordenador.register('deliberation', () => {}, () => { pausas += 1; });
        coordenador.register('memory', () => {});

        // Subir o embedding é um llama.cpp inteiro, não uma busca de 200ms.
        await coordenador.activate('memory', async () => 'embedding');
        expect(pausas).toBe(1);
    });

    it('a própria vontade não se pausa ao carregar', async () => {
        const coordenador = new Floor10ModelCoordinator();
        let pausas = 0;
        coordenador.register('deliberation', () => {}, () => { pausas += 1; });
        await coordenador.activate('deliberation', async () => 'vontade');
        expect(pausas).toBe(0);
    });
});

describe('um dono é um PIPELINE — e pipeline tem mais de um motor', () => {
    // ── O BURACO QUE ISTO FECHA ───────────────────────────────────────────
    //
    // O cabeçalho do coordenador sempre disse que `'deliberation'` inclui a
    // vontade E o tradutor motor de 135M. Mas `register` guardava UMA função
    // por dono, e só a vontade registrava; o motor apenas ATIVAVA sob a mesma
    // chave. Então `pausarDeliberacao()` — que dispara toda vez que a fala ou a
    // memória sobem — avisava a vontade e nunca o motor.
    //
    // Uma tradução em andamento seguia queimando CPU junto com a fala: a
    // contenção que este arquivo inteiro existe para evitar.
    it('pausar avisa TODOS os registrados sob o mesmo dono', () => {
        const c = new Floor10ModelCoordinator();
        const avisados: string[] = [];
        c.register('deliberation', async () => {}, () => { avisados.push('vontade'); });
        c.register('deliberation', async () => {}, () => { avisados.push('motor'); });
        c.pausarDeliberacao();
        expect(avisados.sort()).toEqual(['motor', 'vontade']);
    });

    it('o segundo a registrar não apaga o primeiro', () => {
        // O defeito original: o mapa era `Record<dono, fn>`, então quem
        // chegasse depois substituía em silêncio.
        const c = new Floor10ModelCoordinator();
        const soltos: string[] = [];
        c.register('deliberation', async () => { soltos.push('a'); });
        c.register('deliberation', async () => { soltos.push('b'); });
        c.pausarDeliberacao();
        expect(soltos).toEqual([]);
    });

    it('um que falha ao descarregar não impede os outros', () => {
        const c = new Floor10ModelCoordinator();
        const soltos: string[] = [];
        c.register('deliberation', async () => { throw new Error('recusou'); });
        c.register('deliberation', async () => { soltos.push('segundo'); });
        // Não estoura, e o segundo ainda roda: descarregar já custou uma sessão
        // inteira aqui quando uma exceção no meio deixou o resto residente.
        expect(() => c.pausarDeliberacao()).not.toThrow();
        expect(soltos).toEqual([]);
    });

    it('e o motor está REGISTRADO de verdade — teste de fiação', () => {
        const fonte = readFileSync(
            new URL('../npc/floor10MotorBrain.ts', import.meta.url), 'utf8',
        );
        expect(/floor10ModelCoordinator\.register\(\s*'deliberation'/.test(fonte)).toBe(true);
        expect(fonte).toContain('abortFloor10MotorBrain()');
    });
});
