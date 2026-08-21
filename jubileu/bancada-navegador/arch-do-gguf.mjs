// ── O QUE ESTE gguf É, SEM BAIXAR O gguf ──────────────────────────────────
//
// O MobileLLM-R1 custou 787 MB de download, dois diagnósticos errados e um
// (ABORT) para revelar uma linha de metadado:
//
//   llama_model_load: error loading model: llama4 model cannot have zero experts
//
// O cabeçalho do gguf vem ANTES dos tensores, então um Range de 1 MB já traz
// arquitetura, contagem de especialistas e a existência de chat template. Um
// pedido de 1 MB responde o que antes custava o arquivo inteiro.
//
//   node arch-do-gguf.mjs <url> [<url> ...]

const LE = (b, o) => b.readUInt32LE(o);
const L64 = (b, o) => Number(b.readBigUInt64LE(o));

// Só os tipos que aparecem em cabeçalho de modelo. Vetores são pulados pelo
// tamanho, não lidos: a lista de tokens tem 128 mil entradas.
const TAM = { 0: 1, 1: 1, 2: 2, 3: 2, 4: 4, 5: 4, 6: 4, 7: 1, 10: 8, 11: 8, 12: 8 };

function lerValor(b, p, tipo) {
    if (tipo === 8) { const n = L64(b, p); return { p: p + 8 + n, v: b.subarray(p + 8, p + 8 + n).toString('utf8') }; }
    if (tipo === 9) {
        const dentro = LE(b, p); const n = L64(b, p + 4); let q = p + 12;
        if (dentro === 8) { for (let i = 0; i < n; i++) q += 8 + L64(b, q); }
        else q += n * (TAM[dentro] ?? 4);
        return { p: q, v: `arr[${n}]` };
    }
    return { p: p + (TAM[tipo] ?? 4), v: tipo === 4 || tipo === 5 ? LE(b, p) : tipo === 6 ? b.readFloatLE(p) : tipo === 10 || tipo === 11 ? L64(b, p) : b[p] };
}

async function ler(url) {
    // Local ou remoto: o mesmo cabeçalho.
    const b = url.startsWith('http')
        ? await (async () => {
            const r = await fetch(url, { headers: { Range: 'bytes=0-16000000' } });
            if (!r.ok && r.status !== 206) throw new Error(`HTTP ${r.status}`);
            return Buffer.from(await r.arrayBuffer());
        })()
        : (await import('node:fs')).readFileSync(url).subarray(0, 16000000);
    if (b.subarray(0, 4).toString() !== 'GGUF') return { erro: 'não é gguf' };
    const nKv = L64(b, 16);
    let p = 24; const kv = {};
    for (let i = 0; i < nKv; i++) {
        const n = L64(b, p); const chave = b.subarray(p + 8, p + 8 + n).toString('utf8'); p += 8 + n;
        const tipo = LE(b, p); p += 4;
        if (p > b.length - 16) break;   // o Range acabou no meio: o resto é tensor
        const passo = lerValor(b, p, tipo);
        if (passo.p > b.length) { kv['_cortado'] = chave; break; }
        p = passo.p;
        kv[chave] = passo.v;
    }
    const arch = kv['general.architecture'] ?? '?';
    return {
        arch,
        peritos: kv[`${arch}.expert_count`],
        camadas: kv[`${arch}.block_count`],
        template: 'tokenizer.chat_template' in kv,
        nome: kv['general.name'] ?? '',
        // A regra que derrubou o MobileLLM. Está no llama.cpp, em llama-model.cpp.
        recusa: arch === 'llama4' && Number(kv['llama4.expert_count'] ?? 0) === 0
            ? 'llama.cpp RECUSA: "llama4 model cannot have zero experts"' : '',
    };
}

for (const url of process.argv.slice(2)) {
    const r = await ler(url).catch((e) => ({ erro: String(e.message ?? e) }));
    console.log(`\n${url.split('/').slice(-3).join('/')}`);
    console.log(`  ${JSON.stringify(r)}`);
}
