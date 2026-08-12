// ── UMA CORRIDA CONTRA O RELÓGIO QUE LIMPA O RELÓGIO ──────────────────────
//
// O padrão estava copiado em quatro lugares (memória ×2, reflexo ×2):
//
//     await Promise.race([
//         trabalho(),
//         new Promise((r) => setTimeout(() => r(null), teto)),
//     ]);
//
// Ele funciona — e VAZA. Quando o trabalho responde antes do teto, a corrida
// resolve, mas o `setTimeout` continua armado até o fim: um temporizador
// pendurado, segurando o fecho, por chamada.
//
// Isso era quase inofensivo enquanto só a conversa usava. Deixou de ser quando
// o MOTOR passou a classificar por vetor: `vetorDoTexto` é chamada a cada
// rodada de deliberação, para sempre, e cada rodada deixava um temporizador de
// 2,5 s para trás. Numa partida longa isso é lixo que só some quando a aba
// fecha — e o defeito não aparece em teste nenhum, porque tudo "funciona".
//
// Aqui a corrida cancela o temporizador nos dois desfechos.
export const TETO_ESTOUROU = Symbol('teto');

/**
 * Espera `trabalho` até `tetoMs`. Devolve `TETO_ESTOUROU` se o tempo acabar
 * primeiro — um símbolo, e não `null`, para quem chama distinguir "demorou" de
 * "respondeu vazio". As duas coisas exigem tratamento diferente e a versão
 * antiga as confundia.
 */
export async function comTeto<T>(
    trabalho: Promise<T>,
    tetoMs: number,
): Promise<T | typeof TETO_ESTOUROU> {
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            trabalho,
            new Promise<typeof TETO_ESTOUROU>((resolve) => {
                temporizador = globalThis.setTimeout(() => resolve(TETO_ESTOUROU), tetoMs);
            }),
        ]);
    } finally {
        // O `finally` roda nos três desfechos: trabalho pronto, teto estourado
        // e trabalho que LANÇOU. Sem ele, o caso do erro vazava igual.
        if (temporizador !== undefined) globalThis.clearTimeout(temporizador);
    }
}
