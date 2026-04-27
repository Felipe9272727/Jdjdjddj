import React, { useEffect, useState, useCallback, createContext, useContext } from 'react';


export type Quality = 'low' | 'medium' | 'high';

export interface GameSettings {
    quality: Quality;
    masterVolume: number;     // 0..1
    sensitivity: number;      // 0.5..2.0 (multiplier)
    invertY: boolean;
    multiplayer: boolean;
    showFps: boolean;
    botMode: boolean;         // dev/test driver — auto-walks the player
}

const DEFAULTS: GameSettings = {
    // Mobile-first default. Bumped to 'high' on desktop in loadSettings().
    quality: 'medium',
    masterVolume: 0.8,
    sensitivity: 1.0,
    invertY: false,
    multiplayer: false,
    showFps: false,
    botMode: false,
};

const STORAGE_KEY = 'jubileu_settings_v1';

const isMobile = (): boolean => {
    if (typeof navigator === 'undefined') return false;
    return /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent || '');
};

const loadSettings = (): GameSettings => {
    try {
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
        if (raw) {
            const parsed = JSON.parse(raw) as Partial<GameSettings>;
            return { ...DEFAULTS, ...parsed };
        }
    } catch { /* ignored */ }
    // First-run heuristic: desktop gets high, mobile keeps medium.
    return { ...DEFAULTS, quality: isMobile() ? 'medium' : 'high' };
};

const saveSettings = (s: GameSettings) => {
    try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch { /* ignored */ }
};

interface Ctx {
    settings: GameSettings;
    update: (patch: Partial<GameSettings>) => void;
    reset: () => void;
}

const SettingsCtx = createContext<Ctx | null>(null);

export const SettingsProvider = ({ children }: { children: React.ReactNode }) => {
    const [settings, setSettings] = useState<GameSettings>(loadSettings);
    const update = useCallback((patch: Partial<GameSettings>) => {
        setSettings((prev) => {
            const next = { ...prev, ...patch };
            saveSettings(next);
            return next;
        });
    }, []);
    const reset = useCallback(() => {
        const fresh = { ...DEFAULTS, quality: isMobile() ? 'medium' as Quality : 'high' as Quality };
        saveSettings(fresh);
        setSettings(fresh);
    }, []);
    return (
        <SettingsCtx.Provider value={{ settings, update, reset }}>
            {children}
        </SettingsCtx.Provider>
    );
};

export const useSettings = (): Ctx => {
    const ctx = useContext(SettingsCtx);
    if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
    return ctx;
};

// Per-quality renderer profile. Read in App.tsx and AudioEngine.tsx.
export const QUALITY_PROFILES: Record<Quality, { dpr: [number, number]; far: number; antialias: boolean }> = {
    low: { dpr: [1, 1], far: 60, antialias: false },
    medium: { dpr: [1, 1.25], far: 80, antialias: true },
    high: { dpr: [1, 2], far: 120, antialias: true },
};

export const SettingsMenu = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
    const { settings, update, reset } = useSettings();
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="w-full max-w-[calc(100vw-2rem)] sm:max-w-md bg-gradient-to-b from-[#1a120a] to-black ring-1 ring-amber-500/40 rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.8)] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-4 py-2.5 sm:py-3 border-b border-amber-500/30 flex items-center justify-between">
                    <h2 className="text-amber-200 tracking-wider text-sm sm:text-base uppercase font-bold">Configurações</h2>
                    <button
                        onClick={onClose}
                        className="text-amber-200/70 hover:text-amber-100 font-mono text-2xl leading-none w-10 h-10 flex items-center justify-center rounded hover:bg-amber-500/10 active:bg-amber-500/20 transition-colors tap-target"
                        aria-label="Fechar"
                    >×</button>
                </div>

                <div className="p-3 sm:p-5 space-y-3 sm:space-y-5 text-amber-100 max-h-[70vh] overflow-y-auto scrollbar-hide">
                    <Row label="Qualidade gráfica">
                        <Segmented
                            value={settings.quality}
                            options={[
                                { value: 'low', label: 'Baixa' },
                                { value: 'medium', label: 'Média' },
                                { value: 'high', label: 'Alta' },
                            ]}
                            onChange={(v) => update({ quality: v as Quality })}
                        />
                    </Row>

                    <Row label={`Volume (${Math.round(settings.masterVolume * 100)}%)`}>
                        <input
                            type="range" min={0} max={1} step={0.05}
                            value={settings.masterVolume}
                            onChange={(e) => update({ masterVolume: parseFloat(e.target.value) })}
                            className="w-full accent-amber-500"
                        />
                    </Row>

                    <Row label={`Sensibilidade (${settings.sensitivity.toFixed(2)}x)`}>
                        <input
                            type="range" min={0.5} max={2} step={0.05}
                            value={settings.sensitivity}
                            onChange={(e) => update({ sensitivity: parseFloat(e.target.value) })}
                            className="w-full accent-amber-500"
                        />
                    </Row>

                    <Row label="Inverter eixo Y">
                        <Toggle on={settings.invertY} onChange={(on) => update({ invertY: on })} />
                    </Row>

                    <Row label="Multiplayer">
                        <Toggle on={settings.multiplayer} onChange={(on) => update({ multiplayer: on })} />
                    </Row>

                    <Row label="Mostrar FPS">
                        <Toggle on={settings.showFps} onChange={(on) => update({ showFps: on })} />
                    </Row>

                    <Row label="Modo bot (auto-teste)">
                        <Toggle on={settings.botMode} onChange={(on) => update({ botMode: on })} />
                    </Row>

                    <div className="pt-2 flex justify-between gap-2">
                        <button
                            onClick={reset}
                            className="px-3 py-1.5 rounded ring-1 ring-amber-500/30 hover:ring-amber-500/60 text-amber-200/70 hover:text-amber-100 text-xs tracking-wider uppercase"
                        >Restaurar</button>
                        <button
                            onClick={onClose}
                            className="px-4 py-1.5 rounded bg-amber-500/80 hover:bg-amber-400 text-black text-xs tracking-wider uppercase font-bold"
                        >Pronto</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
        <div className="text-xs sm:text-sm tracking-wider text-amber-300/90 mb-1.5 uppercase font-medium">{label}</div>
        {children}
    </div>
);

const Segmented = ({
    value, options, onChange,
}: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) => (
    <div className="flex bg-black/40 ring-1 ring-amber-500/20 rounded-lg overflow-hidden">
        {options.map((o) => (
            <button
                key={o.value}
                onClick={() => onChange(o.value)}
                className={`flex-1 px-3 py-2.5 min-h-[40px] text-xs font-medium tracking-wider transition-colors ${
                    value === o.value
                        ? 'bg-amber-500/80 text-black font-bold'
                        : 'text-amber-200/70 hover:bg-amber-500/10 active:bg-amber-500/20'
                }`}
            >{o.label}</button>
        ))}
    </div>
);

const Toggle = ({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) => (
    <button
        onClick={() => onChange(!on)}
        className={`relative w-12 h-7 min-h-[28px] rounded-full transition-colors ring-1 ${
            on ? 'bg-amber-500/80 ring-amber-400/60' : 'bg-black/60 ring-amber-500/30'
        }`}
        aria-pressed={on}
    >
        <span
            className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform shadow-sm ${
                on ? 'translate-x-[22px]' : 'translate-x-0.5'
            }`}
        />
    </button>
);

// Lightweight FPS counter, only mounted when settings.showFps is true.
export const FpsCounter = () => {
    const [fps, setFps] = useState(0);
    useEffect(() => {
        let raf = 0;
        let frames = 0;
        let last = performance.now();
        const loop = () => {
            frames++;
            const now = performance.now();
            if (now - last >= 500) {
                setFps(Math.round((frames * 1000) / (now - last)));
                frames = 0;
                last = now;
            }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, []);
    return (
        // FpsCounter sits above the HUD (z-[91] > settings menu would be 100,
        // so it's still under modals). top-left so it doesn't fight the
        // settings/mute buttons in the top-right corner.
        <div
            className="fixed z-[91] pointer-events-none px-2 py-1 rounded bg-black/70 ring-1 ring-amber-500/30 text-amber-200 text-[10px] font-mono tabular-nums shadow-[inset_0_1px_0_rgba(255,176,0,0.08)]"
            style={{
                top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
                left: 'calc(env(safe-area-inset-left, 0px) + 12px)',
            }}
        >
            {fps.toString().padStart(3, ' ')} FPS
        </div>
    );
};
