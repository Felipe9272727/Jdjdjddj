/**
 * f13Sinos.tsx — "afinar os sinos" da torre do Andar 13 (Vindhjem).
 *
 * O sino grande já existe na torre (SINO, em f13Mundo.ts, desenhado pelo
 * Floor13Mundo). Aqui não se modela sino nenhum: a gente ACHA essa malha na
 * cena, CLONA a geometria e o material dela duas vezes e pendura os dois
 * menores na MESMA viga — escalas .7 e .5. Nenhuma primitiva solta.
 *
 * Mecânica: o Brokk, o ferreiro da forja, conhece a ordem de três notas. O
 * jogador toca os sinos na sequência: acertar a trinca acende a porta certa
 * por três segundos (recompensa que NÃO entrega o puzzle — a porta continua
 * trancada); errar faz o som desafinar e volta a sequência ao primeiro sino.
 *
 * Som: WebAudio puro, sem arquivo nenhum, com parciais inarmônicos
 * (1, 2.76, 5.4) e cauda exponencial.
 *
 * Estado num objeto de módulo `sinos`, igual ao padrão de `busca` em
 * f13Busca.tsx — o Floor13 lê daqui o alvo do radar, o rótulo do botão e o
 * tempo do brilho. O componente <SinosDaTorre/> devolve null: não desenha
 * nada no JSX, só usa useFrame para pendurar os clones e rodar o relógio.
 */
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { brilhoDoLatao } from './Floor13Portas';
import { brilhoDosSinos } from './Floor13Mundo';
import { LUGAR_DAS_CASAS, SINO, chaoEm, portaNoMundo } from './f13Mundo';

// ── AS TRÊS NOTAS ────────────────────────────────────────────────────────────
/** 0 = grave (o sino grande da torre), 1 = médio (.5), 2 = agudo (.38). */
export const NOMES_DAS_NOTAS: ReadonlyArray<string> = ['grave', 'médio', 'agudo'];
/** Escala de cada sino. O de índice 0 é o da torre; os outros dois são clones dele. */
const ESCALA: ReadonlyArray<number> = [1, .5, .38];
/** Altura (Hz) de cada voz: F3, C4, G4 — uma tríade aberta, não um acorde. */
const FREQ: ReadonlyArray<number> = [174.61, 261.63, 392];
/** Deslocamento de cada sino ao longo da viga, relativo ao grande (m). */
const PASSOS: ReadonlyArray<number> = [0, -.9, .9];   // os menores, sob as travessas laterais
/**
 * Direção da viga da torre no mundo. Se, ao ver a torre montada, os dois
 * menores aparecerem atravessados na viga, troque por (0, 0, 1) — é o único
 * ajuste de orientação, e não muda mais nada do minigame.
 */
const DIR_DA_VIGA = new THREE.Vector3(0, 0, 1);
/** Alcance (no plano do chão) para o jogador poder tocar um sino. */
export const ALCANCE_DO_SINO = 2.2;
/** Segundos de brilho na porta certa quando a melodia fecha. */
const BRILHO = 7;
/** Chute de altura do sino grande, só até achar a malha real na cena. */
const ALTURA_PALPITE = 3.4;

// ── ONDE CADA SINO ESTÁ ──────────────────────────────────────────────────────
export interface LugarDoSino { x: number; y: number; z: number }

/** Chute inicial da altura do bronze, alinhado ao topo da torre em SINO. */
const ALTURA_Y = (chaoEm(SINO.x, SINO.z) ?? 0) + ALTURA_PALPITE;

/**
 * Onde os três sinos estão no mundo. O radar do Floor13 lê daqui; o y é a
 * altura do bronze (o alcance é medido no chão, só com x e z).
 */
export const LUGARES: LugarDoSino[] = [
    { x: SINO.x + DIR_DA_VIGA.x * PASSOS[0], y: ALTURA_Y, z: SINO.z + DIR_DA_VIGA.z * PASSOS[0] },
    { x: SINO.x + DIR_DA_VIGA.x * PASSOS[1], y: ALTURA_Y, z: SINO.z + DIR_DA_VIGA.z * PASSOS[1] },
    { x: SINO.x + DIR_DA_VIGA.x * PASSOS[2], y: ALTURA_Y, z: SINO.z + DIR_DA_VIGA.z * PASSOS[2] },
];

/** Reancora os três lugares a partir do pivô do sino grande — quando a malha real aparece. */
function reancorar(x: number, y: number, z: number): void {
    for (let i = 0; i < 3; i++) {
        LUGARES[i].x = x + PASSOS[i] * DIR_DA_VIGA.x;
        LUGARES[i].y = y + PASSOS[i] * DIR_DA_VIGA.y;
        LUGARES[i].z = z + PASSOS[i] * DIR_DA_VIGA.z;
    }
}

// ── O SOM (WebAudio, sem arquivo) ────────────────────────────────────────────
/**
 * Os parciais inarmônicos do bronze: a fundamental, o sobre-tom de 2.76 e o
 * chiado de 5.4 — a assinatura de um sino de verdade, não de uma senoide.
 */
const PARCIAIS: ReadonlyArray<number> = [1, 2.76, 5.4];
/** Peso de cada parcial: o mais agudo é chiado fino, não um segundo sino. */
const PESOS: ReadonlyArray<number> = [1, .38, .14];
/** Quanto uma badalada demora a morrer (s), no sino grave. */
const CAUDA = 2.8;

let ctx: AudioContext | null = null;
let mestre: GainNode | null = null;

/**
 * O AudioContext nasce no primeiro toque (o navegador só libera som com um
 * gesto). Só existe um por página, guardado no módulo.
 */
function audio(): AudioContext | null {
    if (ctx) {
        if (ctx.state === 'suspended') void ctx.resume();
        return ctx;
    }
    const janela = window as unknown as {
        AudioContext?: typeof AudioContext;
        webkitAudioContext?: typeof AudioContext;
    };
    const AC = janela.AudioContext ?? janela.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    mestre = ctx.createGain();
    mestre.gain.value = .45;   // três parciais por badalada: folga para não estourar
    mestre.connect(ctx.destination);
    return ctx;
}

/**
 * Uma badalada. `desafinada` é o erro: a fundamental sai do lugar e escorrega
 * para baixo no meio da cauda — o bronze "chora" em vez de cantar.
 */
function badalada(nota: number, desafinada = false): void {
    const ac = audio();
    if (!ac || !mestre) return;
    const t = ac.currentTime;
    const f0 = FREQ[nota] * (desafinada ? 1.06 : 1);
    const cauda = (desafinada ? 1.2 : CAUDA) * (1 - nota * .16);   // o pequeno morre antes
    const voz = ac.createGain();
    voz.gain.value = desafinada ? .15 : .2;
    voz.connect(mestre);
    for (let p = 0; p < PARCIAIS.length; p++) {
        const dur = cauda / (1 + p * .45);              // o parcial agudo morre primeiro
        const f = f0 * PARCIAIS[p];
        const osc = ac.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, t);
        if (desafinada) osc.frequency.exponentialRampToValueAtTime(f * .9, t + dur * .5);
        const peso = ac.createGain();
        peso.gain.setValueAtTime(1e-4, t);
        peso.gain.exponentialRampToValueAtTime(PESOS[p], t + .006);   // ataque curto do martelo
        peso.gain.exponentialRampToValueAtTime(1e-4, t + dur);        // cauda exponencial
        osc.connect(peso);
        peso.connect(voz);
        osc.start(t);
        osc.stop(t + dur + .05);
    }
}

// ── O ESTADO ─────────────────────────────────────────────────────────────────
/** A melodia da torre: três notas (0..2), sem duas iguais seguidas. */
function novaMelodia(): number[] {
    const m: number[] = [];
    while (m.length < 3) {
        const n = Math.floor(Math.random() * 3);
        if (m.length > 0 && m[m.length - 1] === n) continue;
        m.push(n);
    }
    return m;
}

/** Estado compartilhado — o Floor13 lê isto para o radar, o botão e o aviso. */
export const sinos = {
    /** ordem que a torre quer: três notas de 0 (grave) a 2 (agudo) */
    melodia: novaMelodia(),
    /** em que nota da melodia o jogador está (0..3; 3 = fechou) */
    passo: 0,
    /** o Brokk já soprou a melodia? antes disso o sino canta, mas não conta */
    pista: false,
    /** a melodia já fechou alguma vez */
    resolvido: false,
    /** segundos que ainda restam de brilho na porta certa */
    brilho: 0,
    /** o aviso da última badalada, e quanto tempo ele ainda vive */
    aviso: '',
    avisoTempo: 0,
};

/** Guarda o recado que o HUD mostra, e por quanto tempo. */
function avisar(texto: string, tempo: number): void {
    sinos.aviso = texto;
    sinos.avisoTempo = tempo;
}

/** O Brokk conta a melodia (chamar quando o jogador fala com ele). */
export function revelarMelodia(): void {
    if (sinos.pista) return;
    sinos.pista = true;
    sinos.passo = 0;
}

/** A pista do Brokk, em palavras — é a única fonte da ordem. */
export function falaDoBrokk(): string {
    const m = sinos.melodia;
    return 'Os três sinos da torre são um instrumento só: um grave, um médio e um agudo, '
        + 'na mesma viga. A torre quer o ' + NOMES_DAS_NOTAS[m[0]]
        + ', depois o ' + NOMES_DAS_NOTAS[m[1]]
        + ', depois o ' + NOMES_DAS_NOTAS[m[2]]
        + ' — nessa ordem, e sem pressa. Erra uma nota e a corda volta ao primeiro badalo.';
}

// ── O QUE O FLOOR13 USA ─────────────────────────────────────────────────────
/** O rótulo do botão: antes da pista, o jogador nem sabe qual sino é. */
export function rotuloDoSino(i: number): string {
    return sinos.pista ? 'TOCAR O SINO ' + NOMES_DAS_NOTAS[i].toUpperCase() : 'TOCAR O SINO';
}

/**
 * Qual sino o jogador alcança de (x, z): o mais perto dentro do braço, ou -1.
 * Sem alocação — é chamada pelo radar do Floor13.
 */
export function sinoAoAlcance(x: number, z: number): number {
    let melhor = -1;
    let dMelhor = ALCANCE_DO_SINO;
    for (let i = 0; i < 3; i++) {
        const l = LUGARES[i];
        const d = Math.hypot(x - l.x, z - l.z);
        if (d < dMelhor) { dMelhor = d; melhor = i; }
    }
    return melhor;
}

/** O Floor13 chama isto no botão: o jogador tocou o sino `i`. */
export function tocarSinoDaTorre(i: number): void {
    if (i < 0 || i > 2) return;
    if (!sinos.pista) {
        badalada(i, false);
        avisar('O sino canta, mas você ainda não sabe a ordem. O Brokk, na forja, conhece a melodia da torre.', 3.5);
        return;
    }
    const certo = i === sinos.melodia[sinos.passo];
    badalada(i, !certo);
    if (!certo) {
        sinos.passo = 0;
        avisar('A badalada sai torta e desafina na cauda. A melodia volta ao primeiro sino.', 3);
        return;
    }
    sinos.passo++;
    if (sinos.passo < sinos.melodia.length) {
        avisar('…' + NOMES_DAS_NOTAS[i] + '. ' + sinos.passo + ' de 3.', 1.8);
        return;
    }
    // a melodia fechou: aviso bonito + recompensa — a porta acende, não abre
    sinos.passo = 0;
    sinos.resolvido = true;
    sinos.brilho = BRILHO;
    avisar('Os três sinos se acertam numa nota só e o bronze acende. Lá embaixo, todo latão das portas responde junto — como se só o latão soubesse ouvir.', 6);
}

// ── ACHAR O SINO DA TORRE ────────────────────────────────────────────────────
/** Primeira malha dentro de um objeto (o sino pode vir dentro de um grupo). */
function primeiraMalha(o: THREE.Object3D): THREE.Mesh | null {
    const caixa: { m: THREE.Mesh | null } = { m: null };
    o.traverse((f) => {
        if (caixa.m !== null) return;
        const m = f as THREE.Mesh;
        if (m.isMesh) caixa.m = m;
    });
    return caixa.m;
}

/**
 * Acha o sino da torre: pelo nome 'sino', se o Floor13Mundo batizou a malha;
 * senão, pela malha metálica mais perto de SINO (o bronze da torre).
 */
function acharOSinoDaTorre(cena: THREE.Object3D): THREE.Mesh | null {
    const batizado = cena.getObjectByName('sino');
    if (batizado) {
        const m = primeiraMalha(batizado);
        if (m) return m;
    }
    const caixa: { m: THREE.Mesh | null; perto: number } = { m: null, perto: 3.5 };
    const p = new THREE.Vector3();
    cena.traverse((o) => {
        const f = o as THREE.Mesh;
        if (!f.isMesh) return;
        const mat = Array.isArray(f.material) ? f.material[0] : f.material;
        const metal = mat && 'metalness' in mat ? (mat as THREE.MeshStandardMaterial).metalness : 0;
        if ((metal ?? 0) < .4) return;
        p.setFromMatrixPosition(f.matrixWorld);
        const d = Math.hypot(p.x - SINO.x, p.z - SINO.z);
        if (d < caixa.perto) { caixa.perto = d; caixa.m = f; }
    });
    return caixa.m;
}

// ── MONTAGEM E DESMONTAGEM (uma vez por cena) ────────────────────────────────
let cenaMontada: THREE.Scene | null = null;
const pendurados: THREE.Mesh[] = [];
let luzDaPorta: THREE.PointLight | null = null;

function desmontar(): void {
    for (const o of pendurados) {
        if (o.parent) o.parent.remove(o);
    }
    pendurados.length = 0;
    if (luzDaPorta) {
        if (luzDaPorta.parent) luzDaPorta.parent.remove(luzDaPorta);
        luzDaPorta = null;
    }
}

function montar(cena: THREE.Scene, porta: number | undefined): void {
    cena.updateMatrixWorld(true);   // no primeiro quadro as matrizes ainda podem estar cruas
    const pos = new THREE.Vector3();
    const rot = new THREE.Quaternion();
    const esc = new THREE.Vector3();
    const grande = acharOSinoDaTorre(cena);
    if (grande) {
        grande.matrixWorld.decompose(pos, rot, esc);
        reancorar(pos.x, pos.y, pos.z);
        // os dois menores são desenhados pelo próprio Templo (Floor13Mundo),
        // com o mesmo perfil e material do grande; aqui só se ancoram os lugares

    } else {
        console.warn('[f13Sinos] não achei o sino da torre na cena: os menores não foram pendurados (o minigame segue pelo som).');
    }
    if (porta !== undefined) {
        const p = portaNoMundo(porta);
        const luz = new THREE.PointLight(0xffcf8a, 0, 8, 2);
        luz.position.set(
            p.x + p.fx * .3,
            (LUGAR_DAS_CASAS[porta] ? LUGAR_DAS_CASAS[porta].y : 0) + 1.4,
            p.z + p.fz * .3,
        );
        luz.visible = false;
        cena.add(luz);
        luzDaPorta = luz;
    }
}

// ── O COMPONENTE ─────────────────────────────────────────────────────────────
/**
 * <SinosDaTorre/> — não desenha nada (devolve null); só usa useFrame para
 * pendurar os clones e a luz no primeiro quadro, e depois conduzir o relógio
 * do brilho e do aviso. Se o Floor13 passar `porta={CASA_CERTA}`, é a porta
 * certa que acende por três segundos. Nada aqui aloca por quadro: é só
 * subtração de números e mudança de flags em objetos já existentes.
 */
export function SinosDaTorre({ porta }: { porta?: number }): null {
    useFrame((estado, dt) => {
        const cena = estado.scene;
        if (cenaMontada !== cena) {
            desmontar();
            cenaMontada = cena;
            montar(cena, porta);
        }
        // relógio: só números, nada alocado por quadro
        const d = dt > .25 ? .25 : dt;   // um engasgo de quadro não come o brilho de uma vez
        if (sinos.brilho > 0) {
            const b = sinos.brilho - d;
            sinos.brilho = b > 0 ? b : 0;
        }
        if (sinos.avisoTempo > 0) {
            const a = sinos.avisoTempo - d;
            sinos.avisoTempo = a > 0 ? a : 0;
        }
        const b = sinos.brilho;
        const v = b > 0 ? Math.min(1, b / .5) * (.75 + .25 * Math.sin(b * 9)) : 0;
        brilhoDoLatao(v); brilhoDosSinos(v);
    });
    return null;
}
