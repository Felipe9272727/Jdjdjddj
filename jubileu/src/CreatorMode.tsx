// ─── CREATOR MODE ─────────────────────────────────────────────────────────
// Painel de criador: permite escolher o andar diretamente no menu principal.
// Para remover: apague este arquivo e remova as marcações CREATOR MODE em
// MainMenu.tsx e App.tsx (procure por "// ─── CREATOR MODE").
// ─── CREATOR MODE ─────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { f3Demo } from './f3Hazards';
import { f4Demo } from './floor4Sfx';

export interface FloorOption {
  id: string;           // unique (cards can share a level, e.g. the cutscene)
  level: number;
  name: string;
  label?: string;       // overrides the "Andar N" prefix in the card header
  description: string;
  color: string;        // Tailwind gradient classes
  icon: React.ReactNode;
  variant?: string;     // optional dev variant (e.g. 'fallDemo' → Floor 3 fall cutscene)
}

export const FLOORS: FloorOption[] = [
  {
    id: 'floor-0',
    level: 0,
    name: 'Saguão',
    description: 'Lobby do elevador — ponto de partida',
    color: 'from-amber-500 via-yellow-400 to-amber-500',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3H21m-3.75 3H21" />
      </svg>
    ),
  },
  {
    id: 'floor-1',
    level: 1,
    name: 'Casa do Barney',
    description: 'Visita noturna — sobreviva até o elevador',
    color: 'from-red-500 via-rose-500 to-red-600',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
      </svg>
    ),
  },
  {
    id: 'floor-2',
    level: 2,
    name: 'Submerso',
    description: 'Abismo subaquático — colete os fragmentos',
    color: 'from-cyan-400 via-blue-500 to-cyan-400',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c-1.2 0-2.4.6-3 1.5C8.4 3.6 7.2 3 6 3c-2.4 0-4.5 2.1-4.5 4.5C1.5 12 12 21 12 21s10.5-9 10.5-13.5C22.5 5.1 20.4 3 18 3c-1.2 0-2.4.6-3 1.5-.6-.9-1.8-1.5-3-1.5z" />
      </svg>
    ),
  },
  {
    id: 'floor-3',
    level: 3,
    name: 'Andar 3',
    description: 'Parkour rubber-hose nas nuvens',
    color: 'from-emerald-400 via-green-500 to-emerald-400',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
  },
  {
    id: 'floor-4',
    level: 4,
    name: 'Andar 4 (2D)',
    label: 'Andar 4',
    description: 'O saguão destruído em 2D pixel (spawn direto, sem a viagem)',
    color: 'from-slate-400 via-zinc-300 to-slate-400',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.75L12 4.5l8.25 5.25L12 15 3.75 9.75z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 14.25L12 19.5l8.25-5.25" />
      </svg>
    ),
  },
  {
    id: 'floor-4-transition',
    level: 4,
    name: 'Transição → 2D',
    label: 'Transição',
    description: 'A viagem completa de 20s: elevador 3D → pixelação aos 10s → 2D',
    color: 'from-fuchsia-500 via-purple-500 to-indigo-500',
    variant: 'floor4Transition',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h4v4H4zM10 6h4v4h-4zM16 6h4v4h-4zM4 14h6v6H4zM14 14h6v6h-6z" />
      </svg>
    ),
  },
  {
    id: 'floor-4-keeper',
    level: 4,
    name: 'Diálogo do Recepcionista',
    label: 'Diálogo',
    description: 'Pula direto pra fogueira com o Primeiro Recepcionista (arco completo)',
    color: 'from-amber-600 via-orange-500 to-red-500',
    variant: 'floor4Keeper',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
      </svg>
    ),
  },
  {
    id: 'floor-5',
    level: 5,
    name: 'A Corrida (N64)',
    description: 'Corrida estilo Mario 64 contra o robô TROCO-64 — duas pistas',
    color: 'from-lime-400 via-emerald-400 to-teal-400',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h2.25L7.5 19.5h9l2.25-15H21M7.5 8.25h13.1M6.75 12.75h13.1" />
        <circle cx="9" cy="21" r="1" /><circle cx="16.5" cy="21" r="1" />
      </svg>
    ),
  },
  {
    id: 'floor-6-suite',
    level: 6,
    name: 'O Hóspede que Sabia Demais',
    label: 'Andar 6',
    description: 'Escape room na Suíte 612 — o elevador quebra, ache as 3 peças',
    color: 'from-amber-500 via-orange-400 to-red-400',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
      </svg>
    ),
  },
  {
    id: 'floor-7-template',
    level: 7,
    name: 'Template (ainda não existe)',
    label: 'Andar 7',
    description: 'O Novo Baseplate — molde do próximo andar',
    color: 'from-sky-400 via-cyan-300 to-sky-400',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5h18M3 16.5l3-9h12l3 9M7.5 16.5V21m9-4.5V21M9 10.5h.01M12 10.5h.01M15 10.5h.01" />
      </svg>
    ),
  },
  {
    id: 'transition-2-3',
    level: 3,
    name: 'Transição 2 → 3',
    label: 'Cutscene',
    description: 'Intro cartoon: as luvas dão "puck puck" + ragtime',
    color: 'from-orange-300 via-amber-400 to-rose-400',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
      </svg>
    ),
  },
  {
    id: 'floor-3-fall',
    level: 3,
    name: 'Queda do Diabrete',
    label: 'Cutscene',
    description: 'Vai direto pra cutscene da derrota (o Diabrete tropeça e cai)',
    color: 'from-rose-500 via-red-500 to-rose-600',
    variant: 'fallDemo',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 12l-3 3m0 0l-3-3m3 3V9" />
      </svg>
    ),
  },
];

interface CreatorModeProps {
  onSelect: (level: number, multiplayerEnabled: boolean) => void;
  multiplayerEnabled: boolean;
}

export const CreatorMode: React.FC<CreatorModeProps> = ({ onSelect, multiplayerEnabled }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedFloor = FLOORS.find((f) => f.id === selectedId) ?? null;

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-sm mx-auto animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-500/15 border border-purple-400/30 rounded-full">
        <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
        <span className="text-purple-300 text-xs uppercase tracking-wider font-medium">Modo Criador</span>
      </div>

      <p className="text-white/50 text-xs text-center max-w-xs">
        Escolha um andar para começar diretamente. O fluxo normal do jogo será pulado.
      </p>

      {/* Floor cards — scrollable so the list never overflows the menu */}
      <div className="flex flex-col gap-2.5 w-full max-h-[46vh] overflow-y-auto overflow-x-hidden px-1 py-0.5 creator-scroll">
        <style>{`
          .creator-scroll::-webkit-scrollbar { width: 7px; }
          .creator-scroll::-webkit-scrollbar-track { background: rgba(255,255,255,0.04); border-radius: 8px; }
          .creator-scroll::-webkit-scrollbar-thumb { background: rgba(168,85,247,0.45); border-radius: 8px; }
          .creator-scroll::-webkit-scrollbar-thumb:hover { background: rgba(168,85,247,0.7); }
          .creator-scroll { scrollbar-width: thin; scrollbar-color: rgba(168,85,247,0.5) rgba(255,255,255,0.04); }
        `}</style>
        {FLOORS.map((floor) => {
          const isSelected = selectedId === floor.id;
          return (
            <button
              key={floor.id}
              onClick={() => setSelectedId(floor.id)}
              className={`
                group relative w-full text-left rounded-xl transition-all duration-200
                ${isSelected
                  ? 'ring-2 ring-white/60 bg-white/10 scale-[1.02]'
                  : 'ring-1 ring-white/10 bg-white/5 hover:bg-white/8 hover:ring-white/20'
                }
              `}
            >
              <div className="flex items-center gap-3 p-3.5">
                {/* Icon badge */}
                <div className={`
                  w-10 h-10 rounded-lg flex items-center justify-center shrink-0
                  bg-gradient-to-br ${floor.color}
                  ${isSelected ? 'opacity-100 shadow-lg' : 'opacity-60 group-hover:opacity-80'}
                  transition-opacity
                `}>
                  <span className="text-black">{floor.icon}</span>
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-white/80'}`}>
                      {floor.label ?? `Andar ${floor.level}`}
                    </span>
                    <span className={`text-xs ${isSelected ? 'text-white/70' : 'text-white/40'}`}>
                      — {floor.name}
                    </span>
                  </div>
                  <p className={`text-xs mt-0.5 ${isSelected ? 'text-white/55' : 'text-white/30'} truncate`}>
                    {floor.description}
                  </p>
                </div>

                {/* Selection indicator */}
                {isSelected && (
                  <div className="w-5 h-5 rounded-full bg-white/20 border-2 border-white/60 flex items-center justify-center shrink-0">
                    <div className="w-2 h-2 rounded-full bg-white" />
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Play button */}
      <button
        onClick={() => {
          if (selectedFloor) {
            f3Demo.fall = selectedFloor.variant === 'fallDemo';   // arm the Floor-3 fall preview
            f4Demo.ride = selectedFloor.variant === 'floor4Transition';   // arm the full 20s ride to Floor 4
            f4Demo.keeper = selectedFloor.variant === 'floor4Keeper';     // arm the fireside-dialogue jump
            onSelect(selectedFloor.level, multiplayerEnabled);
          }
        }}
        disabled={selectedFloor === null}
        className={`
          group relative w-full overflow-hidden rounded-xl transition-all duration-300
          ${selectedFloor !== null ? 'hover:scale-[1.02] active:scale-[0.98]' : 'opacity-40 cursor-not-allowed'}
        `}
      >
        <div className={`absolute -inset-0.5 bg-gradient-to-r from-purple-500 via-pink-400 to-purple-500 rounded-xl ${selectedFloor !== null ? 'opacity-70 group-hover:opacity-100 blur-sm' : 'opacity-30'} transition-opacity`} />
        <div className="relative bg-gradient-to-r from-purple-600 via-pink-500 to-purple-600 rounded-xl">
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent rounded-xl" />
          <div className="relative flex items-center justify-center gap-3 px-6 py-3.5 text-white font-bold text-sm tracking-widest">
            <span className="group-hover:tracking-[0.25em] transition-all duration-300">
              {selectedFloor ? (selectedFloor.label ? selectedFloor.name.toUpperCase() : `INICIAR NO ANDAR ${selectedFloor.level}`) : 'SELECIONE UM ANDAR'}
            </span>
            {selectedFloor !== null && (
              <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="currentColor" viewBox="0 0 24 24">
                <path d="M13.025 1l-2.847 2.828 6.176 6.176h-16.354v3.992h16.354l-6.176 6.176 2.847 2.828 10.975-11z"/>
              </svg>
            )}
          </div>
        </div>
      </button>

      {/* Warning */}
      <p className="text-white/25 text-[10px] text-center leading-tight">
        Modo de desenvolvimento. Eventos do enredo e cutscenes podem não funcionar como esperado.
      </p>
    </div>
  );
};
