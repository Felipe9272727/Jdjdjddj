import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getPlayerName } from './Multiplayer';

// ─── Chat Message Interface ─────────────────────────────────────────────────
export interface ChatMessage {
    id: string;
    name: string;
    text: string;
    timestamp: number;
}

// ─── Name color hashing (deterministic per player name) ─────────────────────
const NAME_COLORS = [
    '#f87171', '#fb923c', '#fbbf24', '#4ade80',
    '#38bdf8', '#a78bfa', '#f472b6', '#2dd4bf',
    '#e879f9', '#60a5fa', '#34d399', '#f59e0b',
];

export const getNameColor = (name: string, isMe: boolean): string => {
    if (isMe) return '#ffffff';
    const hash = (name || '').split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0);
    return NAME_COLORS[hash % NAME_COLORS.length];
};

// ─── Roblox-style Chat Window ───────────────────────────────────────────────
interface RobloxChatProps {
    messages: ChatMessage[];
    currentUserId: string;
    onSend: (msg: string) => void;
    enabled: boolean;
}

export const RobloxChat = ({ messages, currentUserId, onSend, enabled }: RobloxChatProps) => {
    const [open, setOpen] = useState(false);
    const [input, setInput] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [isDesktop, setIsDesktop] = useState(() =>
        typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
    );

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const mql = window.matchMedia('(min-width: 1024px)');
        const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
        mql.addEventListener('change', onChange);
        return () => mql.removeEventListener('change', onChange);
    }, []);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, open]);

    // Keyboard handler: "/" opens chat, Escape closes
    useEffect(() => {
        if (!enabled) return;
        const handler = (e: KeyboardEvent) => {
            if (open) {
                if (e.key === 'Escape') {
                    setOpen(false);
                    setInput('');
                }
                return;
            }
            if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                setOpen(true);
                setTimeout(() => inputRef.current?.focus(), 50);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [enabled, open]);

    const handleSend = useCallback(() => {
        const msg = input.trim();
        if (!msg) return;
        onSend(msg);
        setInput('');
        // Keep open (Roblox style) — don't close after sending
    }, [input, onSend]);

    if (!enabled) return null;

    // ─── Desktop layout ─────────────────────────────────────────────────────
    if (isDesktop) {
        return (
            <>
                {/* Chat messages panel — top-left, Roblox style */}
                <div
                    className="absolute z-[55] pointer-events-none"
                    style={{
                        top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
                        left: 'calc(env(safe-area-inset-left, 0px) + 8px)',
                        width: 'min(380px, calc(100vw - 16px))',
                        maxHeight: 'min(260px, calc(100dvh - 200px))',
                    }}
                >
                    <div
                        ref={scrollRef}
                        className="flex flex-col gap-0 overflow-y-auto scrollbar-hide rounded-lg"
                        style={{
                            background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.40) 100%)',
                            backdropFilter: 'blur(8px)',
                            WebkitBackdropFilter: 'blur(8px)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            padding: '6px 0',
                        }}
                    >
                        {messages.length === 0 && (
                            <div className="text-white/15 text-[11px] font-mono text-center py-3 px-4">
                                Press / to chat
                            </div>
                        )}
                        {messages.slice(-30).map((msg, i) => {
                            const age = Date.now() - msg.timestamp;
                            const fadeOut = age > 25000;
                            const opacity = fadeOut ? Math.max(0, 1 - (age - 25000) / 5000) : 1;
                            const isMe = msg.id === currentUserId;
                            const nameColor = getNameColor(msg.name, isMe);
                            return (
                                <div
                                    key={`${msg.id}-${msg.timestamp}-${i}`}
                                    className="px-3 py-[2px] transition-opacity duration-500"
                                    style={{ opacity }}
                                >
                                    <span className="text-[13px] leading-snug" style={{ fontFamily: '"Source Sans 3", "Segoe UI", sans-serif' }}>
                                        <span className="font-extrabold" style={{ color: nameColor }}>
                                            {msg.name}
                                        </span>
                                        <span className="text-white/30 font-normal">: </span>
                                        <span className="text-white/90 font-normal">{msg.text}</span>
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Chat input bar — top, below messages */}
                {open ? (
                    <div
                        className="absolute z-[65] pointer-events-auto"
                        style={{
                            top: 'calc(env(safe-area-inset-top, 0px) + 8px + min(260px, calc(100dvh - 200px)) + 6px)',
                            left: 'calc(env(safe-area-inset-left, 0px) + 8px)',
                            width: 'min(380px, calc(100vw - 16px))',
                        }}
                    >
                        <div
                            className="flex items-center gap-0 overflow-hidden rounded-lg"
                            style={{
                                background: 'rgba(30, 30, 30, 0.9)',
                                backdropFilter: 'blur(12px)',
                                WebkitBackdropFilter: 'blur(12px)',
                                border: '1px solid rgba(255,255,255,0.15)',
                                boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                            }}
                        >
                            <span className="text-white/30 text-xs font-bold px-2.5 shrink-0 select-none">Chat:</span>
                            <input
                                ref={inputRef}
                                type="text"
                                value={input}
                                onChange={e => setInput(e.target.value.slice(0, 200))}
                                onKeyDown={e => {
                                    e.stopPropagation();
                                    if (e.key === 'Enter') handleSend();
                                    if (e.key === 'Escape') { setOpen(false); setInput(''); }
                                }}
                                placeholder="Type here..."
                                maxLength={200}
                                className="flex-1 bg-transparent text-white text-[13px] font-normal placeholder-white/20 outline-none py-2.5 pr-3"
                                style={{ fontFamily: '"Source Sans 3", "Segoe UI", sans-serif' }}
                                autoFocus
                            />
                        </div>
                    </div>
                ) : (
                    <div
                        className="absolute z-40 pointer-events-auto"
                        style={{
                            top: 'calc(env(safe-area-inset-top, 0px) + 8px + min(260px, calc(100dvh - 200px)) + 6px)',
                            left: 'calc(env(safe-area-inset-left, 0px) + 8px)',
                        }}
                    >
                        <button
                            onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-colors"
                            style={{
                                background: 'rgba(30, 30, 30, 0.6)',
                                border: '1px solid rgba(255,255,255,0.08)',
                            }}
                        >
                            <span className="text-white/20 text-[11px] font-mono">Press / to chat</span>
                        </button>
                    </div>
                )}
            </>
        );
    }

    // ─── Mobile layout ──────────────────────────────────────────────────────
    return (
        <>
            {open ? (
                /* Full chat window — Roblox mobile style */
                <div
                    className="absolute z-[65] pointer-events-auto"
                    style={{
                        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
                        left: 'calc(env(safe-area-inset-left, 0px) + 8px)',
                        right: 'calc(env(safe-area-inset-right, 0px) + 8px)',
                        maxHeight: 'min(340px, 50dvh)',
                    }}
                >
                    <div
                        className="flex flex-col overflow-hidden rounded-xl"
                        style={{
                            background: 'rgba(20, 20, 20, 0.85)',
                            backdropFilter: 'blur(16px)',
                            WebkitBackdropFilter: 'blur(16px)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                        }}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-3 py-2 border-b border-white/8">
                            <span className="text-white/50 text-[11px] font-bold tracking-wider uppercase" style={{ fontFamily: '"Source Sans 3", "Segoe UI", sans-serif' }}>
                                Chat
                            </span>
                            <button
                                onClick={() => { setOpen(false); setInput(''); }}
                                className="text-white/30 hover:text-white/70 text-lg font-bold leading-none w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 active:bg-white/20 transition-colors"
                            >
                                ×
                            </button>
                        </div>

                        {/* Messages */}
                        <div
                            ref={scrollRef}
                            className="flex-1 overflow-y-auto scrollbar-hide px-2.5 py-1"
                            style={{ maxHeight: 'calc(min(340px, 50dvh) - 90px)' }}
                        >
                            {messages.length === 0 && (
                                <div className="text-white/15 text-[11px] font-mono text-center py-4">
                                    No messages yet
                                </div>
                            )}
                            {messages.slice(-30).map((msg, i) => {
                                const isMe = msg.id === currentUserId;
                                const nameColor = getNameColor(msg.name, isMe);
                                return (
                                    <div key={`${msg.id}-${msg.timestamp}-${i}`} className="px-1 py-[3px]">
                                        <span className="text-[13px] leading-snug" style={{ fontFamily: '"Source Sans 3", "Segoe UI", sans-serif' }}>
                                            <span className="font-extrabold" style={{ color: nameColor }}>
                                                {msg.name}
                                            </span>
                                            <span className="text-white/30 font-normal">: </span>
                                            <span className="text-white/90 font-normal">{msg.text}</span>
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Input */}
                        <div className="border-t border-white/8 px-2 py-1.5 flex items-center gap-1.5">
                            <input
                                ref={inputRef}
                                type="text"
                                value={input}
                                onChange={e => setInput(e.target.value.slice(0, 200))}
                                onKeyDown={e => {
                                    e.stopPropagation();
                                    if (e.key === 'Enter') handleSend();
                                }}
                                placeholder="Type here..."
                                maxLength={200}
                                className="flex-1 bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-[13px] font-normal placeholder-white/15 outline-none focus:border-white/25 transition-colors"
                                style={{ fontFamily: '"Source Sans 3", "Segoe UI", sans-serif' }}
                            />
                            <button
                                onClick={handleSend}
                                className="bg-white/12 hover:bg-white/20 text-white/80 hover:text-white font-bold px-3 py-2 rounded-lg text-sm active:scale-95 transition-all shrink-0"
                            >
                                Send
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                /* Chat button — bottom-left, Roblox style */
                <button
                    onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 100); }}
                    className="absolute z-50 pointer-events-auto tap-target"
                    style={{
                        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
                        left: 'calc(env(safe-area-inset-left, 0px) + 8px)',
                    }}
                >
                    <div
                        className="flex items-center justify-center w-11 h-11 active:scale-95 transition-transform"
                        style={{
                            background: 'rgba(30, 30, 30, 0.7)',
                            backdropFilter: 'blur(8px)',
                            WebkitBackdropFilter: 'blur(8px)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '10px',
                        }}
                    >
                        {/* Roblox-style chat icon */}
                        <svg className="w-5 h-5 text-white/50" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" />
                        </svg>
                    </div>
                </button>
            )}
        </>
    );
};

// ─── Bubble Chat Fallback — 2D overlay when 3D bubble fails ─────────────────
// This renders chat bubbles as CSS-positioned overlays at the top of the
// screen, similar to Roblox's classic chat behavior. Used when WebGL
// rendering fails or on low-end devices.

interface BubbleChatFallbackProps {
    messages: ChatMessage[];
    currentUserId: string;
}

export const BubbleChatFallback = ({ messages, currentUserId }: BubbleChatFallbackProps) => {
    const [visible, setVisible] = useState<ChatMessage[]>([]);

    useEffect(() => {
        const now = Date.now();
        const recent = messages.filter(m => now - m.timestamp < 8000);
        setVisible(recent.slice(-5)); // Max 5 visible at once
    }, [messages]);

    if (visible.length === 0) return null;

    return (
        <div
            className="absolute z-[50] pointer-events-none flex flex-col gap-1"
            style={{
                top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
                right: 'calc(env(safe-area-inset-right, 0px) + 8px)',
                maxWidth: 'min(300px, calc(100vw - 120px))',
            }}
        >
            {visible.map((msg, i) => {
                const isMe = msg.id === currentUserId;
                const nameColor = getNameColor(msg.name, isMe);
                const age = Date.now() - msg.timestamp;
                const opacity = age > 6000 ? Math.max(0, 1 - (age - 6000) / 2000) : 1;
                return (
                    <div
                        key={`${msg.id}-${msg.timestamp}`}
                        className="transition-opacity duration-300"
                        style={{ opacity, animation: 'chatBubblePop 0.2s ease-out' }}
                    >
                        <div
                            className="rounded-lg px-2.5 py-1.5"
                            style={{
                                background: 'rgba(0, 0, 0, 0.7)',
                                backdropFilter: 'blur(6px)',
                                border: '1px solid rgba(255,255,255,0.08)',
                            }}
                        >
                            <span className="text-[12px] leading-snug" style={{ fontFamily: '"Source Sans 3", "Segoe UI", sans-serif' }}>
                                <span className="font-extrabold" style={{ color: nameColor }}>
                                    {msg.name}
                                </span>
                                <span className="text-white/25 font-normal">: </span>
                                <span className="text-white/85 font-normal">{msg.text}</span>
                            </span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
