import React, { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, Vector3 } from 'three';
import { RemotePlayer } from './RemotePlayer';
import type { MPPlayer } from './Multiplayer';
import { wallsForState, hasWalkInElevator } from './constants';
import { f6DoorWalls } from './f6Escape';
import { platforms } from './f3Parkour';
import { F11_PLATAFORMAS, F11_MARCOS } from './f11Mundo';
import { agenteSessao, reiniciarAgente } from './agente/agenteSessao';
import type { MundoAgente } from './agente/agenteRuntime';
import type { Superficie } from './agente/agenteCorpo';
import { ViagemDoAgente, estaNoCab } from './agente/agenteViagem';

type Props = {
    level: number; doorsClosed: boolean; houseDoorOpen: boolean; paused: boolean;
    playerPositionRef: React.MutableRefObject<Vector3>;
};
const ID = 'local-companion-11';
const CAB: Superficie = { id: -2, x: 0, z: -12.75, hw: 3.25, hd: 3.75, topY: 0 };

/** Scene adapter: the controller itself never branches on floor numbers. */
export function AgenteCompanheiro({ level, doorsClosed, houseDoorOpen, paused, playerPositionRef }: Props): React.ReactElement {
    const group = useRef<Group>(null);
    const [renderAvatar, setRenderAvatar] = useState(false);
    const viagem = useRef(new ViagemDoAgente(11, level));
    const geracao = useRef(-1);
    const ultimaFala = useRef(0);
    const dados = useRef(new Map<string, MPPlayer>());
    const superficies = useMemo<Superficie[]>(() => [], []);
    const mundo = useRef<MundoAgente>({ revisao: '', paredes: [], plataformas: [], chao: 0, jogador: null, interacoes: [] });

    useFrame((_, dt) => {
        if (!agenteSessao.agente && level === 11) reiniciarAgente();
        const agente = agenteSessao.agente;
        if (!agente) { if (group.current) group.current.visible = false; return; }
        if (geracao.current !== agenteSessao.geracao) {
            geracao.current = agenteSessao.geracao; ultimaFala.current = 0;
            viagem.current = new ViagemDoAgente(agenteSessao.nivel, level);
        }
        if (viagem.current.ver(level, doorsClosed, estaNoCab(agente.corpo), hasWalkInElevator(level))) {
            agenteSessao.nivel = viagem.current.nivel; agente.chegouAoAndar();
            if (agente.modo === 'embarcar') agente.comandar('seguir');
        }
        const presente = agenteSessao.nivel === level;
        if (group.current) group.current.visible = presente;
        if (!presente) { if (renderAvatar) setRenderAvatar(false); return; }
        if (!renderAvatar) setRenderAvatar(true);

        const paredes = wallsForState(level, doorsClosed, houseDoorOpen);
        const portas = level === 6 ? f6DoorWalls() : [];
        // Special 2D/creature/swimming floors own another body. Wait at the
        // entrance until they expose surfaces; never pretend their void is flat.
        const terrenoConhecido = [0, 1, 3, 6, 7, 10, 11].includes(level);
        const m = mundo.current;
        m.paredes = portas.length ? [...paredes, ...portas] : paredes;
        m.revisao = `${level}:${doorsClosed}:${houseDoorOpen}:${JSON.stringify(portas)}:${Math.round(agente.corpo.y * 2)}`;
        m.chao = level === 3 ? null : 0;
        if (level === 3) {
            superficies.length = platforms.length + 1;
            superficies[0] = CAB;
            for (let i = 0; i < platforms.length; i++) {
                const p = platforms[i];
                const s = superficies[i + 1] ?? (superficies[i + 1] = { id: p.id, x: p.x, z: p.cz, hw: p.hw, hd: p.hd, topY: p.topY });
                s.id = p.id; s.x = p.x; s.z = p.cz; s.hw = p.hw; s.hd = p.hd; s.topY = p.topY;
            }
            m.plataformas = superficies;
        } else m.plataformas = level === 11 ? F11_PLATAFORMAS : [];
        m.jogador = playerPositionRef.current;
        m.pausado = paused || !terrenoConhecido || (doorsClosed && estaNoCab(agente.corpo));
        m.saida = hasWalkInElevator(level) ? { x: 0, y: 0, z: -13 } : undefined;
        m.interacoes = level === 11 ? F11_MARCOS.map(p => ({
            ...p, raio: 0.4, disponivel: !agenteSessao.marcos.has(p.id),
            usar: () => {
                if (Math.hypot(agente.corpo.x - p.x, agente.corpo.z - p.z) >= 0.4 || Math.abs(agente.corpo.y - p.y) >= 0.2) return false;
                agenteSessao.marcos.add(p.id); return true;
            },
        })) : [];
        agente.tick(dt, m);
        let dado = dados.current.get(ID);
        if (!dado) {
            dado = { id: ID, x: agente.corpo.x, y: agente.corpo.y, z: agente.corpo.z, ry: 0,
                state: 'idle', worldId: 'local', isActive: true, level, updatedAt: 0,
                name: 'Visitante', chatMsg: '', chatAt: 0 };
            dados.current.set(ID, dado);
        }
        dado.x = agente.corpo.x; dado.y = agente.corpo.y; dado.z = agente.corpo.z; dado.ry = agente.yaw;
        dado.state = Math.hypot(agente.corpo.vx, agente.corpo.vz) > 0.12 ? 'walking' : 'idle';
        dado.level = level;
        if (ultimaFala.current !== agente.falaId) {
            ultimaFala.current = agente.falaId; dado.chatMsg = agente.fala; dado.chatAt = Date.now();
        }
    });
    return <group ref={group}>{renderAvatar && <RemotePlayer id={ID} dataRef={dados} />}</group>;
}
