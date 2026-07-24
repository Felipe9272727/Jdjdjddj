import type { NpcMsg } from './npcStore';
import { retrieveFloor10Canon } from './floor10Canon';

// ── ROTEADOR DE FALA DO HÓSPEDE ───────────────────────────────────────────
// Esta micro-IA não gera texto e não baixa outro modelo. Ela mede sinais
// linguísticos baratos (tamanho, múltiplas perguntas, pedido de raciocínio,
// continuação contextual e presença de um trecho direto no RAG) e escolhe o
// cérebro certo ANTES da inferência:
// - simple  → Qwen3.5-0.8B + RAG enxuto;
// - complex → Qwen3.5-2B + contexto completo.
//
// Em dúvida, preservamos qualidade e mandamos para o 2B. Uma decisão nunca é
// alterada no meio da resposta.

export type Floor10ModelRoute = 'simple' | 'complex';

export type Floor10RouteDecision = {
    route: Floor10ModelRoute;
    confidence: number;
    reason: string;
    simpleScore: number;
    complexScore: number;
};

function normalize(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase()
        .replace(/[^\p{L}\p{N}\s?!]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const COMPLEX_PATTERNS: readonly RegExp[] = [
    /\b(?:por que|porque|como assim|explique|analise|compare|interprete|raciocin|motivo|consequencia)\b/,
    /\b(?:e se|imagine|hipotetic|o que voce faria|como voce faria|qual seria seu plano|estrateg)\b/,
    /\b(?:conte|conta|fale) (?:uma historia|mais sobre|sobre sua vida)\b/,
    /\b(?:talvez|pode ser|voce acha|o que acha|suspeita|deduz|significa)\b/,
    /\b(?:confia|confiaria|perdoa|perdoaria|sente por mim|acha de mim|significa para voce)\b/,
    /\b(?:why|how come|explain|analy[sz]e|compare|reason|consequence|what if|imagine|hypothetical|what would you do|plan|strategy)\b/,
    /\b(?:tell me a story|tell me more|tell me about your life)\b/,
    /\b(?:maybe|perhaps|might be|do you think|what do you think|suspect|infer|means)\b/,
    /\b(?:trust me|forgive me|feel about me|think about me|mean to you)\b/,
    /\b(?:por que|explica|analiza|compara|interpreta|razon|consecuencia|que pasaria si|imagina|hipotetic|que harias|plan|estrategia)\b/,
    /\b(?:cuenta una historia|cuentame mas|habla de tu vida)\b/,
    /\b(?:quizas|tal vez|puede ser|crees que|que piensas|sospecha|deduce|significa)\b/,
    /\b(?:confias|perdonas|sientes por mi|piensas de mi|significo para ti)\b/,
];

const DIRECT_SIMPLE_PATTERNS: readonly RegExp[] = [
    /^(?:oi|ola|opa|eai|e ai|bom dia|boa tarde|boa noite|tudo bem|como vai)\b/,
    /^(?:hi|hello|hey|good morning|good afternoon|good evening|how are you)\b/,
    /^(?:hola|buenos dias|buenas tardes|buenas noches|como estas)\b/,
    /\b(?:qual e seu nome|quem e voce|quantos anos|qual sua idade|qual sua profissao|onde trabalhava)\b/,
    /\b(?:what is your name|who are you|how old are you|what is your job|where did you work)\b/,
    /\b(?:como te llamas|quien eres|cuantos anos|que edad tienes|cual es tu trabajo)\b/,
    /\b(?:meu nome e|eu me chamo|i am called|my name is|me llamo)\b/,
];

const CONTEXT_FOLLOW_UP = /^(?:por que|porque|como assim|e depois|e voce|mas como|why|how come|then what|and you|but how|por que|y despues|y tu|pero como)[\s?!]*$/;

function patternHit(text: string, patterns: readonly RegExp[]): boolean {
    return patterns.some((pattern) => pattern.test(text));
}

function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
}

export function classifyFloor10Question(
    userText: string,
    history: readonly NpcMsg[] = [],
): Floor10RouteDecision {
    const text = normalize(userText);
    const words = text.match(/[\p{L}\p{N}]+/gu) ?? [];
    const wordCount = words.length;
    const questionCount = (text.match(/\?/g) ?? []).length;
    const canonHits = retrieveFloor10Canon(text, 2).length;
    const hasComplexRequest = patternHit(text, COMPLEX_PATTERNS);
    const hasDirectSimpleRequest = patternHit(text, DIRECT_SIMPLE_PATTERNS);
    const isContextFollowUp = history.length > 0 && CONTEXT_FOLLOW_UP.test(text);
    const connectors = text.match(/\b(?:e|mas|entao|porque|tambem|and|but|then|because|also|y|pero|entonces|porque|tambien)\b/g)?.length ?? 0;

    let simpleScore = 0;
    let complexScore = 0;
    const simpleReasons: string[] = [];
    const complexReasons: string[] = [];

    if (wordCount <= 7) {
        simpleScore += 3;
        simpleReasons.push('mensagem curta');
    } else if (wordCount <= 14) {
        simpleScore += 1;
        simpleReasons.push('mensagem direta');
    }
    if (hasDirectSimpleRequest) {
        simpleScore += 4;
        simpleReasons.push('intenção simples conhecida');
    }
    if (canonHits > 0 && wordCount <= 18 && !hasComplexRequest) {
        simpleScore += 3;
        simpleReasons.push('resposta coberta diretamente pelo RAG');
    }

    if (hasComplexRequest) {
        complexScore += 5;
        complexReasons.push('pede raciocínio ou interpretação');
    }
    if (isContextFollowUp) {
        complexScore += 5;
        complexReasons.push('depende do contexto anterior');
    }
    if (wordCount > 24) {
        complexScore += 4;
        complexReasons.push('mensagem longa');
    } else if (wordCount > 16) {
        complexScore += 2;
        complexReasons.push('mensagem com várias informações');
    }
    if (questionCount > 1) {
        complexScore += 3;
        complexReasons.push('múltiplas perguntas');
    }
    if (connectors >= 3) {
        complexScore += 2;
        complexReasons.push('múltiplas relações entre ideias');
    }

    // Sem um sinal claro de simplicidade, o 2B é a escolha segura. Isso evita
    // economizar alguns segundos ao custo de uma resposta rasa ou incoerente.
    const route: Floor10ModelRoute = simpleScore >= 3 && simpleScore > complexScore
        ? 'simple'
        : 'complex';
    const margin = Math.abs(simpleScore - complexScore);
    const confidence = clamp01(0.56 + margin * 0.07);
    const reasons = route === 'simple' ? simpleReasons : complexReasons;

    return {
        route,
        confidence,
        reason: reasons[0] ?? (route === 'simple'
            ? 'pergunta curta e factual'
            : 'sem padrão simples confiável'),
        simpleScore,
        complexScore,
    };
}
