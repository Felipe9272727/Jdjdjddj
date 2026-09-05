import { ViagemDoAgente } from '../agente/agenteViagem';
import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { AgenteJogador, linhaLivre, type MundoAgente } from '../agente/agenteRuntime';
import { criarCorpo, passoDoCorpo } from '../agente/agenteCorpo';
import { F11_PAREDES, F11_PLATAFORMAS, F11_MARCOS, F11_SPAWN } from '../f11Mundo';
import { resolveCollision } from '../physics';
import { SPEED, PR, ELEV_W } from '../constants';

const sala = (): MundoAgente => ({ revisao: 1, paredes: [[-12,-12,12,-12],[12,-12,12,16],[12,16,-12,16],[-12,16,-12,-12]], chao: 0, plataformas: [], jogador: null, interacoes: [] });
function rodar(a: AgenteJogador, m: MundoAgente, segundos: number, hz = 60): void {
    for (let i = 0; i < segundos * hz; i++) a.tick(1 / hz, m);
}
describe('agente-jogador em tempo real', () => {
    it('se desloca fisicamente, reage com atraso e respeita a velocidade do player', () => {
        const a = new AgenteJogador({ x: 0, y: 0, z: 0 }); const m = sala();
        m.jogador = { x: 7, y: 0, z: 0 }; a.comandar('seguir');
        a.tick(0.1, m); assert.equal(a.corpo.x, 0);
        let anterior = { ...a.corpo };
        for (let i = 0; i < 300; i++) {
            a.tick(1 / 60, m);
            assert.ok(Math.hypot(a.corpo.x - anterior.x, a.corpo.z - anterior.z) <= SPEED / 60 + 1e-6);
            anterior = { ...a.corpo };
        }
        assert.ok(a.corpo.x > 4.8 && a.corpo.x < 5.3, JSON.stringify(a.corpo));
    });
    it('guarda a última posição VISTA, sem rastrear alguém escondido pela parede', () => {
        const a = new AgenteJogador({ x: 0, y: 0, z: 0 }); const m = sala();
        m.jogador = { x: 2, y: 0, z: 0 }; a.comandar('esperar'); rodar(a, m, 1);
        m.paredes.push([3, -10, 3, 10]); m.jogador = { x: 5, y: 0, z: 4 };
        rodar(a, m, 1); assert.deepEqual(a.ultimaPosicaoVista, { x: 2, y: 0, z: 0 });
        assert.equal(linhaLivre({ x: 0, z: 0 }, { x: 10, z: 0 }, [[3.075,-1,3.075,1]]), false);
    });
    it('contorna uma divisória e interage somente dentro do alcance', () => {
        const a = new AgenteJogador({ x: -3, y: 0, z: -3 }); const m = sala();
        // Initially visible target, then a door closes across the route.
        let usos = 0;
        m.interacoes = [{ id: 'botao', x: 3, y: 0, z: 3, raio: 0.35, disponivel: true,
            usar: () => { assert.ok(Math.hypot(a.corpo.x - 3, a.corpo.z - 3) < 0.35); usos++; return true; } }];
        rodar(a, m, 0.5); m.paredes.push([-5,0,5,0]); m.revisao = 2;
        for (let i = 0; i < 1800 && usos === 0; i++) {
            a.tick(1 / 60, m);
            const [x,z] = resolveCollision(a.corpo.x,a.corpo.z,PR,m.paredes);
            assert.ok(Math.hypot(x-a.corpo.x,z-a.corpo.z) < 0.01);
        }
        assert.equal(usos, 1, JSON.stringify({ corpo: a.corpo, estado: a.estado }));
    });
    it('não teleporta nem atravessa quando uma porta fecha sem saída', () => {
        const a = new AgenteJogador({ x: -2, y: 0, z: 0 }); const m = sala();
        m.saida = { x: 5, y: 0, z: 0 }; a.comandar('embarcar'); rodar(a, m, 0.5);
        m.paredes.push([0,-12,0,16]); m.revisao = 2;
        rodar(a,m,8); assert.ok(a.corpo.x <= -PR + 0.01); assert.ok(Number.isFinite(a.corpo.x));
        m.paredes.pop(); m.revisao = 3; rodar(a,m,8);
        assert.ok(Math.hypot(a.corpo.x-5,a.corpo.z) < 0.35, JSON.stringify(a.corpo));
    });
    it('faz o mesmo percurso a 30, 60 e 120 FPS', () => {
        const finais = [30,60,120].map(hz => {
            const a = new AgenteJogador({ x: 0,y:0,z:0 },92),m=sala();
            m.jogador={x:8,y:0,z:5};a.comandar('seguir');rodar(a,m,5,hz);return a.corpo;
        });
        for (const p of finais) assert.ok(Math.hypot(p.x-finais[0].x,p.z-finais[0].z) < 0.02);
    });
    it('pausa de verdade, rejeita delta inválido e não acelera depois da aba oculta', () => {
        const a = new AgenteJogador({ x:0,y:0,z:0 }),m=sala();
        m.jogador={x:8,y:0,z:0};a.comandar('seguir');rodar(a,m,1);
        const antes={...a.corpo};m.pausado=true;rodar(a,m,5);assert.deepEqual(a.corpo,antes);
        m.pausado=false;a.tick(NaN,m);assert.deepEqual(a.corpo,antes);
        a.tick(20,m);assert.ok(Math.hypot(a.corpo.x-antes.x,a.corpo.z-antes.z) <= SPEED*0.1+1e-6);
    });
    it('sobe em plataformas usando salto, sem ser içado pela colisão', () => {
        const m=sala();m.plataformas=[{id:1,x:0,z:3,hw:1.5,hd:1.5,topY:1}];
        const c=criarCorpo({x:0,y:0,z:0});
        for(let i=0;i<120;i++)passoDoCorpo(c,m,0,1,false,1/60);
        assert.equal(c.y,0);assert.ok(c.z <= 1.01);
        let pico=0;
        for(let i=0;i<100;i++){passoDoCorpo(c,m,0,c.z<3?1:0,i===0,1/60);pico=Math.max(pico,c.y);}
        assert.ok(pico>1.9);assert.ok(Math.abs(c.y-1)<0.01);assert.ok(c.grounded);
    });
    it('executa o percurso de plataformas do Andar 11 e aciona o marco elevado', () => {
        const a=new AgenteJogador(F11_SPAWN),m=sala();let chegou=false, saltou=false;
        m.paredes=[...F11_PAREDES,...ELEV_W];m.plataformas=F11_PLATAFORMAS;
        const p=F11_MARCOS.find(p=>p.id==='plataforma')!;
        m.interacoes=[{...p,raio:0.4,disponivel:true,usar:()=>{chegou=true;return true;}}];
        for(let i=0;i<60*100&&!chegou;i++){a.tick(1/60,m);saltou ||= a.corpo.vy>1;}
        assert.ok(saltou,JSON.stringify(a.corpo));
        assert.ok(chegou,JSON.stringify({corpo:a.corpo,estado:a.estado,memoria:[...a.memoria]}));
    });
    it('não inventa chão sobre um vão ou aceita plataforma fora do alcance', () => {
        const a=new AgenteJogador({x:0,y:0,z:0}),m=sala();
        m.chao=null;m.plataformas=[{id:1,x:0,z:0,hw:2,hd:2,topY:0},{id:2,x:0,z:9,hw:1,hd:1,topY:5}];
        m.saida={x:0,y:5,z:9};a.comandar('embarcar');rodar(a,m,10);
        assert.ok(a.corpo.y>=-0.01);assert.ok(Math.abs(a.corpo.z)<2);
    });
});


describe('companhia na viagem real', () => {
    it('não acompanha troca de andar por teleporte ou quando ficou fora do cab', () => {
        const viagem = new ViagemDoAgente(11);
        viagem.ver(11, false, true, true);
        assert.equal(viagem.ver(0, false, true, true), false);
        assert.equal(viagem.nivel, 11);
        viagem.ver(11, true, false, true);
        assert.equal(viagem.ver(0, true, true, true), false);
        assert.equal(viagem.nivel, 11);
    });
    it('embarca fisicamente, cruza uma vez e preserva o andar quando desembarca', () => {
        const viagem = new ViagemDoAgente(11);
        viagem.ver(11, false, true, true);
        viagem.ver(11, true, true, true);
        assert.equal(viagem.ver(0, true, true, true), true);
        assert.equal(viagem.nivel, 0);
        assert.equal(viagem.ver(0, true, true, true), false);
        viagem.ver(0, false, false, true);
        assert.equal(viagem.ver(3, false, true, true), false);
        assert.equal(viagem.nivel, 0);
    });
});


it('explora o Andar 11 inteiro, sem depender de um alvo fornecido pelo teste', () => {
    const a=new AgenteJogador(F11_SPAWN),m=sala(),feitos=new Set<string>();
    m.paredes=[...F11_PAREDES,...ELEV_W];m.plataformas=F11_PLATAFORMAS;
    for(let i=0;i<60*120&&feitos.size<3;i++){
        m.interacoes=F11_MARCOS.map(p=>({...p,raio:.4,disponivel:!feitos.has(p.id),usar:()=>{feitos.add(p.id);return true;}}));
        a.tick(1/60,m);
    }
    assert.equal(feitos.size,3,JSON.stringify([...feitos]));
});
it('é carregado pela plataforma móvel mesmo quando espera', () => {
    const a=new AgenteJogador({x:0,y:1,z:0}),m=sala();
    const ponte={id:1,x:0,z:0,hw:2,hd:2,topY:1};m.plataformas=[ponte];a.comandar('esperar');
    a.tick(1/60,m);
    for(let i=0;i<100;i++){ponte.x+=.01;a.tick(1/60,m);}
    assert.ok(Math.abs(a.corpo.x-1)<.02);assert.equal(a.corpo.y,1);
});

it('acompanha pequenos movimentos sem ficar dando passos a cada oscilação', () => {
    const a=new AgenteJogador({x:0,y:0,z:0}),m=sala();
    m.jogador={x:7,y:0,z:0};a.comandar('seguir');rodar(a,m,5);
    const x=a.corpo.x;
    for(let i=0;i<10;i++){m.jogador.x=7+(i%2)*0.3;rodar(a,m,0.4);}
    assert.ok(Math.abs(a.corpo.x-x)<0.03);
    m.jogador.x=10;rodar(a,m,3);assert.ok(a.corpo.x>x+2);
});
it('entra fisicamente no elevador ao seguir o player junto à porta', () => {
    const a=new AgenteJogador({x:0,y:0,z:-7}),m=sala();
    m.paredes=[...F11_PAREDES,...ELEV_W];m.saida={x:0,y:0,z:-13};
    m.jogador={x:0,y:0,z:-10.6};a.comandar('seguir');rodar(a,m,6);
    assert.ok(a.corpo.z<=-10.5,JSON.stringify(a.corpo));
});
it('abandona um objeto que desapareceu e procura outro disponível', () => {
    const a=new AgenteJogador({x:0,y:0,z:0}),m=sala();let usou=false;
    m.interacoes=[{id:'sumiu',x:10,y:0,z:0,raio:.4,disponivel:true}];rodar(a,m,.5);
    m.interacoes=[{id:'novo',x:-3,y:0,z:0,raio:.4,disponivel:true,usar:()=>{usou=true;return true;}}];
    rodar(a,m,4);assert.ok(usou);assert.equal(a.memoria.has('sumiu'),false);
});
it('atualiza o destino quando um objeto visível muda de posição', () => {
    const a=new AgenteJogador({x:0,y:0,z:0}),m=sala();let usou=false;
    m.interacoes=[{id:'movel',x:8,y:0,z:0,raio:.4,disponivel:true}];rodar(a,m,.5);
    m.interacoes=[{id:'movel',x:0,y:0,z:6,raio:.4,disponivel:true,usar:()=>{
        assert.ok(Math.hypot(a.corpo.x,a.corpo.z-6)<.4);usou=true;return true;
    }}];rodar(a,m,5);assert.ok(usou);
});
it('recalcula ao esbarrar numa barreira que não anunciou revisão', () => {
    const a=new AgenteJogador({x:-4,y:0,z:0}),m=sala();
    m.saida={x:4,y:0,z:0};a.comandar('embarcar');rodar(a,m,.5);
    m.paredes.push([0,-3,0,3]);rodar(a,m,12);
    assert.ok(Math.hypot(a.corpo.x-4,a.corpo.z)<.35,JSON.stringify(a.corpo));
});
