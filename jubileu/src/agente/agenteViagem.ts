import { ELEVATOR_ZONE_X, ELEVATOR_ZONE_Z } from '../constants';
import type { Posicao } from './agenteCorpo';

/** A level change alone is not evidence that the companion took the elevator. */
export class ViagemDoAgente {
    nivel: number;
    private observado: number;
    private embarcou = false;
    constructor(nivel: number, observado = nivel) { this.nivel = nivel; this.observado = observado; }
    ver(nivelVisivel: number, portasFechadas: boolean, dentroDoCab: boolean, haCab: boolean): boolean {
        let viajou = false;
        if (this.observado !== nivelVisivel) {
            if (this.embarcou && portasFechadas) { this.nivel = nivelVisivel; viajou = true; }
            this.embarcou = false;
            this.observado = nivelVisivel;
        }
        if (!portasFechadas) this.embarcou = false;
        else if (this.nivel === nivelVisivel && dentroDoCab && haCab) this.embarcou = true;
        return viajou;
    }
}

/** Used for visible-world spawn/boarding checks without changing the body. */
export const estaNoCab = (p: Pick<Posicao, 'x' | 'z'>): boolean => Math.abs(p.x) <= ELEVATOR_ZONE_X && p.z <= ELEVATOR_ZONE_Z && p.z >= -16.5;
