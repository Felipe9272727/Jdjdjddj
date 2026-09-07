/**
 * f3Decupagem.ts — a DECUPAGEM da cutscene da queda do Diabrete: o palco onde
 * ela é encenada e a lista de planos de câmera, plano a plano, fala a fala.
 *
 * ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────────
 *
 * A cena tinha UM plano. `topDownBeg` era chamado do começo ao fim da fase de
 * súplica — e essa fase segura as oito falas do Diabrete e depois espera o
 * jogador escolher. Medido na bancada: a câmera saiu de [0.32, 2.46, 1.19] e
 * chegou, vinte e quatro segundos depois, em [0.32, 2.36, 1.30]. Onze centésimos
 * de metro. O Diabrete ANIMAVA (tremor, escorregões, pernas pedalando — isso
 * estava lá e funcionava), mas ninguém filmava: era um tripé parafusado no chão
 * com uma caixa de diálogo por cima.
 *
 * Um desenho de 1930 não faz isso. Ele CORTA — duro, sem transição — e cada
 * corte tem um motivo: o plano alto diz "eu tenho você", o contra-plongée do
 * abismo diz "e não há nada embaixo", o primeiríssimo plano diz "olhe nos olhos
 * dele". Aqui cada fala ganha o seu plano, e a troca de fala É o corte.
 *
 * ── POR QUE EM MÓDULO SEPARADO ───────────────────────────────────────────────
 *
 * Porque assim dá para TESTAR o que uma foto não mostra: que nenhum plano enfia
 * a câmera dentro de uma laje (foi o que produziu um quadro inteiramente preto
 * no meio da cutscene), que cada fala tem um plano, que trocar de fala mexe a
 * câmera de verdade, e que o Diabrete nunca sai do enquadramento.
 */

import { type F3Plat } from './f3Parkour';

// ── O PALCO ──────────────────────────────────────────────────────────────────
// A cutscene não acontece na escadaria viva: ela monta o próprio pedacinho de
// mapa, com as MESMAS regras do gerador (vãos ~3,0–3,8, degrau 0,4–1,4, desvio
// lateral ±1,9, pegadas de {1,0 1,2 1,4}), só que DESCENDO — a escalada
// desabando para dentro do abismo em que ele está pendurado. A primeira laje é
// a grandona em que ele se agarra.
export function construirLajesDaCutscene(): F3Plat[] {
    let seed = 0x1a2b3c4d | 0;
    const rng = () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const rand = (a: number, b: number) => a + (b - a) * rng();
    const HALF = [1.0, 1.2, 1.4], X_LIMIT = 11;
    const mk = (id: number, bx: number, cz: number, topY: number, half: number, palette: number): F3Plat =>
        ({ id, bx, cz, hw: half, hd: half, h: 0.6, topY, moving: false, amp: 0, phase: 0,
          tipo: id === 0 ? 'descanso' : 'passo', x: bx, dx: 0, palette });

    const lajes: F3Plat[] = [mk(0, 0, -2.4, 0, 2.4, 0)];
    let bx = 0, cz = -2.4, topY = 0;
    for (let i = 1; i < 11; i++) {
        const half = HALF[Math.floor(rng() * HALF.length)];
        cz += rand(3.0, 3.8) + half;
        topY -= rand(0.4, 1.4);
        bx += i === 1 ? -2.6 : rand(-1.9, 1.9);
        bx = Math.max(-X_LIMIT + half, Math.min(X_LIMIT - half, bx));
        lajes.push(mk(i, bx, cz, topY, half, i % 6));
    }
    return lajes;
}

export const LAJES_DA_CUTSCENE: readonly F3Plat[] = Object.freeze(construirLajesDaCutscene());

/** A caixa que uma laje ocupa no espaço do palco (coordenadas do `ledgeRef`).
 *  Inclui a BORDA DE TINTA, que é geometria de verdade e mais larga que o
 *  tampo — a câmera entrar nela é tão preto quanto entrar na laje. */
export function caixaDaLaje(p: F3Plat): {
    x0: number; x1: number; y0: number; y1: number; z0: number; z1: number;
} {
    const borda = (p.palette < 0 ? 0.5 : 0.42) / 2;   // metade do alargamento (PlatformView.rim)
    const fundo = p.topY - 0.05 - p.h * 1.15;         // base do bloco de tinta
    return {
        x0: p.bx - p.hw - borda, x1: p.bx + p.hw + borda,
        y0: fundo, y1: p.topY,
        z0: p.cz - p.hd - borda, z1: p.cz + p.hd + borda,
    };
}

/** A câmera está DENTRO de alguma laje? (É isto que pinta o quadro de preto.) */
export function dentroDeAlgumaLaje(
    x: number, y: number, z: number, lajes: readonly F3Plat[] = LAJES_DA_CUTSCENE,
): boolean {
    for (const p of lajes) {
        const c = caixaDaLaje(p);
        if (x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1 && z >= c.z0 && z <= c.z1) return true;
    }
    return false;
}

// ── OS PLANOS ────────────────────────────────────────────────────────────────

/** Onde a cena está montada, em coordenadas de mundo. */
export interface Palco {
    gx: number;        // X da borda em que ele se agarra
    gripY: number;     // Y do tampo (a beirada)
    edgeZ: number;     // Z em que ele pendura (lado do abismo)
    hangY: number;     // Y do corpo pendurado
}

export interface Plano {
    x: number; y: number; z: number;      // posição da câmera
    lx: number; ly: number; lz: number;   // para onde ela olha
    fov: number;
}

/**
 * A cabeça dele — MEDIDA, não estimada.
 *
 * Eu tinha escrito `gripY − 0.35`, lido de uma foto. A sonda da bancada leu o
 * osso da cabeça no mundo e devolveu `gripY + 0.04` durante a súplica: ele
 * pendura com a cara NO NÍVEL DO CONVÉS, não abaixo dele. Quarenta centímetros
 * de erro, e o primeiro plano estava mirando no peito dele.
 *
 * O número sai de `PENDURADO_ATE_A_CABECA`, que é a distância do tampo até a
 * cabeça no jeito em que ele fica pendurado — assim, se a encenação mudar (e ela
 * vai: ele ainda precisa pendurar mais baixo), este arquivo acompanha.
 */
export const PENDURADO_ATE_A_CABECA = -0.04;
export const alturaDaCabeca = (p: Palco) => p.gripY - PENDURADO_ATE_A_CABECA;

export type NomeDoPlano = 'alto' | 'raso' | 'close' | 'corpo';

// ── DE ONDE DÁ PARA FILMAR ESTE PALCO ────────────────────────────────────────
//
// A primeira lista de planos tinha um contra-plongée lindo — de baixo, olhando
// para cima, com o abismo em volta. Ele saiu PRETO. E o close também, e o
// perfil: três dos catorze quadros da bancada eram tela preta.
//
// O motivo não é de câmera, é de encenação — mas não é o que eu escrevi da
// primeira vez. Eu disse que a cabeça dele batia na borda de tinta da laje;
// depois MEDI o osso da cabeça e ele está em `gripY + 0.04`, ou seja no nível
// do convés, acima da borda inteira. A explicação estava errada.
//
// O que realmente escurece o quadro é a BARRIGA da laje. O tampo tem 5 m de
// fundura e um bloco de tinta por baixo; qualquer câmera abaixo do convés
// olhando para cima tem esse bloco como CÉU, e o Diabrete é um cocuruto no meio
// dele. Não é a cabeça contra a parede: é a parede ocupando o quadro inteiro.
//
// A regra que resolve é a mesma, e agora pelo motivo certo: filmar DE CIMA. E é
// também o que a cena quer dizer — ele está ABAIXO de você, e quem decide é
// você. Todo plano olha para baixo, e o teste cobra isso.
export const FUNDO_DA_BORDA = 0.74;   // o bloco de tinta desce isto abaixo do tampo

/**
 * `deriva` é o único movimento dentro de um plano: um empurrãozinho lento, para
 * o plano não ser uma fotografia. Quem conta a história é o CORTE.
 */
export function plano(nome: NomeDoPlano, p: Palco, deriva = 0): Plano {
    const d = Math.max(0, Math.min(1, deriva));
    const cabeca = alturaDaCabeca(p);
    switch (nome) {
        // O PLANO DE CIMA — o ponto de vista do jogador debruçado na beirada.
        // Diz "eu tenho você" e mostra a mãozinha agarrada, que é o que a
        // escolha PISAR vai esmagar. Abre e fecha a cena.
        case 'alto': return {
            x: p.gx + 0.7, y: p.gripY + 2.7 - d * 0.45, z: p.edgeZ - 1.7 + d * 0.35,
            lx: p.gx, ly: p.gripY - 0.45, lz: p.edgeZ, fov: 48,
        };
        // O PLANO DE DEUS — lá de cima, quase a prumo. Ele vira um pontinho
        // agarrado numa laje branca e embaixo aparece a escadaria inteira
        // desabando. É o plano das falas secas do jogador: a resposta à súplica
        // é a altura.
        case 'raso': return {
            x: p.gx + 1.5, y: p.gripY + 6.4 - d * 0.7, z: p.edgeZ + 0.8 + d * 0.2,
            lx: p.gx, ly: p.gripY - 0.6, lz: p.edgeZ, fov: 52,
        };
        // PRIMEIRÍSSIMO PLANO — o jogador ajoelhado na beirada, a cara dele
        // enchendo o quadro. Vem de CIMA da borda, olhando para baixo, que é o
        // único jeito de a cabeça de tinta não cair em cima da borda de tinta.
        // A PRIMEIRA VERSÃO DESTE CLOSE TAMBÉM SAIU PRETA. Ela vinha de FORA da
        // beirada (z = edgeZ + 1,05) e olhava para TRÁS — e atrás dele está a
        // face de tinta da laje. Não bastava "olhar de cima": tem de olhar de
        // cima e PARA FORA, com o vazio atrás da cabeça. É o mesmo eixo do
        // plano `alto`, que a bancada já provou que lê, só que empurrado e com
        // lente mais longa. Agora quem cobra isso é `fundoLimpoAtrasDaCabeca`.
        // A LENTE ESTAVA APERTADA DEMAIS. A 1,9 m com fov 31, a cabeça dele
        // ocupava 60% da altura do quadro — e ele NÃO fica parado: a súplica tem
        // solavanco de 24 cm a cada 2,4 s. Num deles a cabeça preta tomou a tela
        // inteira e o quadro virou uma mancha. Um primeiro plano precisa de folga
        // para o personagem se mexer dentro dele.
        // ...E ELE VEM DO OUTRO LADO. Abrir a lente sem mais nada aproximava o
        // close do `alto`: 1,31 m entre os dois, o que não é um corte, é um
        // passinho — e o teste do corte cobrou. Botar a câmera do lado oposto
        // resolve as duas coisas de uma vez: vira CONTRA-PLANO (corte de
        // verdade, 2,4 m) e ainda dá a variação de ângulo que a cena precisa.
        case 'close': return {
            x: p.gx - 1.25, y: p.gripY + 1.7 - d * 0.24, z: p.edgeZ - 0.9 + d * 0.2,
            lx: p.gx, ly: cabeca - 0.15, lz: p.edgeZ, fov: 42,
        };
        // ── O PLANO QUE FALTAVA: ELE INTEIRO ────────────────────────────
        //
        // Toda a atuação da súplica — as pernas pedalando, a mão que solta a
        // beirada e suplica, o corpo cedendo a cada solavanco — acontece ABAIXO
        // do tampo. E nenhum plano mostrava isso, por um motivo que é geometria
        // e não descuido: quem está EM CIMA do convés não consegue ver embaixo
        // da beirada. A linha de visão desce e entra na laje antes de sair dela.
        // É a mesma coisa que estar de pé numa sacada: dá para ver o que está
        // além da borda, não o que está pendurado sob ela.
        //
        // (Foi por isso que eu quase fui pendurar o Diabrete mais baixo, com
        // braços de borracha. Não era preciso: o boneco nunca esteve errado, era
        // a lista de planos que não tinha nenhum de onde ele fosse visível.)
        //
        // Este vem de FORA e de cima, a uns quatro metros e meio, e enquadra do
        // punho ao pé. É onde a animação que já existia finalmente aparece.
        // `veOCorpoInteiro` cobra isso: a linha até os pés dele não pode
        // atravessar a laje.
        // A ALTURA SEPARA. A 3,6 m e quase na altura do tampo, as pernas dele
        // liam lindamente mas o tronco fundia com a massa preta da laje vista de
        // canto — tinta sobre tinta outra vez, agora num plano diferente. Subir
        // meio metro e afastar meio metro põe a beirada ABAIXO da linha de
        // visão, e ele fica inteiro recortado contra o vazio.
        default: return {
            x: p.gx + 2.35 + d * 0.3, y: p.gripY + 1.95 + d * 0.2, z: p.edgeZ + 2.85 + d * 0.22,
            lx: p.gx, ly: p.gripY - 0.95, lz: p.edgeZ, fov: 41,
        };
    }
}

/**
 * A DECUPAGEM: que plano acompanha cada fala.
 *
 * Oito falas, cinco trocas de plano. A regra que eu segui:
 *   • fala do DIABRETE suplicando   → `close` (a atuação é o assunto)
 *   • fala seca do JOGADOR          → `alto` ou `perfil` (distância, desdém)
 *   • a primeira e a última         → `alto`, porque abrem e fecham na mesma
 *                                     geometria: a mão dele ao alcance do pé.
 */
export const DECUPAGEM_DA_SUPLICA: readonly NomeDoPlano[] = Object.freeze([
    'alto',     // 0 — "E-EI! Não vai embora não!"        (estabelece)
    'corpo',    // 1 — "…por que eu ajudaria?"            (veja o que ele tem embaixo)
    'close',    // 2 — "A gente tava só BRINCANDO"        (a lábia)
    'raso',     // 3 — "Você jogou espinhos em mim."      (a piada precisa do vazio)
    'close',    // 4 — "eu tenho família!"                (a mentira maior)
    'corpo',    // 5 — "Você apareceu faz cinco minutos." (as perninhas pedalando)
    'close',    // 6 — "T-tá, menti. MAS…"                (a confissão)
    'alto',     // 7 — "Me salva… ou pisa?"               (a escolha, na mão dele)
]);

/** O plano da fala `linha`. Fora da lista, volta ao plano de cima — que é o
 *  único que sempre funciona, porque é o ponto de vista de quem está jogando. */
export function planoDaSuplica(linha: number, p: Palco, deriva = 0): Plano {
    const nome = DECUPAGEM_DA_SUPLICA[linha] ?? 'alto';
    return plano(nome, p, deriva);
}


// ── A BARRIGA DA LAJE ────────────────────────────────────────────────────────
//
// Aqui morava `fundoLimpoAtrasDaCabeca`, que traçava o raio da câmera pela
// cabeça do Diabrete e cobrava que ele não batesse na laje. A ideia era boa e a
// PREMISSA era falsa: eu tinha a cabeça dele 40 cm baixa demais, chutada de uma
// foto. Com a altura medida, o raio passa raspando o TAMPO — que é creme, e um
// fundo ótimo. O teste continuaria reprovando planos bons e aprovando ruins.
//
// O que de fato escurece o quadro é mais simples, e por isso mesmo é o que
// ficou: a laje tem 5 m de fundura e um bloco de tinta por baixo. Qualquer
// câmera abaixo do convés olhando para o Diabrete tem essa barriga como CÉU.
// Uma linha resolve, e é exatamente a linha que a cena quer: filme de cima.
export function acimaDoConves(p: Palco, c: Plano): boolean {
    return c.y > p.gripY;
}


// ── DÁ PARA VER O CORPO DELE? ────────────────────────────────────────────────
//
// Quem está em cima do convés não vê o que está pendurado sob a beirada: a
// linha de visão desce e entra na laje. Por isso os planos de rosto (`alto`,
// `close`) mostram só a cabeça dele por cima da borda — e isso está certo, é o
// que eles são. Mas alguma coisa tinha de mostrar as pernas pedalando, e é o
// `corpo`. Isto garante que ele cumpre a função: o segmento que vai da câmera
// até os PÉS dele não pode atravessar a laje da beirada.
export function veOCorpoInteiro(p: Palco, c: Plano): boolean {
    const b = caixaDaLaje(LAJES_DA_CUTSCENE[0]);
    const ox = p.gx, oy = p.gripY, oz = p.edgeZ - 0.35;
    const cx0 = b.x0 + ox, cx1 = b.x1 + ox;
    const cy0 = b.y0 + oy, cy1 = b.y1 + oy;
    const cz0 = b.z0 + oz, cz1 = b.z1 + oz;

    const dx = p.gx - c.x, dy = p.hangY - c.y, dz = p.edgeZ - c.z;   // até os pés
    let t0 = 0, t1 = 1;                                              // segmento, não raio
    const eixo = (o: number, dd: number, lo: number, hi: number) => {
        if (Math.abs(dd) < 1e-9) return o >= lo && o <= hi;
        let a = (lo - o) / dd, bq = (hi - o) / dd;
        if (a > bq) { const t = a; a = bq; bq = t; }
        t0 = Math.max(t0, a); t1 = Math.min(t1, bq);
        return t0 <= t1;
    };
    if (!eixo(c.x, dx, cx0, cx1)) return true;
    if (!eixo(c.y, dy, cy0, cy1)) return true;
    if (!eixo(c.z, dz, cz0, cz1)) return true;
    return t0 > t1;
}


// ═════════════════════════════════════════════════════════════════════════════
// A APRESENTAÇÃO — quando as portas abrem e ele se apresenta
// ═════════════════════════════════════════════════════════════════════════════
//
// Fotografada pela bancada pela primeira vez, e o diagnóstico foi o mesmo da
// súplica com um agravante. A câmera é UMA só, colada num close da cara dele,
// segurando as nove falas inteiras. E ele ESTÁ ATUANDO — aponta, se inclina,
// abre os braços, gargalha — só que o corpo inteiro fica FORA DO QUADRO. A
// animação existe, é boa, e ninguém vê.
//
// Aqui a regra que manda não é "de onde dá para filmar" (como no abismo da
// súplica): é O CORPO TEM DE CABER. Em rubber-hose a atuação está no corpo
// inteiro, então quase todo plano é de corpo, e close é tempero.

export interface PalcoDaApresentacao {
    /** Onde ele planta os pés (o STAND do Floor3Cutscene). */
    x: number; y: number; z: number;
    /** Onde o jogador está, olhando para ele. */
    jogadorZ: number;
}

export const PALCO_DA_APRESENTACAO: PalcoDaApresentacao =
    Object.freeze({ x: 0.9, y: 0, z: -9.2, jogadorZ: -13 });

/** A altura dele no mundo (modelo ~1,0 × DIABRETE_SCALE). */
export const ALTURA_DO_DIABRETE = 2.2;

export type NomeDaApresentacao = 'apresenta' | 'medio' | 'perto' | 'escadaria' | 'pincel';

export function planoDeApresentacao(
    nome: NomeDaApresentacao, p: PalcoDaApresentacao = PALCO_DA_APRESENTACAO, deriva = 0,
): Plano {
    const d = Math.max(0, Math.min(1, deriva));
    switch (nome) {
        // O ESTABELECIMENTO — o ponto de vista de quem acabou de sair do
        // elevador. Ele na plataforma e a escadaria inteira atrás.
        case 'apresenta': return {
            // A DERIVA RECUA, não avança: avançando ela fechava o quadro (o
            // plano de corpo perdia a folga do gesto) e ainda encostava no plano
            // seguinte, deixando o corte com menos de um metro — o que não é
            // corte, é um passinho.
            x: p.x - 0.7, y: 2.5 - d * 0.12, z: p.jogadorZ - 0.2 - d * 0.35,
            lx: p.x, ly: p.y + 1.05, lz: p.z, fov: 55,
        };
        // O PLANO DE CORPO — o normal desta cena. Ele inteiro, do chapéu ao
        // sapato, com espaço para o braço que aponta.
        // (Estava a 3,1 m com fov 44 e abraçava 2,55 m — quinze centímetros a
        //  menos que a folga que o teste exige, ou seja, cortava o gesto quando
        //  ele levanta o braço. Meio metro atrás e dois graus mais aberto.)
        case 'medio': return {
            x: p.x - 0.9, y: 1.95 - d * 0.1, z: p.jogadorZ + 0.45 - d * 0.3,
            lx: p.x, ly: p.y + 1.05, lz: p.z, fov: 46,
        };
        // A ESCADARIA — três quartos de lado, com o curso no quadro. É o plano
        // da fala em que ele diz que o lugar é dele: o assunto é o LUGAR.
        // ── O PLANO DE BAIXO, E POR QUE ELE NÃO É DE LADO ────────────────
        //
        // Este plano nasceu lateral, para a escadaria entrar no quadro junto com
        // ele. A 3,9 m para o lado a câmera caiu DENTRO DO POÇO do elevador:
        // quatro quadros de marrom chapado, no meio da fala mais importante da
        // cena. Empurrei 1,2 m para a frente e continuou dentro — o poço é mais
        // fundo do que eu supus, e eu estava adivinhando onde a parede acaba.
        //
        // Então ele deixou de ser lateral. Câmera BAIXA, no eixo, olhando para
        // cima: o vão da porta é o único corredor que garantidamente não tem
        // parede, e um contra-plongée diz exatamente o que a fala diz — o lugar
        // é dele. A escadaria entra atrás pelo fundo, não pelo lado.
        case 'escadaria': return {
            x: p.x - 0.4, y: 0.75 + d * 0.12, z: p.jogadorZ + 0.6 + d * 0.3,
            lx: p.x, ly: p.y + 1.5, lz: p.z, fov: 58,
        };
        // O PINCEL — mais perto e do lado direito dele, que é onde o pincel
        // está preso. É o plano da fala que ensina a mecânica do andar.
        case 'pincel': return {
            x: p.x + 1.9, y: 1.7 - d * 0.08, z: p.jogadorZ + 1.7 + d * 0.2,
            lx: p.x + 0.35, ly: p.y + 1.15, lz: p.z, fov: 38,
        };
        // O CLOSE — tempero, para a ameaça e para a gargalhada.
        default: return {
            x: p.x - 0.35, y: 1.85 - d * 0.08, z: p.jogadorZ + 1.9 + d * 0.25,
            lx: p.x, ly: p.y + 1.35, lz: p.z, fov: 36,
        };
    }
}

/**
 * A DECUPAGEM DA APRESENTAÇÃO, fala a fala (`diabreteScript`).
 *
 * A lógica: quem fala do LUGAR ganha o lugar no quadro; quem ameaça ganha a
 * cara; quem ensina a regra do jogo ganha o pincel; e a corrida final precisa de
 * plano aberto para a arrancada caber.
 */
export const DECUPAGEM_DA_APRESENTACAO: readonly NomeDaApresentacao[] = Object.freeze([
    'apresenta',  // 0 — "Olha só o que o elevador cuspiu!"
    'medio',      // 1 — "Que… que diabo é você?"
    'medio',      // 2 — "DIABO é meu sobrenome!"        (ele aponta: corpo)
    'escadaria',  // 3 — "Essa escadaria é MINHA"        (o assunto é o lugar)
    'perto',      // 4 — "Vou desenhar o teu fracasso"   (a ameaça, na cara)
    'medio',      // 5 — "Bora apostar corrida?"
    'perto',      // 6 — "HÁ! Me alcança, perna-curta!"  (a gargalhada)
    'pincel',     // 7 — "sem os meus PINCÉIS…"          (a regra do jogo)
    'apresenta',  // 8 — "Até já… ou nunca! WHOOSH!"     (a arrancada)
]);

export function planoDaApresentacao(
    linha: number, p: PalcoDaApresentacao = PALCO_DA_APRESENTACAO, deriva = 0,
): Plano {
    return planoDeApresentacao(DECUPAGEM_DA_APRESENTACAO[linha] ?? 'medio', p, deriva);
}

/** Quantos metros de altura o quadro abraça, à distância do sujeito. */
export function alturaEnquadrada(c: Plano, p: PalcoDaApresentacao = PALCO_DA_APRESENTACAO): number {
    const dist = Math.hypot(c.x - p.x, c.y - (p.y + ALTURA_DO_DIABRETE / 2), c.z - p.z);
    return 2 * dist * Math.tan((c.fov * Math.PI) / 180 / 2);
}


/**
 * A câmera está fora do poço do elevador?
 *
 * O jogador chega parado no vão da porta (`jogadorZ`), com a cabine atrás dele e
 * as paredes dos dois lados. Quem quiser filmar DE LADO tem de ter saído também
 * para a FRENTE — senão entra na parede, que é exatamente o que aconteceu com o
 * plano da escadaria: quatro quadros de marrom chapado no meio da fala em que
 * ele diz que a escadaria é dele.
 */
export function foraDoPoco(c: Plano, p: PalcoDaApresentacao = PALCO_DA_APRESENTACAO): boolean {
    const paraOLado = Math.abs(c.x - p.x);
    if (paraOLado <= 2.2) return c.z >= p.jogadorZ - 1.2;   // no eixo, o vão é livre
    // DE LADO A FOLGA É MUITO MAIOR do que eu tinha posto. Um plano a 3,4 m para
    // o lado e a 1,2 m à frente da porta AINDA saiu dentro da parede — medido na
    // bancada, não deduzido. Quem sai do eixo tem de estar praticamente na altura
    // dele, já na plataforma, e não no vão.
    return c.z >= p.z - 1.0;
}
