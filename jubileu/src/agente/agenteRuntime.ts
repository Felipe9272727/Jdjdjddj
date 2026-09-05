import { SPEED, PR } from '../constants';
import { estaNoCab } from './agenteViagem';
import { resolveCollision } from '../physics';
import { construirGrade, limitesDaVista, caminho, alcancaveis, paraMundo, type Ponto, type GradeDoAndar } from './agenteMapa';
import { daParaPular, tempoDeVoo, type Plataforma } from './agenteSalto';
import { criarCorpo, contem, paredesNaAltura, passoDoCorpo, type Posicao, type Superficie, type MundoFisico } from './agenteCorpo';

export type ModoAgente = 'explorar' | 'seguir' | 'esperar' | 'embarcar';
export type AlvoInteracao = Posicao & {
    id: string; raio: number; prioridade?: number; disponivel: boolean;
    /** The world checks range/conditions again and returns an observable outcome. */
    usar?: () => boolean;
};
export type MundoAgente = MundoFisico & {
    revisao: string | number;
    jogador: Posicao | null;
    interacoes: readonly AlvoInteracao[];
    saida?: Posicao;
    pausado?: boolean;
};
type Intencao = { id: string; p: Posicao; raio: number; interacao?: AlvoInteracao };
type MemoriaAlvo = { visitas: number; bloqueadoAte: number; ultimaVisita: number };
type Salto = { de: number; para: number; saida: Posicao; chegada: Posicao; lancado: boolean };
const distancia = (a: Ponto, b: Ponto) => Math.hypot(a.x - b.x, a.z - b.z);
const limitar = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Tests visibility against walls, without using the player's hidden live position. */
export function linhaLivre(a: Ponto, b: Ponto, paredes: number[][], raio = 0): boolean {
    const rx = b.x - a.x, rz = b.z - a.z;
    for (const [x1, z1, x2, z2] of paredes) {
        const sx = x2 - x1, sz = z2 - z1;
        const det = rx * sz - rz * sx;
        if (Math.abs(det) < 1e-9) continue;
        const t = ((x1 - a.x) * sz - (z1 - a.z) * sx) / det;
        const u = ((x1 - a.x) * rz - (z1 - a.z) * rx) / det;
        if (t > 0.001 && t < 0.999 && u >= 0 && u <= 1) return false;
    }
    const d = distancia(a, b), passos = Math.max(1, Math.ceil(d / 0.15));
    for (let i = 1; i <= passos; i++) {
        const t = i / passos, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
        const [rx, rz] = resolveCollision(x, z, Math.max(0.04, raio), paredes);
        if (Math.hypot(rx - x, rz - z) > 0.005) return false;
    }
    return true;
}

/** A persistent, frame-driven player. Planning never teleports the body. */
export class AgenteJogador {
    readonly corpo;
    modo: ModoAgente = 'explorar';
    yaw = 0;
    estado = 'observando';
    fala = '';
    falaId = 0;
    readonly memoria = new Map<string, MemoriaAlvo>();
    ultimaPosicaoVista: Posicao | null = null;
    private viuEm = -Infinity;
    private tempo = 0;
    private decisaoEm = 0.35;
    private percepcaoEm = 0;
    private pausaAte = 0;
    private proximaFala = 0;
    private intencao: Intencao | null = null;
    private grade: GradeDoAndar | null = null;
    private revisao: string | number | null = null;
    private origemGrade: Ponto;
    private caminho: Ponto[] = [];
    private marco = 0;
    private replanejarEm = 0;
    private paradoHa = 0;
    private velocidade = 0;
    private pertoDoJogador = false;
    private recuperou = false;
    private salto: Salto | null = null;
    private acumulado = 0;
    private apoio: { id: number; x: number; z: number } | null = null;
    private semente: number;
    /** Bounds memory even during an endless run. */
    private lembrar(id: string): MemoriaAlvo {
        let m = this.memoria.get(id);
        if (!m) {
            if (this.memoria.size >= 96) this.memoria.delete(this.memoria.keys().next().value!);
            m = { visitas: 0, bloqueadoAte: 0, ultimaVisita: -Infinity };
            this.memoria.set(id, m);
        }
        return m;
    }
    constructor(pos: Posicao, semente = 713) {
        this.corpo = criarCorpo(pos);
        this.origemGrade = { ...pos };
        this.semente = semente;
    }
    private random(): number {
        this.semente = (Math.imul(this.semente, 1664525) + 1013904223) >>> 0;
        return this.semente / 4294967296;
    }
    comandar(modo: ModoAgente): void {
        this.modo = modo;
        this.pertoDoJogador = false; this.recuperou = false;
        this.intencao = null;
        this.caminho = []; this.replanejarEm = 0;
        this.decisaoEm = this.tempo + 0.18 + this.random() * 0.22;
        this.pausaAte = this.tempo;
        this.dizer({ seguir: 'Bora, vou com você.', esperar: 'Beleza, espero aqui.', explorar: 'Vou dar uma olhada por aqui.', embarcar: 'Vamos pro elevador.' }[modo], true);
    }
    /** Only use for real world transitions, never for being stuck/far from the player. */
    chegouAoAndar(): void {
        this.revisao = null; this.grade = null; this.caminho = [];
        this.intencao = null; this.salto = null; this.apoio = null;
        this.ultimaPosicaoVista = null; this.viuEm = -Infinity;
        this.pertoDoJogador = false; this.recuperou = false;
        this.corpo.vy = 0; this.corpo.vx = 0; this.corpo.vz = 0;
        this.velocidade = 0; this.paradoHa = 0;
        this.decisaoEm = this.tempo + 0.5;
    }
    private dizer(texto: string, forcar = false): void {
        if (!forcar && this.tempo < this.proximaFala) return;
        this.fala = texto; this.falaId++;
        this.proximaFala = this.tempo + 12 + this.random() * 8;
    }
    private perceber(mundo: MundoAgente): void {
        if (this.tempo < this.percepcaoEm) return;
        this.percepcaoEm = this.tempo + 0.16;
        const p = mundo.jogador;
        if (p && distancia(this.corpo, p) < 22 && Math.abs(p.y - this.corpo.y) < 7
            && linhaLivre(this.corpo, p, mundo.paredes)) {
            this.ultimaPosicaoVista = { ...p }; this.viuEm = this.tempo;
        }
    }
    private renovarGrade(mundo: MundoAgente): void {
        if (this.grade && this.revisao === mundo.revisao && distancia(this.origemGrade, this.corpo) < 10) return;
        const paredes = paredesNaAltura(mundo, this.corpo.y);
        this.grade = construirGrade(paredes, limitesDaVista(paredes, this.corpo));
        this.revisao = mundo.revisao; this.origemGrade = { ...this.corpo };
        this.caminho = []; this.replanejarEm = 0;
    }
    private decidir(mundo: MundoAgente): void {
        if (this.modo === 'esperar') { this.intencao = null; this.estado = 'esperando'; return; }
        if (this.modo === 'embarcar' && mundo.saida) {
            this.intencao = { id: 'saida', p: mundo.saida, raio: 0.3 }; return;
        }
        const visto = this.ultimaPosicaoVista;
        if (this.modo === 'seguir' && visto && this.tempo - this.viuEm < 10) {
            const recente = this.tempo - this.viuEm < 1;
            // Follow through the doorway before applying social stopping distance.
            const entrandoNoCab = !!mundo.saida && recente && estaNoCab(visto);
            const d = distancia(this.corpo, visto);
            if (!recente || entrandoNoCab || d > 2.6 || Math.abs(visto.y - this.corpo.y) > 0.2) this.pertoDoJogador = false;
            else if (d < 1.9) this.pertoDoJogador = true;
            this.intencao = { id: 'jogador', p: entrandoNoCab ? { ...mundo.saida! } : { ...visto },
                raio: entrandoNoCab ? 0.3 : !recente ? 0.35 : this.pertoDoJogador ? 2.6 : 1.9 };
            return;
        }
        if (this.modo === 'seguir' && visto) {
            this.estado = 'procurando'; this.dizer('Cadê você? Vou olhar por aqui.');
        }
        if (this.intencao?.interacao) {
            const atual = mundo.interacoes.find(a => a.id === this.intencao!.id && a.disponivel);
            if (!atual) {
                this.intencao = null; this.caminho = []; this.salto = null; this.replanejarEm = 0;
            } else if (distancia(this.corpo, atual) < 22 && linhaLivre(this.corpo, atual, mundo.paredes)) {
                if (distancia(atual, this.intencao.p) > 0.3) this.replanejarEm = 0;
                this.intencao = { id: atual.id, p: { ...atual }, raio: atual.raio, interacao: atual };
            }
        }
        if (this.intencao && this.intencao.id !== 'jogador') return;
        let melhor = -Infinity;
        let escolhida: Intencao | null = null;
        for (const alvo of mundo.interacoes) {
            const m = this.memoria.get(alvo.id) ?? { visitas: 0, bloqueadoAte: 0, ultimaVisita: -Infinity };
            if (!alvo.disponivel || m.bloqueadoAte > this.tempo || this.tempo - m.ultimaVisita < 8) continue;
            // Discover objects by sight; do not read puzzle solutions or hidden switches.
            if (distancia(this.corpo, alvo) > 22 || !linhaLivre(this.corpo, alvo, mundo.paredes)) continue;
            const nota = 8 + (alvo.prioridade ?? 0) - m.visitas * 2 - distancia(this.corpo, alvo) * 0.15;
            if (nota > melhor) { melhor = nota; escolhida = { id: alvo.id, p: alvo, raio: alvo.raio, interacao: alvo }; }
        }
        if (escolhida) { this.intencao = escolhida; return; }
        // Explore reachable space with visit memory, not a fixed ping-pong route.
        if (!this.grade) return;
        const g = this.grade, alcance = alcancaveis(g, this.corpo);
        for (let j = 0; j < g.altura; j += 4) for (let i = 0; i < g.largura; i += 4) {
            if (!alcance[j * g.largura + i]) continue;
            const p = paraMundo(g, i, j), d = distancia(this.corpo, p);
            if (d < 2 || d > 15) continue;
            // A flat navigation grid cannot turn a void into ground.
            if (mundo.chao === null && !mundo.plataformas.some(s => contem(s, p.x, p.z, 0.1) && Math.abs(s.topY - this.corpo.y) < 0.1)) continue;
            const id = `area:${Math.round(p.x / 3)}:${Math.round(p.z / 3)}`;
            const m = this.memoria.get(id) ?? { visitas: 0, bloqueadoAte: 0, ultimaVisita: -Infinity };
            if (m.bloqueadoAte > this.tempo) continue;
            const nota = d * 0.25 - m.visitas * 4 + this.random() * 2;
            if (nota > melhor) { melhor = nota; escolhida = { id, p: { ...p, y: mundo.chao ?? this.corpo.y }, raio: 0.35 }; }
        }
        this.intencao = escolhida;
    }
    private terminar(sucesso: boolean): void {
        if (this.intencao) {
            const m = this.lembrar(this.intencao.id);
            m.visitas++; m.ultimaVisita = this.tempo;
            if (!sucesso) m.bloqueadoAte = this.tempo + 8 + Math.min(30, m.visitas * 3);
        }
        this.intencao = null; this.caminho = []; this.salto = null;
        this.paradoHa = 0; this.velocidade = 0; this.replanejarEm = 0; this.recuperou = false;
        this.pausaAte = this.tempo + (sucesso ? 0.5 + this.random() * 1.1 : 0.8);
        this.decisaoEm = this.pausaAte;
        this.estado = sucesso ? 'observando' : 'procurando passagem';
        if (!sucesso) this.dizer('Por aqui não deu. Vou tentar outro caminho.');
    }
    private apoioAtual(mundo: MundoFisico): Superficie | null {
        return mundo.plataformas.find(p => contem(p, this.corpo.x, this.corpo.z) && Math.abs(p.topY - this.corpo.y) < 0.12) ?? null;
    }
    private planejarSalto(mundo: MundoAgente, alvo: Posicao): Salto | null {
        const apoio = this.apoioAtual(mundo);
        // A floor is a real surface too. Limit its takeoff point to the current feet.
        const de: Superficie = apoio ?? { id: -1, x: this.corpo.x, z: this.corpo.z, hw: 30, hd: 30, topY: this.corpo.y };
        const destino = mundo.plataformas.find(p => contem(p, alvo.x, alvo.z) && Math.abs(p.topY - alvo.y) < 0.15);
        if (!destino || destino.id === de.id) return null;
        // Breadth-first platform graph uses LIVE positions (no full-sweep shortcut).
        const fila = [de], pais = new Map<number, number>(), vistas = new Set([de.id]);
        for (let i = 0; i < fila.length && !vistas.has(destino.id); i++) {
            for (const b of mundo.plataformas) {
                if (vistas.has(b.id) || !daParaPular(fila[i] as Plataforma, b as Plataforma).da) continue;
                vistas.add(b.id); pais.set(b.id, fila[i].id); fila.push(b);
            }
        }
        if (!vistas.has(destino.id)) return null;
        let id = destino.id;
        while (pais.get(id) !== de.id && pais.has(id)) id = pais.get(id)!;
        const para = mundo.plataformas.find(p => p.id === id)!;
        const margem = 0.18;
        let sx = limitar(para.x, de.x - de.hw + margem, de.x + de.hw - margem);
        let sz = limitar(para.z, de.z - de.hd + margem, de.z + de.hd - margem);
        if (!apoio) {
            const vx = this.corpo.x - para.x, vz = this.corpo.z - para.z;
            if (Math.abs(vx) > Math.abs(vz)) {
                sx = para.x + Math.sign(vx || 1) * (para.hw + PR + 0.12);
                sz = limitar(this.corpo.z, para.z - para.hd, para.z + para.hd);
            } else {
                sx = limitar(this.corpo.x, para.x - para.hw, para.x + para.hw);
                sz = para.z + Math.sign(vz || 1) * (para.hd + PR + 0.12);
            }
        }
        if (apoio) {
            [sx, sz] = resolveCollision(sx, sz, PR + 0.12, paredesNaAltura(mundo, de.topY));
            if (!contem(apoio, sx, sz, 0.03)) return null;
        }
        const chegada = {
            x: limitar(sx, para.x - para.hw + PR + 0.06, para.x + para.hw - PR - 0.06),
            z: limitar(sz, para.z - para.hd + PR + 0.06, para.z + para.hd - PR - 0.06), y: para.topY,
        };
        const saida = { x: sx, y: de.topY, z: sz };
        const voo = tempoDeVoo(para.topY - de.topY);
        if (voo === null || distancia(saida, chegada) > SPEED * voo - 0.06) return null;
        return { de: de.id, para: para.id, saida, chegada, lancado: false };
    }
    private caminharAte(alvo: Ponto, mundo: MundoAgente): Ponto | null {
        if (!this.grade) return null;
        if (this.tempo >= this.replanejarEm) {
            this.caminho = caminho(this.grade, this.corpo, alvo); this.marco = 0;
            this.replanejarEm = this.tempo + 0.7;
        }
        while (this.marco < this.caminho.length - 1 && distancia(this.corpo, this.caminho[this.marco]) < 0.22) this.marco++;
        let destino = this.caminho[this.marco] ?? null;
        if (destino && linhaLivre(this.corpo, alvo, paredesNaAltura(mundo, this.corpo.y), PR + 0.05)) destino = alvo;
        if (destino && mundo.chao === null && !mundo.plataformas.some(p => contem(p, destino!.x, destino!.z) && Math.abs(p.topY - this.corpo.y) < 0.12)) return null;
        return destino;
    }
    tick(dt: number, mundo: MundoAgente): void {
        if (mundo.pausado || !Number.isFinite(dt) || dt <= 0) return;
        this.acumulado += Math.min(dt, 0.1);
        while (this.acumulado >= 1 / 60 - 1e-9) {
            this.acumulado -= 1 / 60;
            this.passo(1 / 60, mundo);
        }
    }
    private passo(dt: number, mundo: MundoAgente): void {
        this.tempo += dt;
        this.perceber(mundo);
        if (this.corpo.y < -8) { this.estado = 'caiu'; this.intencao = null; return; }
        // Ride moving platforms rather than drifting off while idle.
        if (this.apoio && this.corpo.grounded) {
            const p = mundo.plataformas.find(p => p.id === this.apoio!.id);
            if (p) { this.corpo.x += p.x - this.apoio.x; this.corpo.z += p.z - this.apoio.z; }
        }
        if (this.corpo.grounded && !this.salto?.lancado) this.renovarGrade(mundo);
        if (this.tempo >= this.decisaoEm && !this.salto?.lancado) {
            this.decisaoEm = this.tempo + 0.3;
            this.decidir(mundo);
        }
        const alvo = this.intencao;
        let dx = 0, dz = 0, pular = false;
        if (alvo && this.tempo >= this.pausaAte && this.modo !== 'esperar') {
            const d = distancia(this.corpo, alvo.p);
            const perto = d < alvo.raio && Math.abs(this.corpo.y - alvo.p.y) < 0.2;
            if (perto && this.corpo.grounded) {
                if (alvo.id === 'jogador') this.estado = 'acompanhando';
                else if (alvo.id === 'saida') this.estado = 'no elevador';
                else {
                    const vivo = mundo.interacoes.find(a => a.id === alvo.id);
                    const sucesso = !alvo.interacao || (!!vivo?.disponivel && (!vivo.usar || vivo.usar()));
                    this.terminar(sucesso);
                }
            } else {
                if (this.corpo.grounded && (!this.salto || !this.salto.lancado)) this.salto = this.planejarSalto(mundo, alvo.p);
                let destino: Ponto | null = null;
                if (this.salto) {
                    const s = this.salto;
                    if (!s.lancado) {
                        destino = this.caminharAte(s.saida, mundo);
                        if (distancia(this.corpo, s.saida) < 0.09) {
                            s.lancado = true; pular = true; destino = s.chegada;
                            this.estado = 'pulando';
                        }
                    } else {
                        // Track the live landing platform while airborne.
                        const p = mundo.plataformas.find(p => p.id === s.para);
                        if (p) destino = { x: limitar(s.chegada.x, p.x - p.hw + 0.12, p.x + p.hw - 0.12), z: s.chegada.z };
                        if (this.corpo.grounded && !pular) { this.salto = null; this.revisao = null; this.caminho = []; }
                    }
                } else if (this.grade) {
                    destino = this.caminharAte(alvo.p, mundo);
                    this.estado = 'andando';
                }
                if (destino) {
                    const dd = distancia(this.corpo, destino);
                    if (dd > 0.015) { dx = (destino.x - this.corpo.x) / dd; dz = (destino.z - this.corpo.z) / dd; }
                    else if (this.corpo.grounded && !perto) this.paradoHa += dt;
                    // Brake at the target, including in the air: no overshoot oscillation.
                    this.velocidade = Math.min(SPEED, this.velocidade + dt * 12, dd / dt);
                } else { this.velocidade = 0; this.paradoHa += dt; }
            }
        }
        if (dx === 0 && dz === 0) this.velocidade = 0;
        const antes = { x: this.corpo.x, z: this.corpo.z };
        passoDoCorpo(this.corpo, mundo, dx, dz, pular, dt, this.salto?.lancado ? SPEED : this.velocidade);
        const movido = distancia(antes, this.corpo);
        if (dx || dz) {
            this.paradoHa = movido < dt * 0.15 && this.corpo.grounded ? this.paradoHa + dt : 0;
            const rumo = Math.atan2(dx, dz);
            this.yaw += Math.atan2(Math.sin(rumo - this.yaw), Math.cos(rumo - this.yaw)) * (1 - Math.exp(-9 * dt));
        } else if (this.ultimaPosicaoVista && this.tempo - this.viuEm < 2) {
            const p = this.ultimaPosicaoVista;
            const rumo = Math.atan2(p.x - this.corpo.x, p.z - this.corpo.z);
            this.yaw += Math.atan2(Math.sin(rumo - this.yaw), Math.cos(rumo - this.yaw)) * (1 - Math.exp(-3 * dt));
        }
        // One fresh route before giving up: collision may have changed since planning.
        if (this.paradoHa > 0.55 && !this.recuperou && this.corpo.grounded) {
            this.grade = null; this.caminho = []; this.replanejarEm = 0; this.recuperou = true;
        }
        if (movido > dt * 0.15) this.recuperou = false;
        if (this.paradoHa > 1.4) this.terminar(false);
        const p = this.corpo.grounded ? this.apoioAtual(mundo) : null;
        this.apoio = p ? { id: p.id, x: p.x, z: p.z } : null;
    }
}
