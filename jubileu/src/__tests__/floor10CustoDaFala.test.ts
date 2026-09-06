import { it, expect } from 'vitest';
import { CustoDaFala } from '../npc/floor10CustoDaFala';
it('soma gerações, sem somar os snapshots cumulativos de cada token', () => {
    const c=new CustoDaFala(),a=c.iniciar(56);
    c.medir(a,{prompt_n:100,prompt_ms:1000,predicted_ms:500});
    c.medir(a,{prompt_n:100,prompt_ms:1000,predicted_ms:2000});
    const b=c.iniciar(56);c.medir(b,{prompt_n:120,cache_n:80,prompt_ms:500,predicted_ms:1000});
    expect(c.resumo()).toEqual({geracoes:2,geracoes_medidas:2,teto_saida_total:112,tokens_prompt_reportados_total:220,tokens_cache_reportados_total:80,leitura_total_s:1.5,fala_total_s:3});
});
it('expõe chamadas sem medição e ignora contadores inválidos', () => {
    const c=new CustoDaFala();c.iniciar(56);const b=c.iniciar(16);
    c.medir(b,{prompt_n:NaN,prompt_ms:-1,predicted_ms:Infinity});
    expect(c.resumo()).toMatchObject({geracoes:2,geracoes_medidas:1,teto_saida_total:72,tokens_prompt_reportados_total:0,leitura_total_s:0,fala_total_s:0});
});
