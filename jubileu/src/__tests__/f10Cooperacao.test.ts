import { beforeEach, describe, expect, it } from 'vitest';
import { freshPrison, stepPrison } from '../npc/f10Prison';
import { aparelhoComplementar, alvoDaCooperacao, cancelarCooperacao, pedirCooperacao, podemSairJuntos } from '../npc/f10Cooperacao';
beforeEach(cancelarCooperacao);
describe('Sala 03:17',()=>{
    it('o convite aponta ao aparelho oposto e termina se o jogador abandona a posição',()=>{
        const s=freshPrison(),p=s.devices[s.locks[0].devices[0]],n=s.devices[s.locks[0].devices[1]];
        expect(aparelhoComplementar(s,p)).toBe(n.id);
        pedirCooperacao('aparelho');expect(alvoDaCooperacao(s,p)).toEqual({x:n.x,z:n.z});
        expect(alvoDaCooperacao(s,{x:0,z:0})).toBeNull();
        expect(alvoDaCooperacao(s,p)).toBeNull();
    });
    it('um jogador sozinho não abre nenhuma tranca; os dois conseguem resolver os aparelhos',()=>{
        const s=freshPrison();
        for(const lock of s.locks){
            const p=s.devices[lock.devices[0]],n=s.devices[lock.devices[1]];
            for(let i=0;i<120;i++)stepPrison(s,{npc:null,player:p,dt:1/60});
            expect(lock.solved).toBe(false);
            for(let i=0;i<Math.ceil((lock.holdSeconds+1)*60);i++)stepPrison(s,{npc:n,player:p,dt:1/60});
            expect(lock.solved).toBe(true);
        }
        expect(s.doorOpen).toBe(true);
    });
    it('resolver trancas não basta: os dois precisam embarcar de verdade',()=>{
        const s=freshPrison(),cab={x:0,z:-13};
        expect(podemSairJuntos(s,cab,cab)).toBe(false);
        s.doorOpen=true;
        expect(podemSairJuntos(s,cab,{x:7,z:6})).toBe(false);
        expect(podemSairJuntos(s,{x:0,z:0},cab)).toBe(false);
        expect(podemSairJuntos(s,cab,null)).toBe(false);
        expect(podemSairJuntos(s,cab,cab)).toBe(true);
    });
    it('convite de saída só vale depois das duas trancas',()=>{
        const s=freshPrison();pedirCooperacao('saida');expect(alvoDaCooperacao(s,{x:0,z:0})).toBeNull();
        s.doorOpen=true;pedirCooperacao('saida');expect(alvoDaCooperacao(s,{x:0,z:0})).toEqual({x:-.8,z:-12.6});
    });
});
