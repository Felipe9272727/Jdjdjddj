import { describe, expect, it } from 'vitest';
import { perceiveFloor10 } from '../npc/floor10Perception';
import {
    Floor10WillBrain,
    answerFloor10WillQuestion,
    detectFloor10PlayerActionRequest,
    formatFloor10ActionRequestForPrompt,
    formatFloor10WillForPrompt,
    hasFloor10PhysicalActionCue,
    parseFloor10WillLanguageDecision,
    speedForWillGoal,
    stepFloor10Movement,
    stripFloor10WillControl,
} from '../npc/floor10Will';

const NPC = { x: 0, y: 0, z: 2.2 };

function vision(player: { x: number; y: number; z: number } | null, yaw = 0) {
    return perceiveFloor10({
        npcPosition: NPC,
        npcYaw: yaw,
        playerPosition: player,
    });
}

describe('npc/floor10Will — autonomia e desejos do hóspede', () => {
    it('escolhe se aproximar quando vê o jogador distante', () => {
        const brain = new Floor10WillBrain(7);
        const result = brain.tick({
            dt: 0.1,
            time: 0,
            perception: vision({ x: 0, y: 0, z: 8 }),
            npcPosition: NPC,
            conversationOpen: false,
            speaking: false,
        });
        expect(result.snapshot.goal).toBe('approach-player');
        expect(result.snapshot.target).toMatchObject({ x: 0, z: 8 });
        expect(result.snapshot.reason).toContain('quero me aproximar');
    });

    it('toma a iniciativa de falar quando chega perto por vontade própria', () => {
        const brain = new Floor10WillBrain(11);
        brain.tick({
            dt: 0.1,
            time: 0,
            perception: vision({ x: 0, y: 0, z: 8 }),
            npcPosition: NPC,
            conversationOpen: false,
            speaking: false,
        });
        const closePerception = perceiveFloor10({
            npcPosition: { x: 0, y: 0, z: 5.9 },
            npcYaw: 0,
            playerPosition: { x: 0, y: 0, z: 8 },
        });
        const result = brain.tick({
            dt: 0.1,
            time: 2,
            perception: closePerception,
            npcPosition: { x: 0, y: 0, z: 5.9 },
            conversationOpen: false,
            speaking: false,
        });
        expect(result.snapshot.goal).toBe('talk-player');
        expect(result.speech).toBeTruthy();
        expect(result.snapshot.drives.social).toBeLessThan(0.3);
    });

    it('completa sozinho o ciclo ver → aproximar → iniciar conversa', () => {
        const brain = new Floor10WillBrain(17);
        const player = { x: 0, y: 0, z: 8 };
        const position = { x: 0, y: 0, z: 2.2 };
        let yaw = 0;
        let speech = '';
        for (let stepIndex = 0; stepIndex < 120 && !speech; stepIndex++) {
            const time = stepIndex * 0.1;
            const perception = perceiveFloor10({
                npcPosition: position,
                npcYaw: yaw,
                playerPosition: player,
            });
            const will = brain.tick({
                dt: 0.1,
                time,
                perception,
                npcPosition: position,
                conversationOpen: false,
                speaking: false,
            });
            if (will.speech) speech = will.speech;
            const movement = stepFloor10Movement(
                position,
                will.snapshot.target,
                will.snapshot.goal === 'approach-player' ? 1.12 : 0.7,
                0.1,
            );
            position.x = movement.x;
            position.z = movement.z;
            if (movement.moving) yaw = movement.yaw;
        }
        expect(speech).not.toBe('');
        expect(Math.hypot(position.x - player.x, position.z - player.z)).toBeLessThanOrEqual(2.7);
    });

    it('cria uma intenção própria mesmo sem enxergar o jogador', () => {
        const brain = new Floor10WillBrain(5);
        const result = brain.tick({
            dt: 0.1,
            time: 0,
            perception: vision(null),
            npcPosition: NPC,
            conversationOpen: false,
            speaking: false,
        });
        expect(['inspect-elevator', 'wander']).toContain(result.snapshot.goal);
        expect(result.snapshot.target).not.toBeNull();
    });

    it('liga percepção e consequências da Utility AI à RL sem substituir a decisão-base', () => {
        const brain = new Floor10WillBrain(6);
        let snapshot = brain.tick({
            dt: 0.1,
            time: 0,
            perception: vision(null),
            npcPosition: NPC,
            conversationOpen: false,
            speaking: false,
        }).snapshot;
        for (const time of [5, 10, 15, 20, 25, 30, 35]) {
            snapshot = brain.tick({
                dt: 0.1,
                time,
                perception: vision(null),
                npcPosition: NPC,
                conversationOpen: false,
                speaking: false,
            }).snapshot;
        }
        expect(snapshot.learning).toMatchObject({
            source: 'floor10-dueling-double-dqn',
            parameterCount: 13835,
        });
        expect(snapshot.learning.experiences).toBeGreaterThan(0);
        expect(['inspect-elevator', 'wander', 'idle']).toContain(snapshot.goal);
    });

    it('procura a última posição vista quando o jogador sai do campo de visão', () => {
        const brain = new Floor10WillBrain(21);
        brain.tick({
            dt: 0.1,
            time: 0,
            perception: vision({ x: 0, y: 0, z: 8 }),
            npcPosition: NPC,
            conversationOpen: false,
            speaking: false,
        });
        const lost = brain.tick({
            dt: 0.1,
            time: 4.5,
            perception: vision(null),
            npcPosition: NPC,
            conversationOpen: false,
            speaking: false,
        });
        expect(lost.snapshot.goal).toBe('seek-player');
        expect(lost.snapshot.target).toMatchObject({ x: 0, z: 8 });
    });

    it('interrompe o deslocamento e presta atenção durante uma conversa', () => {
        const brain = new Floor10WillBrain(9);
        const result = brain.tick({
            dt: 0.1,
            time: 0,
            perception: vision({ x: 0, y: 0, z: 4 }),
            npcPosition: NPC,
            conversationOpen: true,
            speaking: false,
        });
        expect(result.snapshot).toMatchObject({
            goal: 'observe-player',
            target: null,
            moving: false,
        });
    });

    it('só transforma um pedido físico em ação quando o 2B aceita', () => {
        expect(detectFloor10PlayerActionRequest('Nilo, me segue.')).toBe('follow-player');
        expect(detectFloor10PlayerActionRequest('Follow me, please.')).toBe('follow-player');
        expect(detectFloor10PlayerActionRequest('Ven conmigo.')).toBe('follow-player');
        expect(detectFloor10PlayerActionRequest('Não me siga mais.')).toBe('resume-autonomy');
        expect(detectFloor10PlayerActionRequest('Espere aqui.')).toBe('wait');
        expect(detectFloor10PlayerActionRequest('Entre no elevador.')).toBe('enter-elevator');
        expect(detectFloor10PlayerActionRequest('Explore esta sala.')).toBe('explore-room');
        expect(detectFloor10PlayerActionRequest('Você gosta de café?')).toBeNull();
        expect(hasFloor10PhysicalActionCue('Vire-se devagar.')).toBe(true);
        expect(hasFloor10PhysicalActionCue('Pode me dizer onde você está?')).toBe(false);

        const accepted = parseFloor10WillLanguageDecision(
            'Me segue.',
            'Tudo bem. Vou com você. [[WILL:FOLLOW_PLAYER]]',
        );
        expect(accepted).toEqual({
            visibleReply: 'Tudo bem. Vou com você.',
            command: 'follow-player',
        });
        expect(parseFloor10WillLanguageDecision(
            'Me segue.',
            'Não. Ainda não confio em você. [[WILL:NONE]]',
        ).command).toBeNull();
        expect(parseFloor10WillLanguageDecision(
            'Você pode fazer alguma coisa perto da porta?',
            'Vou examinar a entrada. [[WILL:INSPECT_ELEVATOR]]',
        ).command).toBe('inspect-elevator');
        for (const partial of ['[', '[[', '[[W', '[[WILL:', '[[WILL:FOL']) {
            expect(stripFloor10WillControl(`Vou com você. ${partial}`)).toBe('Vou com você.');
        }
        expect(formatFloor10ActionRequestForPrompt('Me segue.')).toContain('Isso é um pedido, não uma ordem');
        expect(formatFloor10ActionRequestForPrompt('Você gosta de café?')).toBe('');
    });

    it('executa pedidos aceitos como diretivas e depois devolve o controle à vontade', () => {
        const brain = new Floor10WillBrain(37);
        brain.applyLanguageDecision('enter-elevator', 0, 'Tudo bem, vou entrar.');
        const entering = brain.tick({
            dt: 0.1,
            time: 0.1,
            perception: vision(null),
            npcPosition: NPC,
            conversationOpen: false,
            speaking: false,
        }).snapshot;
        expect(entering).toMatchObject({
            goal: 'enter-elevator',
            activeDirective: 'enter-elevator',
            target: { x: 0, z: -12 },
            moving: true,
        });
        expect(answerFloor10WillQuestion('O que você quer fazer?', entering))
            .toContain('aceitei o seu pedido');

        const autonomousAgain = brain.tick({
            dt: 0.1,
            time: 13,
            perception: vision(null),
            npcPosition: NPC,
            conversationOpen: false,
            speaking: false,
        }).snapshot;
        expect(autonomousAgain.activeDirective).toBeNull();
        expect(autonomousAgain.goal).not.toBe('enter-elevator');
    });

    it('uma diretiva temporária não apaga o compromisso persistente de seguir', () => {
        const brain = new Floor10WillBrain(41);
        brain.applyLanguageDecision('follow-player', 0, 'Vou com você.');
        brain.applyLanguageDecision('wait', 1, 'Vou esperar um pouco.');
        const waiting = brain.tick({
            dt: 0.1,
            time: 1.1,
            perception: vision({ x: 0, y: 0, z: 8 }),
            npcPosition: NPC,
            conversationOpen: false,
            speaking: false,
        }).snapshot;
        expect(waiting).toMatchObject({
            goal: 'wait',
            commitment: 'follow-player',
            activeDirective: 'wait',
        });

        const followingAgain = brain.tick({
            dt: 0.1,
            time: 10,
            perception: vision({ x: 0, y: 0, z: 8 }),
            npcPosition: NPC,
            conversationOpen: false,
            speaking: false,
        }).snapshot;
        expect(followingAgain).toMatchObject({
            goal: 'follow-player',
            commitment: 'follow-player',
            activeDirective: null,
        });
    });

    it('cumpre no corpo o compromisso aceito pelo 2B e para quando ele aceita cancelar', () => {
        const brain = new Floor10WillBrain(31);
        brain.applyLanguageDecision('follow-player', 0, 'Tudo bem, vou com você.');

        const whileTalking = brain.tick({
            dt: 0.1,
            time: 0.1,
            perception: vision({ x: 0, y: 0, z: 8 }),
            npcPosition: NPC,
            conversationOpen: true,
            speaking: false,
        }).snapshot;
        expect(whileTalking.goal).toBe('observe-player');
        expect(whileTalking.commitment).toBe('follow-player');
        expect(whileTalking.commitmentReason).toBe('Tudo bem, vou com você.');

        const following = brain.tick({
            dt: 0.1,
            time: 1,
            perception: vision({ x: 0, y: 0, z: 8 }),
            npcPosition: NPC,
            conversationOpen: false,
            speaking: false,
        }).snapshot;
        expect(following).toMatchObject({
            goal: 'follow-player',
            commitment: 'follow-player',
            target: { x: 0, z: 8 },
            moving: true,
        });
        expect(speedForWillGoal(following.goal)).toBeGreaterThan(1);
        expect(answerFloor10WillQuestion('O que você quer fazer?', following))
            .toContain('escolhi te seguir');

        brain.applyLanguageDecision('resume-autonomy', 2);
        const autonomousAgain = brain.tick({
            dt: 0.1,
            time: 2.1,
            perception: vision(null),
            npcPosition: NPC,
            conversationOpen: false,
            speaking: false,
        }).snapshot;
        expect(autonomousAgain.commitment).toBeNull();
        expect(autonomousAgain.goal).not.toBe('follow-player');
    });

    it('move em passos limitados e usa a abertura real do elevador', () => {
        const normal = stepFloor10Movement(
            { x: 0, z: 2 },
            { x: 3, z: 2 },
            1,
            0.1,
        );
        expect(normal).toMatchObject({ x: 0.1, z: 2, moving: true });

        const towardElevator = stepFloor10Movement(
            { x: 2, z: -8 },
            { x: 0, z: -12 },
            1,
            0.1,
        );
        expect(towardElevator.x).toBeLessThan(2);
        expect(towardElevator.z).toBeLessThan(-8);
        expect(Math.hypot(towardElevator.x - 2, towardElevator.z + 8)).toBeLessThanOrEqual(0.101);
    });

    it('explica a própria escolha sem pedir uma geração ao LLM', () => {
        const brain = new Floor10WillBrain(7);
        const snapshot = brain.tick({
            dt: 0.1,
            time: 0,
            perception: vision({ x: 0, y: 0, z: 8 }),
            npcPosition: NPC,
            conversationOpen: false,
            speaking: false,
        }).snapshot;
        expect(answerFloor10WillQuestion('O que você quer fazer?', snapshot))
            .toContain('Agora eu quero');
        expect(answerFloor10WillQuestion('Where are you going?', snapshot))
            .toContain('Right now I want');
        expect(answerFloor10WillQuestion('¿Dónde vas?', snapshot))
            .toContain('Ahora quiero');
        expect(answerFloor10WillQuestion('Qual é seu nome?', snapshot)).toBeNull();
        expect(formatFloor10WillForPrompt(snapshot)).toContain('VONTADE ATUAL');
        expect(formatFloor10WillForPrompt(snapshot)).toContain('Compromisso verbal ativo');
    });
});
