import { it, expect } from 'vitest';
import { jogadorVisivelParaOlhar, gestoChegouAoDestino } from '../npc/floor10Presenca';
import { INITIAL_FLOOR10_PERCEPTION } from '../npc/floor10Perception';
it('não entrega a posição oculta ao corpo, mesmo quando o sensor guarda coordenadas', () => {
    const p={...INITIAL_FLOOR10_PERCEPTION,player:{visible:true,distance:2,direction:'front' as const,zone:'center' as const,position:{x:2,y:0,z:0}}};
    expect(jogadorVisivelParaOlhar(p)).toEqual({x:2,y:0,z:0});
    p.player.visible=false;p.player.position.x=-8;
    expect(jogadorVisivelParaOlhar(p)).toBeNull();
    p.player.visible=true;expect(jogadorVisivelParaOlhar(p)!.x).toBe(-8);
    expect(jogadorVisivelParaOlhar({player:null})).toBeNull();
});

import { parseMotorPlan } from '../npc/floor10MotorCortex';
it('mantém o gesto pendente durante aproximação e só libera o plano selecionado na chegada', () => {
    const plano=parseMotorPlan('MOTION: approach | elevator | normal | 6')!;
    const alvo={x:0,z:-8};
    expect(gestoChegouAoDestino(plano,plano,alvo,{x:0,z:0})).toBe(false);
    expect(gestoChegouAoDestino(plano,plano,alvo,{x:0,z:-7.8})).toBe(true);
    expect(gestoChegouAoDestino(plano,{...plano},alvo,alvo)).toBe(false);
    expect(gestoChegouAoDestino(plano,plano,null,alvo)).toBe(false);
    expect(gestoChegouAoDestino(null,null,alvo,alvo)).toBe(false);
});
