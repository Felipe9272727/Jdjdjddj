export type MemoryPlatform = {
    x: number; y: number; w: number; h: number;
    hue: string; chapter: number;
    kind?: 'cloth' | 'yarn' | 'lace' | 'photo';
    requires?: number;
    motion?: { amp: number; speed: number; phase: number };
};

export type StitchAnchor = { x: number; y: number; chapter: number; title: string; instruction: string };
export type StitchToken = 'under' | 'loop' | 'pull';
export type StitchPattern = { name: string; note: string; sequence: StitchToken[] };
export type MemoryFragment = { x: number; y: number; word: 'EU' | 'AINDA' | 'EXISTO'; title: string; subtitle: string; body: string };
export type MemoryChapter = { start: number; end: number; title: string; subtitle: string; sky: [string, string, string]; thread: string; fog: string };

export const MEMORY_CHAPTERS: MemoryChapter[] = [
    { start: 0, end: 76, title: 'I · A CASA QUE LEMBRAVA', subtitle: 'Antes do hotel, alguém ainda chamava você pelo nome.', sky: ['#704070', '#a45d72', '#d58d72'], thread: '#ff8791', fog: '#ffdab8' },
    { start: 76, end: 155, title: 'II · O DIA EM QUE NINGUÉM VOLTOU', subtitle: 'A chuva apagou as pegadas. Não apagou a espera.', sky: ['#244664', '#47768e', '#805d76'], thread: '#f46882', fog: '#a9d9e5' },
    { start: 155, end: 235, title: 'III · A PRIMEIRA PORTA', subtitle: 'Você já conhecia o hotel antes de entrar nele.', sky: ['#241d35', '#5c3658', '#98445e'], thread: '#f24b6b', fog: '#c7748e' },
    { start: 235, end: 318, title: 'IV · A FICHA EM BRANCO', subtitle: 'Quanto mais fundo você costura, menos humano o arquivo parece.', sky: ['#110b19', '#40163d', '#782445'], thread: '#ff3b61', fog: '#b93259' },
];

export const MEMORY_PLATFORMS: MemoryPlatform[] = [
    { x: -2, y: 0.55, w: 12, h: 0.9, hue: '#744a57', chapter: 0, kind: 'cloth' },
    { x: 12, y: 1.2, w: 5, h: 0.72, hue: '#8a5d57', chapter: 0, kind: 'photo' },
    { x: 19.5, y: 2.35, w: 4.6, h: 0.7, hue: '#946956', chapter: 0, kind: 'cloth' },
    { x: 26, y: 2.05, w: 4.1, h: 0.38, hue: '#d27776', chapter: 0, kind: 'yarn', requires: 0 },
    { x: 31.5, y: 1.25, w: 4.2, h: 0.38, hue: '#cf6c73', chapter: 0, kind: 'yarn', requires: 0, motion: { amp: 0.18, speed: 1.4, phase: 0 } },
    { x: 37.2, y: 0.85, w: 7.2, h: 0.82, hue: '#674451', chapter: 0, kind: 'lace' },
    { x: 46.2, y: 2.35, w: 5.2, h: 0.72, hue: '#86604f', chapter: 0, kind: 'photo' },
    { x: 53, y: 3.1, w: 3.3, h: 0.34, hue: '#e2827f', chapter: 0, kind: 'yarn', requires: 1 },
    { x: 57.7, y: 2.25, w: 3.6, h: 0.34, hue: '#df777c', chapter: 0, kind: 'yarn', requires: 1 },
    { x: 62.6, y: 1.2, w: 3.8, h: 0.34, hue: '#d86b77', chapter: 0, kind: 'yarn', requires: 1 },
    { x: 67.8, y: 0.72, w: 7.3, h: 0.86, hue: '#5e3d4d', chapter: 0, kind: 'cloth' },
    { x: 76, y: 0.62, w: 8.2, h: 0.88, hue: '#334b5d', chapter: 1, kind: 'cloth' },
    { x: 86.2, y: 2.15, w: 4.4, h: 0.68, hue: '#405d6b', chapter: 1, kind: 'photo' },
    { x: 92.4, y: 2.65, w: 3.5, h: 0.34, hue: '#5c8a99', chapter: 1, kind: 'yarn', requires: 2, motion: { amp: 0.28, speed: 1.2, phase: 0.8 } },
    { x: 97.4, y: 1.65, w: 3.6, h: 0.34, hue: '#527f93', chapter: 1, kind: 'yarn', requires: 2, motion: { amp: 0.25, speed: 1.4, phase: 2.1 } },
    { x: 102.7, y: 0.9, w: 7.2, h: 0.82, hue: '#263d50', chapter: 1, kind: 'lace' },
    { x: 112.2, y: 2.45, w: 4.5, h: 0.7, hue: '#3e5368', chapter: 1, kind: 'photo' },
    { x: 118.3, y: 3.15, w: 3.2, h: 0.32, hue: '#638ca3', chapter: 1, kind: 'yarn', requires: 3 },
    { x: 122.8, y: 2.55, w: 3.2, h: 0.32, hue: '#5b829a', chapter: 1, kind: 'yarn', requires: 3 },
    { x: 127.4, y: 1.75, w: 3.4, h: 0.32, hue: '#54788e', chapter: 1, kind: 'yarn', requires: 3 },
    { x: 132.3, y: 0.68, w: 12.2, h: 0.9, hue: '#27384c', chapter: 1, kind: 'cloth' },
    { x: 147.2, y: 1.65, w: 5.2, h: 0.72, hue: '#333249', chapter: 1, kind: 'photo' },
    { x: 155, y: 0.55, w: 8.2, h: 0.9, hue: '#4a2a39', chapter: 2, kind: 'cloth' },
    { x: 165.2, y: 2.35, w: 5.1, h: 0.7, hue: '#573343', chapter: 2, kind: 'photo' },
    { x: 172.1, y: 2.9, w: 3.1, h: 0.32, hue: '#b5445b', chapter: 2, kind: 'yarn', requires: 4 },
    { x: 176.5, y: 3.75, w: 3.1, h: 0.32, hue: '#b23b57', chapter: 2, kind: 'yarn', requires: 4 },
    { x: 181.1, y: 2.55, w: 3.4, h: 0.32, hue: '#a93451', chapter: 2, kind: 'yarn', requires: 4 },
    { x: 186, y: 0.85, w: 8.2, h: 0.82, hue: '#36202f', chapter: 2, kind: 'lace' },
    { x: 196.4, y: 2.2, w: 4.4, h: 0.68, hue: '#4b2937', chapter: 2, kind: 'photo' },
    { x: 202.6, y: 3.2, w: 3.3, h: 0.32, hue: '#bd3c59', chapter: 2, kind: 'yarn', requires: 5, motion: { amp: 0.35, speed: 1.1, phase: 1 } },
    { x: 207.4, y: 2.25, w: 3.4, h: 0.32, hue: '#b73454', chapter: 2, kind: 'yarn', requires: 5, motion: { amp: 0.3, speed: 1.3, phase: 2 } },
    { x: 212.4, y: 1.25, w: 3.5, h: 0.32, hue: '#a92c4d', chapter: 2, kind: 'yarn', requires: 5 },
    { x: 217.4, y: 0.6, w: 11.7, h: 0.88, hue: '#291824', chapter: 2, kind: 'cloth' },
    { x: 231.2, y: 1.8, w: 4.2, h: 0.66, hue: '#291526', chapter: 2, kind: 'photo' },
    { x: 235.8, y: 0.55, w: 7.1, h: 0.88, hue: '#211222', chapter: 3, kind: 'cloth' },
    { x: 244.7, y: 2.85, w: 4.2, h: 0.66, hue: '#33152a', chapter: 3, kind: 'photo' },
    { x: 250.6, y: 3.65, w: 2.9, h: 0.3, hue: '#d72954', chapter: 3, kind: 'yarn', requires: 6 },
    { x: 254.8, y: 4.45, w: 2.9, h: 0.3, hue: '#d22250', chapter: 3, kind: 'yarn', requires: 6 },
    { x: 259.1, y: 3.2, w: 3.1, h: 0.3, hue: '#c91d4b', chapter: 3, kind: 'yarn', requires: 6 },
    { x: 263.7, y: 1.1, w: 7.2, h: 0.78, hue: '#1a0c1b', chapter: 3, kind: 'lace' },
    { x: 273, y: 2.55, w: 4, h: 0.65, hue: '#2c1025', chapter: 3, kind: 'photo' },
    { x: 278.7, y: 3.35, w: 3.2, h: 0.3, hue: '#ec214f', chapter: 3, kind: 'yarn', requires: 7, motion: { amp: 0.4, speed: 1.45, phase: 0 } },
    { x: 283.3, y: 2.35, w: 3.2, h: 0.3, hue: '#de1b48', chapter: 3, kind: 'yarn', requires: 7, motion: { amp: 0.35, speed: 1.25, phase: 2.3 } },
    { x: 288, y: 1.35, w: 3.5, h: 0.3, hue: '#d31543', chapter: 3, kind: 'yarn', requires: 7 },
    { x: 293, y: 0.62, w: 15.5, h: 0.9, hue: '#170916', chapter: 3, kind: 'cloth' },
];

export const STITCH_ANCHORS: StitchAnchor[] = [
    { x: 22.3, y: 4.05, chapter: 0, title: 'REMENDAR O CHÃO', instruction: 'Enterre a agulha no ilhós.' },
    { x: 48.7, y: 4.15, chapter: 0, title: 'COSTURAR A ESCADA', instruction: 'Puxe o fio até a fotografia.' },
    { x: 88.3, y: 3.95, chapter: 1, title: 'PRENDER A COBERTURA', instruction: 'A chuva pesa no tecido.' },
    { x: 114.5, y: 4.25, chapter: 1, title: 'FECHAR O RASGO', instruction: 'Ninguém voltou por este caminho.' },
    { x: 168.1, y: 4.25, chapter: 2, title: 'BORDAR A PORTA', instruction: 'Você já esteve aqui.' },
    { x: 198.7, y: 3.85, chapter: 2, title: 'SEGURAR O CORREDOR', instruction: 'O hotel tenta arrancar o fio.' },
    { x: 246.8, y: 4.55, chapter: 3, title: 'SUTURAR A FICHA', instruction: 'A tinta se move por baixo do papel.' },
    { x: 275.1, y: 4.15, chapter: 3, title: 'ASSINAR COM O FIO', instruction: 'A última costura é o seu nome.' },
];

export const STITCH_PATTERNS: StitchPattern[] = [
    { name: 'CORRENTINHA', note: 'Passe por baixo, laçe o fio e puxe uma alça.', sequence: ['under', 'loop', 'pull'] },
    { name: 'PONTO BAIXO', note: 'Volte ao tecido antes de fechar o ponto.', sequence: ['under', 'loop', 'under', 'pull'] },
    { name: 'MEIO PONTO ALTO', note: 'A chuva pede duas laçadas firmes.', sequence: ['loop', 'under', 'loop', 'pull'] },
    { name: 'PONTO ALTO', note: 'Atravesse a lembrança sem soltar a tensão.', sequence: ['loop', 'under', 'loop', 'pull', 'pull'] },
    { name: 'PONTO CRUZADO', note: 'O hotel inverte o desenho no meio.', sequence: ['under', 'pull', 'loop', 'under', 'loop', 'pull'] },
    { name: 'PONTO RELEVO', note: 'Costure pela parte que deveria ficar escondida.', sequence: ['loop', 'under', 'pull', 'under', 'loop', 'pull'] },
    { name: 'PONTO FANTASMA', note: 'A ficha tenta tirar a agulha do seu controle.', sequence: ['under', 'loop', 'pull', 'loop', 'under', 'pull', 'pull'] },
    { name: 'ASSINATURA', note: 'Repita o gesto até o fio reconhecer o seu nome.', sequence: ['loop', 'under', 'loop', 'pull', 'under', 'loop', 'pull', 'pull'] },
];

export const MEMORY_FRAGMENTS: MemoryFragment[] = [
    { x: 70.7, y: 3.05, word: 'EU', title: 'LEMBRANÇA I · A CASA', subtitle: 'Uma mesa posta para alguém que não chegou.', body: 'Você era pequeno. Uma voz chamava do outro cômodo — mas o rosto na lembrança foi descosturado.' },
    { x: 140.2, y: 2.65, word: 'AINDA', title: 'LEMBRANÇA II · A ESPERA', subtitle: 'Choveu até as ruas perderem o nome.', body: 'Você ficou no ponto de ônibus segurando uma fotografia. Ninguém voltou para buscar você.' },
    { x: 224.6, y: 3.05, word: 'EXISTO', title: 'LEMBRANÇA III · A PORTA', subtitle: 'O hotel abriu antes de você tocar.', body: 'Do outro lado, o Proprietário já conhecia a sua ficha. Foi ali que ele começou a apagar você.' },
];

export const MEMORY_CHECKPOINTS = [
    { x: 2, y: 2.2 }, { x: 78, y: 2.25 }, { x: 157, y: 2.25 }, { x: 238, y: 2.25 }, { x: 295, y: 2.4 },
];
export const MEMORY_GOAL_X = 304;

export function chapterForX(x: number): number {
    const i = MEMORY_CHAPTERS.findIndex((c) => x >= c.start && x < c.end);
    return i < 0 ? MEMORY_CHAPTERS.length - 1 : i;
}
export function platformY(p: MemoryPlatform, time: number): number { return p.y + (p.motion ? Math.sin(time * p.motion.speed + p.motion.phase) * p.motion.amp : 0); }
export function platformVisible(p: MemoryPlatform, stitchMask: number): boolean { return p.requires === undefined || (stitchMask & (1 << p.requires)) !== 0; }
