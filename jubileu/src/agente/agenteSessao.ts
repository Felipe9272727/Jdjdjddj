import { AgenteJogador, type ModoAgente } from './agenteRuntime';
import { F11_SPAWN } from '../f11Mundo';

/** Local companion state; never impersonates a real Firestore participant. */
export const agenteSessao = {
    agente: null as AgenteJogador | null,
    nivel: 11,
    geracao: 0,
    marcos: new Set<string>(),
};
export function reiniciarAgente(): void {
    agenteSessao.agente = new AgenteJogador(F11_SPAWN);
    agenteSessao.nivel = 11;
    agenteSessao.geracao++;
    agenteSessao.marcos.clear();
}
export function comandarAgente(modo: ModoAgente): void {
    agenteSessao.agente?.comandar(modo);
}
