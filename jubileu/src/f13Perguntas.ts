/**
 * f13Perguntas.ts — "Perguntas Afiadas": depois da conversa, o jogador escolhe
 * um assunto. Cada morador tem um assunto sensível (ele se fecha e emite
 * `perguntas.aoSuspeitar`), um que corrobora uma pista, e um de sabor.
 * "Citar o que ouvi" cruza as pistas que o jogador já tem com quem também sabe.
 * Nada aqui mexe no Estado13: só lê `e.pistas`.
 */
import { CASAS, CASA_CERTA, type Fala, type IdNpc, type Pista } from './f13Lore';
import type { Estado13 } from './f13Mundo';

export type Assunto = 'casa' | 'barulho' | 'halvard' | 'forasteiros';
export const ROTULO: Readonly<Record<Assunto, string>> = Object.freeze({
    casa: 'a casa de latão', barulho: 'o barulho à noite', halvard: 'o Halvard', forasteiros: 'os forasteiros',
});

/** Gancho para o medidor de atenção (opcional): quem quiser, escuta. */
type OuvinteSuspeita = (quem: IdNpc, assunto: Assunto) => void;
const ouvintes = new Set<OuvinteSuspeita>();
export const perguntas = {
    aoSuspeitar: {
        on(fn: OuvinteSuspeita) { ouvintes.add(fn); return () => { ouvintes.delete(fn); }; },
        emit(quem: IdNpc, assunto: Assunto) { ouvintes.forEach((f) => f(quem, assunto)); },
    },
};

const f = (quem: string, texto: string): Fala => ({ quem, texto });
const runa = (i: number) => CASAS[i].runa;
const R = { fuma: runa(1), luto: runa(5), vazia: runa(6), avo: runa(2), certa: runa(CASA_CERTA), lanterna: runa(4) };

interface Dica { pista: Pista; com: Fala[]; sem: Fala[] }
type Entrada =
    | { tipo: 'sensivel'; falas: Fala[] }
    | { tipo: 'sabor'; falas: Fala[] }
    | { tipo: 'dica'; dica: Dica };

/** Três assuntos por morador; o quarto não é oferecido. */
export const CONVERSA: Readonly<Partial<Record<IdNpc, Partial<Record<Assunto, Entrada>>>>> = Object.freeze({
    ragnhild: {
        casa: { tipo: 'dica', dica: { pista: 'latao',
            com: [f('Ragnhild', 'Latão, já disse. Vi de perto no dia de feira. Dizem que a porta nem range. Porta que não range, meu bem, esconde coisa.')],
            sem: [f('Ragnhild', 'Ah, essa casa. Tem coisa aí, mas conversa boa custa conversa. Circula, escuta, volta.')] } },
        halvard: { tipo: 'sensivel', falas: [f('Ragnhild', 'Do Halvard eu… olha, tenho fogo no fogão. Outro assunto.'), f('Ragnhild', 'Sim, EU calada. Anota a data.')] },
        forasteiros: { tipo: 'sabor', falas: [f('Ragnhild', 'Forasteiro cai aqui uma vez por estação. A cabra ficou dois dias. Comeu meu repolho e foi embora sem agradecer.')] },
    },
    ulfgar: {
        casa: { tipo: 'dica', dica: { pista: 'fumaca',
            com: [f('Ulfgar', 'A chaminé muda… o vento passa por ela e não leva nada. Nem cinza, nem cheiro de pão. Casa que não respira, forasteiro.')],
            sem: [f('Ulfgar', 'Casas têm alma, e as almas têm fumaça. Volta quando o sino tiver tocado, e eu canto o que falta.')] } },
        barulho: { tipo: 'sensivel', falas: [f('Ulfgar', 'A noite tem seus versos… que o escaldo não canta.'), f('Ulfgar', 'Peço perdão. Esta rima eu engoli.')] },
        forasteiros: { tipo: 'sabor', falas: [f('Ulfgar', 'Todo forasteiro é um verso que chegou sem métrica. Uns viram saga. Outros, nota de rodapé.')] },
    },
    eira: {
        casa: { tipo: 'dica', dica: { pista: 'botao',
            com: [f('Eira', 'O botão fica do ladinho da porta amarela! É quentinho de tocar, sabia? Tipo pedra no sol.')],
            sem: [f('Eira', 'Eu sei de uma coisa! Mas só conto pra quem me ajuda. Regra da mamãe.')] } },
        barulho: { tipo: 'sensivel', falas: [f('Eira', 'Não posso falar do barulho. Mamãe disse que dá azar.'), f('Eira', 'Já falei demais! Vou brincar.')] },
        halvard: { tipo: 'sabor', falas: [f('Eira', 'O seu Halvard pega nuvem e não conta pra ninguém o que tem dentro. Eu acho que tem peixe de algodão.')] },
    },
    brokk: {
        casa: { tipo: 'dica', dica: { pista: 'latao',
            com: [f('Brokk', 'Latão. Cobre e zinco, ou não sei. Nunca fundi. Quem fez sabe mais do que eu, e não gosto disso.')],
            sem: [f('Brokk', 'Que casa? Não olho casa, olho ferro.')] } },
        halvard: { tipo: 'sensivel', falas: [f('Brokk', 'Halvard é problema de Halvard.'), f('Brokk', 'Fim de conversa.')] },
        barulho: { tipo: 'sabor', falas: [f('Brokk', 'De noite a bigorna esfria e faz tlim. Só isso. Não me pergunta de outro barulho.')] },
    },
    sigrun: {
        casa: { tipo: 'dica', dica: { pista: 'fumaca',
            com: [f('Sigrun', 'Ah… é que… as ovelhas dão a volta. Sempre. Pela casa sem fogo. Não sei por quê, mas dão.')],
            sem: [f('Sigrun', 'Não sei bem. Eu só… cuido das ovelhas. Desculpa.')] } },
        forasteiros: { tipo: 'sensivel', falas: [f('Sigrun', 'Ah… não… eu não…'), f('Sigrun', 'Desculpa. Preciso ver as ovelhas.')] },
        barulho: { tipo: 'sabor', falas: [f('Sigrun', 'Às vezes de noite escuto um sininho. Bem baixinho. Acho que é sonho.')] },
    },
    torvald: {
        barulho: { tipo: 'dica', dica: { pista: 'botao',
            com: [f('Torvald', 'Noite parada, sem vento, ouço lá da proa. Ding. Uma vez só. Não é sino de templo. Sino de templo tem mais opinião.')],
            sem: [f('Torvald', 'Ouço muita coisa de noite. Vento, mastro, gaivota. Nada que valha o café.')] } },
        halvard: { tipo: 'sensivel', falas: [f('Torvald', 'Não.'), f('Torvald', 'Pergunta pro mar. Ele também não responde.')] },
        forasteiros: { tipo: 'sabor', falas: [f('Torvald', 'Forasteiro, aqui, é gente que ainda acha graça em barco voando. Passa.')] },
    },
    astrid: {
        casa: { tipo: 'dica', dica: { pista: 'latao',
            com: [f('Astrid', 'Três portas de latão na ilha. Uma tem dono e fogo. Uma está de luto. A terceira eu não sei o que abriga. Fica de olho nela.')],
            sem: [f('Astrid', 'Casas são casas. Bate antes de entrar. Só isso que eu te digo.')] } },
        barulho: { tipo: 'sensivel', falas: [f('Astrid', 'Sem comentário.'), f('Astrid', 'E não insista.')] },
        halvard: { tipo: 'sabor', falas: [f('Astrid', 'Halvard é inofensivo. Pesca, cala e volta pra casa. Ultimamente demora mais pra voltar.')] },
    },
});

/** Quem sabe de qual pista, e o detalhe que acrescenta quando o jogador a cita. */
const SABE: Readonly<Partial<Record<IdNpc, Partial<Record<Pista, Fala[]>>>>> = Object.freeze({
    ragnhild: { latao: [f('Ragnhild', 'Ai, então já te contaram! Pois é. E olha: a do Gunnar, a ' + R.fuma + ', também é de latão, ele trocou com um mercador. Só que ali a lareira vive fumegando. Serve não.')] },
    brokk: { latao: [f('Brokk', 'Certo. Latão. Sem emenda, sem marca de martelo. Só uma das amarelas tem botão do lado. Vê qual.')] },
    astrid: {
        latao: [f('Astrid', `Confirmo. São três de latão: a ${R.fuma}, a ${R.luto} e uma que não me diz o que é. A ${R.fuma} tem fogo, a ${R.luto} está de luto. Faz a conta.`)],
        botao: [f('Astrid', `Botão eu conheço em três casas. Na ${R.avo} é campainha de criança, na ${R.lanterna} acende lanterna. Na terceira ninguém explica. Essa me incomoda.`)],
    },
    ulfgar: { fumaca: [f('Ulfgar', `Então ouviu a mesma canção. Sem fumaça eu conto quatro casas: a ${R.avo} apagou por tristeza, a ${R.luto} por luto, a ${R.vazia} por abandono. A quarta apagou por nunca ter acendido.`)] },
    sigrun: { fumaca: [f('Sigrun', `É… isso mesmo. Se… se serve, é a que fica entre a ${R.avo} e a ${R.lanterna}, na ordem da fila. As ovelhas nunca vão lá.`)] },
    torvald: { fumaca: [f('Torvald', 'Certo. Do barco vejo quatro chaminés sem fumo. Uma de luto, uma vazia, uma com avó de cama. A quarta é a estranha. Pintada de amarelo na porta.')] },
    eira: { botao: [f('Eira', 'Isso! O botão! Na casa da vovó faz ÉÉÉ e no da lanterna faz clique. Só o da porta amarela faz DING!')] },
});

export function sabeDe(id: IdNpc, p: Pista): boolean { return !!SABE[id]?.[p]; }

/** Os assuntos que ele oferece, na ordem em que aparecem. */
export function assuntosDe(id: IdNpc): Assunto[] {
    return Object.keys(CONVERSA[id] ?? {}) as Assunto[];
}

export function temPerguntas(id: IdNpc): boolean { return assuntosDe(id).length > 0; }

export interface Resposta { falas: Fala[]; tipo: 'sensivel' | 'dica' | 'sabor' }

export function perguntar(e: Estado13, id: IdNpc, a: Assunto): Resposta | null {
    const ent = CONVERSA[id]?.[a];
    if (!ent) return null;
    if (ent.tipo === 'sensivel') { perguntas.aoSuspeitar.emit(id, a); return { falas: ent.falas, tipo: 'sensivel' }; }
    if (ent.tipo === 'sabor') return { falas: ent.falas, tipo: 'sabor' };
    return { falas: e.pistas.has(ent.dica.pista) ? ent.dica.com : ent.dica.sem, tipo: 'dica' };
}

/** As pistas que o jogador pode citar. */
export const citaveis = (e: Estado13): Pista[] => [...e.pistas];

/** Cita uma pista já ouvida: quem sabe confirma e acrescenta; quem não sabe, não. */
export function citar(e: Estado13, id: IdNpc, p: Pista): Fala[] {
    if (!e.pistas.has(p)) return [f(id, '…não sei do que você está falando.')];
    const d = SABE[id]?.[p];
    return d ?? [f(npcNome(id), SEM_NOCAO[id] ?? 'Isso eu não sei te dizer.')];
}
const npcNome = (id: IdNpc) => id.charAt(0).toUpperCase() + id.slice(1);
const SEM_NOCAO: Readonly<Partial<Record<IdNpc, string>>> = Object.freeze({
    ragnhild: 'Essa eu ainda não tinha ouvido! Depois me conta o resto.',
    ulfgar: 'Bela estrofe. Mas não é minha.',
    eira: 'Hm? Não sei disso não.',
    brokk: 'Não sei. Pergunta a outro.',
    sigrun: 'Ah… não sei. Desculpa.',
    torvald: 'Não vi. Não ouvi.',
    astrid: 'Não tenho isso. Segue procurando.',
});
