// ─── CREATOR MODE ─────────────────────────────────────────────────────────
// Painel de criador: permite escolher o andar diretamente no menu principal.
// Para remover: apague este arquivo e remova as marcações CREATOR MODE em
// MainMenu.tsx e App.tsx (procure por "// ─── CREATOR MODE").
// ─── CREATOR MODE ─────────────────────────────────────────────────────────

import React, { useState } from 'react';

export interface FloorOption {
  id: string;           // unique (cards can share a level, e.g. the cutscene)
  level: number;
  name: string;
  label?: string;       // overrides the "Andar N" prefix in the card header
  description: string;
  color: string;        // Tailwind gradient classes
  icon: React.ReactNode;
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
    name: 'Andar 4',
    label: 'Andar 4',
    description: 'Base plate (em construção) — blockout',
    color: 'from-slate-400 via-zinc-300 to-slate-400',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.75L12 4.5l8.25 5.25L12 15 3.75 9.75z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 14.25L12 19.5l8.25-5.25" />
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
          if (selectedFloor) onSelect(selectedFloor.level, multiplayerEnabled);
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
