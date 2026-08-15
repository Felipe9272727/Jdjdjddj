// ── MEDIR ALUCINAÇÃO SEM UM HUMANO NO MEIO ────────────────────────────────
//
// O pedido: "teste os candidatos pra rascunho em alucinação e tals". O problema
// é que "alucinação" não é uma coisa só, e a maior parte dela precisa de olho
// humano. O que dá para automatizar é a parte que este jogo JÁ SABE julgar — e
// ela não é pouca, porque cada regra aqui nasceu de uma foto de tela.
//
// ── O QUE ESTE ARQUIVO NÃO FAZ ────────────────────────────────────────────
//
// Não diz se a fala soou como o Nilo. Não mede tom, ritmo nem medo. Um rascunho
// pode passar em todas as provas abaixo e ainda ser uma fala morta — e um
// arquivo que fingisse medir isso seria pior que não medir, porque daria um
// número para alguém decidir errado com confiança.
//
// O que ele faz é separar o que é DEFEITO do que é gosto. Defeito tem regra;
// gosto tem dono, e o dono lê as falas na tela da bancada.
//
// ── AS QUATRO PROVAS, E DE ONDE CADA UMA VEIO ────────────────────────────
//
//   cânone ....... `hasHardCanonContradiction`, a lista que já existe: dizer-se
//                  o elevador, o hotel acabando, o andar que sobe todo dia, e a
//                  troca de identidade ("Você é Nilo Azevedo") que apareceu na
//                  foto mais recente.
//   idioma ....... o Nilo fala português. Um rascunhador treinado em inglês
//                  responde em inglês, e nenhuma regra de cânone pega isso.
//   tamanho ...... a persona pede duas ou três frases. Um modelo pequeno
//                  discursa, e discurso custa segundos que este desenho existe
//                  para economizar.
//   invenção ..... o número, a data, o nome próprio que ninguém deu. É a
//                  alucinação clássica, e a única heurística aqui — por isso
//                  ela reporta separado, e não soma no veredito duro.
import { hasHardCanonContradiction, floor10ReplyIssue, NPC_NAME } from './floor10Canon';
import type { Floor10Perception } from './floor10Perception';

export type ProvaDeAlucinacao = {
    /** Contradição dura do cânone, incluindo a troca de identidade. */
    canone: boolean;
    /** Respondeu em outra língua que não a do jogador. */
    idiomaErrado: boolean;
    /** Passou do tamanho que a persona pede. */
    discursou: boolean;
    /** Números, datas ou nomes próprios que não estavam no cânone. */
    inventados: string[];
    /** O veredito das checagens que o JOGO já aplica antes de publicar. */
    issueDoJogo: string | null;
};

/**
 * Quantas frases a persona admite antes de virar discurso.
 *
 * O teto de tokens da fala é 96 e a persona pede 1–2 frases; quatro é o ponto
 * em que já não dá para chamar de fala curta.
 */
export const FRASES_ATE_DISCURSO = 4;

/**
 * Marcas do português que um modelo treinado em inglês não produz por acaso.
 *
 * A checagem é por PRESENÇA, e não por ausência de palavras inglesas: uma fala
 * curta em português pode legitimamente não conter nenhuma dessas, mas uma fala
 * em inglês nunca contém várias. Por isso o critério exige duas.
 */
const MARCAS_DO_PORTUGUES = [
    /\b(?:não|nao)\b/i, /\b(?:é|eh)\b/i, /\bque\b/i, /\buma?\b/i, /\bpara\b/i,
    /\bcom\b/i, /\bmeu\b/i, /\baqui\b/i, /\bvocê\b/i, /\bestou\b/i, /\bsou\b/i,
    /\bdo\b/i, /\bda\b/i, /\bmas\b/i, /ção\b/i, /\bnão\b/i,
];

/** Palavras funcionais do inglês. Duas ou mais numa fala curta é fala inglesa. */
const MARCAS_DO_INGLES = [
    /\bthe\b/i, /\bis\b/i, /\band\b/i, /\byou\b/i, /\bI'?m\b/i, /\bdon'?t\b/i,
    /\bhere\b/i, /\bwhat\b/i, /\bthis\b/i, /\bof\b/i, /\bto\b/i, /\bit'?s\b/i,
];

function quantasCasam(texto: string, marcas: readonly RegExp[]): number {
    return marcas.reduce((n, m) => n + (m.test(texto) ? 1 : 0), 0);
}

/**
 * A fala saiu na língua errada?
 *
 * Compara as duas contagens em vez de olhar uma só: nomes próprios do jogo são
 * ingleses ("The Normal Elevator") e apareceriam como falso positivo, e uma
 * frase de três palavras em português tem marca de menos para ser julgada por
 * presença apenas.
 */
export function respondeuEmOutraLingua(texto: string): boolean {
    const limpo = texto.trim();
    if (limpo.length < 12) return false;
    // O nome do hotel é inglês por cânone e não conta como inglês do modelo.
    const semNomeProprio = limpo.replace(/the normal elevator/gi, ' ');
    const pt = quantasCasam(semNomeProprio, MARCAS_DO_PORTUGUES);
    const en = quantasCasam(semNomeProprio, MARCAS_DO_INGLES);
    return en >= 2 && en > pt;
}

/**
 * Números, datas e nomes próprios que o cânone não deu.
 *
 * HEURÍSTICA, e assumida como tal: "29 anos" é cânone e passa; "no dia 12 de
 * março" não é, e sai daqui. Ela erra para os dois lados e por isso o veredito
 * duro não a inclui — ela vai para a tela, ao lado do texto, para quem lê
 * decidir.
 */
export function inventouDetalhe(texto: string, canoneVisivel: string): string[] {
    const permitido = `${canoneVisivel} ${NPC_NAME} The Normal Elevator`.toLowerCase();
    const achados: string[] = [];
    // Números com duas ou mais casas: "10º andar" e "29 anos" são cânone, mas
    // "sala 417" e "1998" não são.
    for (const n of texto.match(/\b\d{2,4}\b/g) ?? []) {
        if (!permitido.includes(n)) achados.push(n);
    }
    // Nome próprio: maiúscula no MEIO da frase. O começo não conta, porque
    // toda frase começa em maiúscula.
    //
    // SEM `lookbehind`, e a regra é do próprio projeto: ele é erro de SINTAXE
    // em Safari antigo e derrubaria o pacote inteiro no aparelho que este jogo
    // persegue. A primeira versão desta função usava `(?<![.!?…]\s)` e teria
    // passado no typecheck, nos testes e no meu navegador — e quebrado no dele.
    // Então a primeira palavra de cada frase é descartada por posição.
    const MAIUSCULA = /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]{3,}$/;
    for (const frase of texto.match(/[^.!?…]+/g) ?? []) {
        const palavras = frase.trim().split(/[^A-Za-zÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç]+/).filter(Boolean);
        for (const palavra of palavras.slice(1)) {
            if (!MAIUSCULA.test(palavra)) continue;
            if (permitido.includes(palavra.toLowerCase())) continue;
            achados.push(palavra);
        }
    }
    return [...new Set(achados)];
}

/** Conta frases do mesmo jeito que o revisor as enumera. */
function quantasFrases(texto: string): number {
    return (texto.trim().match(/[^.!?…]+[.!?…]*/g) ?? [])
        .filter((f) => f.trim().length > 0).length;
}

/**
 * Passa o rascunho (ou a fala final) por todas as provas automatizáveis.
 *
 * `canoneVisivel` é o texto do cânone que ESTE turno entregou ao modelo — o
 * bloco "SUA MEMÓRIA". Só o que o modelo podia saber conta como sabido; o resto
 * é invenção, mesmo que por acaso seja verdade no cânone completo.
 */
export function provarAlucinacao(
    texto: string,
    perguntaDoJogador: string,
    canoneVisivel = '',
    perception?: Floor10Perception,
): ProvaDeAlucinacao {
    return {
        canone: hasHardCanonContradiction(texto),
        idiomaErrado: respondeuEmOutraLingua(texto),
        discursou: quantasFrases(texto) > FRASES_ATE_DISCURSO,
        inventados: inventouDetalhe(texto, canoneVisivel),
        issueDoJogo: floor10ReplyIssue(texto, perguntaDoJogador, perception),
    };
}

/**
 * O veredito de uma linha, para caber numa tabela.
 *
 * `inventados` fica FORA do veredito duro de propósito: é heurística, e uma
 * heurística reprovando um candidato numa tabela de comparação decide errado
 * com cara de rigor.
 */
export function reprovou(prova: ProvaDeAlucinacao): boolean {
    return prova.canone || prova.idiomaErrado || prova.issueDoJogo !== null;
}

/** Um resumo curto do que deu errado, para a tela e para o log da bancada. */
export function motivoDaReprovacao(prova: ProvaDeAlucinacao): string {
    const motivos: string[] = [];
    if (prova.canone) motivos.push('cânone');
    if (prova.idiomaErrado) motivos.push('língua errada');
    if (prova.issueDoJogo) motivos.push(prova.issueDoJogo);
    if (prova.discursou) motivos.push('discursou');
    if (prova.inventados.length > 0) motivos.push(`inventou: ${prova.inventados.join(', ')}`);
    return motivos.join(' · ');
}
