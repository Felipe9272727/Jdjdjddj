/**
 * CarregandoAndar — a tela de carregamento PADRÃO na troca de andar (todos menos o 13, que tem a sua).
 *
 * Quem decide quando sair é o próprio Canvas: `SinalDeAndarPronto` (dentro dele) espera os downloads
 * terminarem (useProgress), compila os shaders do andar novo (compileAsync, sem travar a tela) e deixa
 * 3 quadros desenharem — só então a tela animada some. Fica no mínimo MIN s (para a animação não piscar)
 * e no máximo MAX s (nada prende o jogador para sempre).
 */
import React, { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useProgress } from '@react-three/drei';

const MIN = 1.8, MAX = 15;
/** O estado compartilhado entre o sinal (no Canvas) e a tela (fora dele). */
export const carregamentoDoAndar = { nivel: -1, pronto: true, ouvintes: new Set<() => void>() };
const avisar = () => carregamentoDoAndar.ouvintes.forEach((f) => f());

/** Fora do Canvas: começa o carregamento quando o nível muda; devolve se a tela deve aparecer. */
export function useCarregandoAndar(nivel: number, ignorar: boolean): boolean {
    const [visivel, setVisivel] = useState(false);
    const desde = useRef(0);
    useEffect(() => {
        if (ignorar) { setVisivel(false); return; }
        carregamentoDoAndar.nivel = nivel; carregamentoDoAndar.pronto = false; desde.current = performance.now();
        setVisivel(true);
        const checa = () => {
            const t = (performance.now() - desde.current) / 1000;
            if ((carregamentoDoAndar.pronto && t >= MIN) || t >= MAX) setVisivel(false);
        };
        carregamentoDoAndar.ouvintes.add(checa);
        const id = window.setInterval(checa, 250);
        return () => { carregamentoDoAndar.ouvintes.delete(checa); window.clearInterval(id); };
    }, [nivel, ignorar]);
    return visivel;
}

/** Dentro do Canvas: avisa quando o andar novo baixou tudo, compilou e já desenhou alguns quadros. */
export function SinalDeAndarPronto({ nivel }: { nivel: number }) {
    const { gl, scene, camera } = useThree();
    const { active } = useProgress();
    const fase = useRef<'espera' | 'compilando' | 'quadros' | 'pronto'>('espera');
    const quadros = useRef(0);
    useEffect(() => { fase.current = 'espera'; quadros.current = 0; }, [nivel]);
    useFrame(() => {
        if (carregamentoDoAndar.nivel !== nivel || carregamentoDoAndar.pronto) return;
        if (fase.current === 'espera' && !active) {
            fase.current = 'compilando';
            // compila tudo o que está na cena agora (o andar novo já montou) sem bloquear a thread
            const r = (gl as unknown as { compileAsync?: (s: unknown, c: unknown) => Promise<unknown> }).compileAsync?.(scene, camera);
            // a compilação vale só para o andar que a pediu: se o jogador já trocou de andar, ela não
            // pode marcar o novo como pronto antes da hora
            const meu = nivel;
            (r ?? Promise.resolve()).catch(() => {}).then(() => { if (carregamentoDoAndar.nivel === meu && fase.current === 'compilando') fase.current = 'quadros'; });
        } else if (fase.current === 'quadros' && ++quadros.current >= 3) {
            fase.current = 'pronto'; carregamentoDoAndar.pronto = true; avisar();
        }
    });
    return null;
}
