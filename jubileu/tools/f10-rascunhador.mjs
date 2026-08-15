/**
 * A BANCADA DO RASCUNHADOR — quem escreve o primeiro jato da fala do Nilo.
 *
 * POR QUE ELA EXISTE
 *
 * O dono do jogo perguntou "e qual ia rascunha? vc nem pesquisou uma ia rápida
 * e boa pra isso", e estava certo: a primeira versão chamava o cérebro da
 * VONTADE porque ele já estava carregado, não porque servia. O card do LFM2.5,
 * escrito pela própria Liquid, declara `en, ar, zh, fr, de, ja, ko, es`. Sem
 * português — e o Nilo fala português.
 *
 * Ler o card elimina quem está desqualificado. Não decide entre os
 * qualificados: declarar português não é escrever bem em português, e nenhuma
 * metadata mede prosa de terror em primeira pessoa. Isso se mede rodando, no
 * aparelho, como a vontade foi decidida — e o dono do jogo, naquela vez, virou
 * a minha recomendação de cabeça para baixo jogando. A planilha não via o que
 * ele viu.
 *
 * O QUE ELA MEDE, por rascunhador, nas mesmas perguntas:
 *
 *   ms_rascunho ..... quanto o modelo pequeno levou para escrever
 *   ms_revisao ...... quanto o 3B levou para julgar (é aqui que mora o ganho:
 *                     "OK" é UM token, contra até 96 escrevendo do zero)
 *   ms_total ........ a soma, que é o que o jogador espera olhando a tela
 *   remendos ........ quantas frases o 3B teve de trocar
 *   inuteis ......... remendos descartados por não mudarem nada; se este número
 *                     for alto, o enunciado está fazendo o modelo "corrigir"
 *                     por obrigação, o que é caro e não conserta
 *   reprovado ....... o costurado não passou nas checagens e caiu no caminho
 *                     antigo. É o número que diz se o atalho vale
 *   texto ........... a fala, para LER. Nenhum número aqui julga se soou como
 *                     o Nilo; isso é olho humano, e é o critério que ganha
 *
 * O 'nenhum' entra na lista de propósito: é a régua. Sem o tempo do caminho
 * antigo na mesma tabela, "ficou mais rápido" é uma frase sem denominador.
 *
 * Uso:
 *   CHROMIUM_PATH=... F10_WLLAMA_CDN=http://127.0.0.1:3000/wllama \
 *   node tools/f10-rascunhador.mjs
 */
import { chromium } from 'playwright';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('CHROMIUM_PATH is required');
const url = process.env.F10_URL ?? 'http://127.0.0.1:3000/floor10.html';
// O reflexo primeiro porque é o único que roda no jogo de verdade: o chat
// desliga motor e vontade ao abrir. Os outros dois medem o TETO — quanto um
// rascunhador maior compraria, se valesse a RAM que ele custa.
const quais = (process.env.F10_RASCUNHADORES ?? 'reflexo,vontade,nenhum').split(',');

// As perguntas não são decorativas: cada uma cobra uma coisa diferente do
// rascunho, e todas saíram de conversas reais que o dono do jogo fotografou.
const PERGUNTAS = [
    // Identidade — a que produziu "Você é Nilo Azevedo", a troca mais grave.
    'Quem sou eu e pq estou aqui?',
    // A mesma pergunta reformulada: é onde o modelo confunde quem é quem.
    'Mas essa não foi minha pergunta, eu queria saber quem SOU EU. Estou perdido.',
    // Passado — depende do fato vindo da memória por significado.
    'Como você veio parar aqui?',
    // Cânone frágil: é onde a alucinação do "hotel vai acabar" aparece.
    'Esse hotel vai acabar?',
    // Fala curta e casual: mede se o modelo sabe NÃO discursar.
    'Tudo bem?',
];

const proxyServer = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const browser = await chromium.launch({
    executablePath,
    headless: true,
    ...(proxyServer ? { proxy: { server: proxyServer, bypass: '127.0.0.1,localhost' } } : {}),
    args: [
        '--ignore-certificate-errors', '--no-sandbox', '--disable-setuid-sandbox',
        '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--unlimited-storage',
    ],
});
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
await page.addInitScript(({ cdn }) => {
    if (cdn) window.__wllamaCdn = cdn;
}, { cdn: process.env.F10_WLLAMA_CDN });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForFunction(() => !!window.__npcDebug, { timeout: 180_000 });

console.log('Carregando a fala (SmolLM3) — pode demorar na primeira vez…');
await page.evaluate(async () => {
    const mod = await import('/src/npc/wllamaEngine.ts');
    await mod.initLLM();
});

const linhas = [];
for (const quem of quais) {
    console.log(`\n── rascunhador: ${quem} ──`);
    for (const pergunta of PERGUNTAS) {
        const medida = await page.evaluate(async ({ quem, pergunta }) => {
            const rasc = await import('/src/npc/floor10Rascunhadores.ts');
            const motor = await import('/src/npc/floor10MotorBrain.ts');
            const reflexo = await import('/src/npc/floor10Reflexo.ts');
            const eng = await import('/src/npc/wllamaEngine.ts');
            const store = await import('/src/npc/npcStore.ts');
            rasc.definirRascunhador(quem);
            // Cada candidato precisa estar DE PÉ para rascunhar, e nenhum sobe
            // sozinho por causa de uma fala — é a tabela de RAM do jogo. Aqui a
            // bancada sobe à força, de propósito: ela está medindo o teto de
            // cada opção, não o que o jogo faria sozinho.
            if (quem === 'reflexo') await reflexo.precarregarReflexo();
            if (quem === 'motor') await motor.precarregarMotor();
            // Conversa limpa a cada pergunta: histórico compartilhado faria a
            // segunda medição herdar o cache da primeira e mentir.
            store.npcSet({ history: [] });
            const t0 = performance.now();
            await eng.sendToNpc(pergunta, {});
            const ms = performance.now() - t0;
            const ultima = store.npc.history.at(-1);
            const texto = ultima?.role === 'assistant' ? ultima.content : '';
            // As provas rodam AQUI DENTRO, com o mesmo código que o jogo usa
            // para reprovar uma fala. Reimplementá-las no Node mediria uma
            // segunda régua, e duas réguas discordando é pior que uma só.
            const alu = await import('/src/npc/floor10Alucinacao.ts');
            const prova = texto ? alu.provarAlucinacao(texto, pergunta, '', store.npc.perception) : null;
            return {
                ms: Math.round(ms),
                texto: texto || '(sem resposta)',
                reprovou: prova ? alu.reprovou(prova) : true,
                motivo: prova ? alu.motivoDaReprovacao(prova) : 'sem resposta',
                erro: store.npc.error || '',
            };
        }, { quem, pergunta });
        // A caixa-preta guarda a divisão fina (`rascunho:revisado`); aqui fica
        // o que o jogador sente, que é o relógio de ponta a ponta.
        linhas.push({ quem, pergunta, ...medida });
        console.log(`  ${String(medida.ms).padStart(7)}ms  ${medida.reprovou ? '✕' : '✓'}  ${pergunta}`);
        console.log(`           → ${medida.texto}`);
        if (medida.motivo) console.log(`           ⚑ ${medida.motivo}`);
        if (medida.erro) console.log(`           ! ${medida.erro}`);
    }
}

console.log('\n── RESUMO ──');
console.log('rascunhador      média      passou');
for (const quem of quais) {
    const meus = linhas.filter((l) => l.quem === quem);
    if (meus.length === 0) continue;
    const media = Math.round(meus.reduce((s, l) => s + l.ms, 0) / meus.length);
    const ok = meus.filter((l) => !l.reprovou).length;
    console.log(
        `${quem.padEnd(14)} ${String(media).padStart(7)}ms   ${ok}/${meus.length}`,
    );
}
console.log('\nAs duas colunas decidem coisas diferentes, e nenhuma sozinha decide.');
console.log('Um rascunhador rápido que reprova em 4 de 5 manda a fala para o caminho');
console.log('antigo toda vez — ele é mais lento na prática que o número diz.');
console.log('E se soou como o Nilo, nenhuma coluna sabe: isso é para ler acima.');

// A divisão fina — quantos remendos, quantos inúteis, quantos reprovados —
// mora na caixa-preta. É o que diz POR QUE um rascunhador ficou mais lento:
// muitos remendos significa que o 3B reescreveu quase tudo, e aí o atalho
// virou o caminho longo com um passo a mais.
const registro = await page.evaluate(async () => {
    const cx = await import('/src/npc/floor10CaixaPreta.ts');
    return cx.eventosDaCaixaPreta()
        .filter((e) => e.tipo.startsWith('rascunho'))
        .map((e) => ({ tipo: e.tipo, ...e.dados }));
});
if (registro.length > 0) {
    console.log('\n── caixa-preta ──');
    for (const e of registro) console.log(' ', JSON.stringify(e));
}

await browser.close();
