import React, { useState, useEffect } from 'react';
import { useMultiplayer } from './Multiplayer';

export const MainMenu = ({ onPlay }: any) => {
  const [doorPosition, setDoorPosition] = useState(0);
  const [showContent, setShowContent] = useState(false);
  const [flickerOpacity, setFlickerOpacity] = useState(1);
  const [multiplayerEnabled, setMultiplayerEnabled] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Temporary ref for MainMenu strictly to satisfy hook, it doesn't do anything here until App passes it
  const { user, login } = useMultiplayer({ current: null as any }, { current: 0 }, "idle", false);
  
  const handlePlay = async () => {
     if (multiplayerEnabled && !user) {
         setIsLoggingIn(true);
         setLoginError('');
         try {
             await login();
         } catch(e: any) {
             console.error(e);
             setIsLoggingIn(false);
             if (e.code === 'auth/unauthorized-domain') {
                 setLoginError("Erro: Este site não está autorizado no Firebase. Adicione o domínio no painel do Firebase Authentication (Domínios Autorizados).");
             } else if (e.code === 'auth/popup-closed-by-user') {
                 setLoginError("Erro: Você fechou a janela de login antes de concluir.");
             } else {
                 setLoginError("Erro ao fazer login: " + e.message);
             }
             return;
         }
         setIsLoggingIn(false);
     }
     onPlay(multiplayerEnabled);
  };

  const handleShare = () => {
      if (typeof window !== 'undefined') {
          navigator.clipboard.writeText(window.location.href);
          setCopiedLink(true);
          setTimeout(() => setCopiedLink(false), 2000);
      }
  };

  useEffect(() => {
    const doorTimer = setTimeout(() => {
      setDoorPosition(100);
    }, 500);
    
    const contentTimer = setTimeout(() => {
      setShowContent(true);
    }, 1200);
    
    let flickerTimeout: any = null;
    const flickerInterval = setInterval(() => {
      if (Math.random() > 0.95) {
        setFlickerOpacity(0.7);
        flickerTimeout = setTimeout(() => setFlickerOpacity(1), 100);
      }
    }, 200);
    
    return () => {
      clearTimeout(doorTimer);
      clearTimeout(contentTimer);
      clearInterval(flickerInterval);
      if (flickerTimeout) clearTimeout(flickerTimeout);
    };
  }, []);
  
  return (
      <div className="absolute inset-0 z-50 overflow-hidden bg-black">
        <div className="absolute inset-0" style={{ opacity: flickerOpacity, transition: 'opacity 0.05s' }}>
          <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0f] via-[#0d0d15] to-[#05050a]" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[200%] h-[60%] bg-gradient-to-b from-amber-500/[0.03] via-transparent to-transparent" style={{ clipPath: 'polygon(40% 0%, 60% 0%, 80% 100%, 20% 100%)' }} />
          <div className="absolute inset-0 overflow-hidden">
            {[...Array(30)].map((_, i) => (
              <div
                key={i}
                className="absolute w-1 h-1 bg-yellow-200/30 rounded-full"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animation: `float ${5 + Math.random() * 10}s ease-in-out infinite`,
                  animationDelay: `${Math.random() * 5}s`,
                  transform: `scale(${0.5 + Math.random() * 1})`
                }}
              />
            ))}
          </div>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.7)_100%)]" />
        </div>
        
        <div className="absolute inset-0 pointer-events-none z-10">
          <div 
            className="absolute top-0 bottom-0 left-0 w-1/2 bg-gradient-to-r from-[#1a1a1a] via-[#252525] to-[#1f1f1f] border-r border-white/5 shadow-2xl"
            style={{ 
              transform: `translateX(-${doorPosition}%)`,
              transition: 'transform 1.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
          >
            <div className="absolute right-4 top-4 bottom-4 w-1 bg-gradient-to-b from-transparent via-white/5 to-transparent" />
            <div className="absolute right-8 top-1/2 -translate-y-1/2 w-6 h-24 rounded-full bg-white/5" />
            <div className="absolute inset-4 border border-white/[0.03] rounded-sm" />
          </div>
          
          <div 
            className="absolute top-0 bottom-0 right-0 w-1/2 bg-gradient-to-l from-[#1a1a1a] via-[#252525] to-[#1f1f1f] border-l border-white/5 shadow-2xl"
            style={{ 
              transform: `translateX(${doorPosition}%)`,
              transition: 'transform 1.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
          >
            <div className="absolute left-4 top-4 bottom-4 w-1 bg-gradient-to-b from-transparent via-white/5 to-transparent" />
            <div className="absolute left-8 top-1/2 -translate-y-1/2 w-6 h-24 rounded-full bg-white/5" />
            <div className="absolute inset-4 border border-white/[0.03] rounded-sm" />
          </div>
        </div>
        
        <div className={`absolute inset-0 z-20 flex flex-col transition-all duration-1000 ${showContent ? 'opacity-100' : 'opacity-0'}`}>
          <div className="md:hidden flex flex-col h-full pointer-events-auto">
            <div className="absolute top-6 right-6 z-50">
              <button 
                onClick={() => {
                  if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(e => {});
                  else if (document.exitFullscreen) document.exitFullscreen().catch(e => {});
                }}
                className="p-2 text-white/50 hover:text-white transition-colors bg-white/5 rounded-full backdrop-blur-sm"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              </button>
            </div>

            <div className="pt-8 pb-4 flex justify-center landscape:hidden">
              <div className="relative">
                <div className="w-20 h-10 bg-black/80 border border-amber-500/30 rounded-sm flex items-center justify-center shadow-[0_0_20px_rgba(251,191,36,0.2)]">
                  <span className="text-amber-400 text-2xl font-mono font-bold tracking-wider" style={{ textShadow: '0 0 10px rgba(251,191,36,0.5)' }}>03</span>
                </div>
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
              </div>
            </div>
            
            <div className="flex-1 flex flex-col items-center justify-center px-6 min-h-0 overflow-y-auto landscape:justify-center">
              <div className="relative mb-8 landscape:hidden" style={{ animationDelay: '0.3s' }}>
                <div className="w-32 h-44 sm:w-40 sm:h-56 max-w-[45vw] border-4 border-[#2a2a2a] rounded-t-lg bg-gradient-to-b from-[#1a1a1a] to-[#0f0f0f] shadow-[inset_0_0_30px_rgba(0,0,0,0.8)]">
                  <div className="absolute inset-2 bg-gradient-to-b from-amber-500/5 to-transparent rounded-t" />
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 w-16 h-6 bg-black rounded-sm border border-amber-500/20 flex items-center justify-center">
                    <span className="text-amber-400/80 text-sm font-mono">▲ 03</span>
                  </div>
                  <div className="absolute bottom-0 left-2 right-2 top-12 flex gap-0.5">
                    <div className="flex-1 bg-gradient-to-r from-[#333] to-[#2a2a2a] rounded-t-sm border-t border-l border-white/5" />
                    <div className="flex-1 bg-gradient-to-l from-[#333] to-[#2a2a2a] rounded-t-sm border-t border-r border-white/5" />
                  </div>
                  <div className="absolute -right-6 top-1/2 -translate-y-1/2 w-4 h-20 bg-[#1a1a1a] rounded-r border border-white/5 flex flex-col items-center justify-center gap-2 py-2">
                    <div className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
                    <div className="w-2 h-2 rounded-full bg-white/20" />
                    <div className="w-2 h-2 rounded-full bg-white/20" />
                  </div>
                </div>
                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-48 h-4 bg-gradient-to-t from-transparent to-amber-500/10 blur-sm" />
              </div>
              
              <div className="text-center mb-6 landscape:mb-4 flex-shrink-0">
                <p className="text-amber-500/50 text-xs uppercase tracking-[0.5em] mb-2 font-light landscape:hidden">Bem-vindo ao</p>
                <div className="landscape:hidden">
                  <h1 className="font-black text-white mb-1 leading-none" style={{ fontSize: 'clamp(2rem, 9vw, 3rem)', textShadow: '0 0 40px rgba(255,255,255,0.1)' }}>
                    THE NORMAL
                  </h1>
                  <h2 className="font-thin text-amber-400 tracking-[0.2em] sm:tracking-[0.3em] uppercase" style={{ fontSize: 'clamp(1.25rem, 6vw, 1.875rem)', textShadow: '0 0 20px rgba(251,191,36,0.3)' }}>
                    ELEVATOR
                  </h2>
                </div>

                <div className="hidden landscape:flex items-center justify-center gap-2">
                  <h1 className="text-3xl font-black text-white" style={{ textShadow: '0 0 20px rgba(255,255,255,0.1)' }}>
                    THE NORMAL
                  </h1>
                  <h2 className="text-3xl font-thin text-amber-400 tracking-widest uppercase" style={{ textShadow: '0 0 10px rgba(251,191,36,0.3)' }}>
                    ELEVATOR
                  </h2>
                </div>
              </div>
              
              <p className="text-white/30 text-center text-sm max-w-xs leading-relaxed landscape:hidden">
                Uma experiência liminal interativa.<br/>
                <span className="text-amber-500/40">Por favor, permaneça calmo.</span>
              </p>

              <div className="hidden landscape:block w-full max-w-xs mt-2">
                <div className="flex flex-col gap-2 mb-4 bg-black/50 border border-white/10 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                     <span className="text-white/70 text-sm font-mono tracking-widest">MULTIPLAYER</span>
                     <button onClick={() => setMultiplayerEnabled(m => !m)} className={`w-12 h-7 min-h-[28px] rounded-full transition-colors relative ring-1 ring-white/20 ${multiplayerEnabled ? 'bg-amber-500' : 'bg-gray-800'}`}>
                        <div className={`absolute top-1 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${multiplayerEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                     </button>
                  </div>
                  
                  {multiplayerEnabled && (
                      <button onClick={handleShare} className="mt-2 w-full flex items-center justify-center gap-2 border border-white/20 bg-white/5 py-2 rounded text-xs text-white hover:bg-white/10 transition-colors">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                          {copiedLink ? "Link Copiado!" : "Copiar Link para Amigo"}
                      </button>
                  )}
                  {loginError && <p className="text-red-400 text-xs mt-2 text-center">{loginError}</p>}
                </div>
                
                <button 
                  onClick={handlePlay}
                  disabled={isLoggingIn}
                  className="group relative w-full overflow-hidden rounded-lg transition-all duration-500 active:scale-[0.98]"
                >
                  <div className="absolute -inset-1 bg-gradient-to-r from-amber-500/50 via-yellow-400/50 to-amber-500/50 rounded-lg blur-lg opacity-50 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 rounded-lg">
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                    <div className="relative flex items-center justify-center gap-3 px-8 py-4 text-black font-bold text-base tracking-widest">
                      <span className="group-hover:tracking-[0.3em] transition-all duration-300">ENTRAR</span>
                      <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M13.025 1l-2.847 2.828 6.176 6.176h-16.354v3.992h16.354l-6.176 6.176 2.847 2.828 10.975-11z"/>
                      </svg>
                    </div>
                  </div>
                </button>
              </div>

            </div>
            
            <div className="p-6 pb-10 sticky bottom-0 bg-gradient-to-t from-black via-black/90 to-transparent z-40 landscape:hidden">
              <div className="flex flex-col gap-2 border border-white/10 rounded-lg mb-4 bg-black/50 backdrop-blur-md p-4">
                 <div className="flex items-center justify-between">
                     <span className="text-white/70 text-sm font-mono tracking-widest">MULTIPLAYER</span>
                     <button onClick={() => setMultiplayerEnabled(m => !m)} className={`w-12 h-7 min-h-[28px] rounded-full transition-colors relative ring-1 ring-white/20 ${multiplayerEnabled ? 'bg-amber-500' : 'bg-gray-800'}`}>
                        <div className={`absolute top-1 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${multiplayerEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                     </button>
                 </div>
                 
                 {multiplayerEnabled && (
                     <button onClick={handleShare} className="mt-2 w-full flex items-center justify-center gap-2 border border-white/20 bg-white/5 py-2.5 rounded text-sm text-white font-bold hover:bg-white/10 transition-colors">
                         <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                         {copiedLink ? "COPIADO!" : "COPIAR LINK PRA AMIGO"}
                     </button>
                 )}
                 {loginError && <p className="text-red-400 text-xs mt-2 text-center">{loginError}</p>}
              </div>

              <button 
                onClick={handlePlay}
                disabled={isLoggingIn}
                className="group relative w-full overflow-hidden rounded-lg transition-all duration-500 active:scale-[0.98]"
              >
                <div className="absolute -inset-1 bg-gradient-to-r from-amber-500/50 via-yellow-400/50 to-amber-500/50 rounded-lg blur-lg opacity-50 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 rounded-lg">
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                  <div className="relative flex items-center justify-center gap-3 px-8 py-5 text-black font-bold text-lg tracking-widest">
                    <span className="group-hover:tracking-[0.3em] transition-all duration-300">ENTRAR</span>
                    <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M13.025 1l-2.847 2.828 6.176 6.176h-16.354v3.992h16.354l-6.176 6.176 2.847 2.828 10.975-11z"/>
                    </svg>
                  </div>
                </div>
              </button>
              
              <div className="flex justify-center gap-6 mt-4 text-white/20 text-xs">
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" /></svg>
                  Toque
                </span>
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15.536a5 5 0 001.414 1.414m2.828-9.9a9 9 0 012.172-1.414" /></svg>
                  Fones
                </span>
              </div>
            </div>
          </div>
          
          <div className="hidden md:flex h-full items-center justify-center pointer-events-auto">
            <div className="flex items-center gap-10 lg:gap-24 max-w-6xl mx-auto px-8">
              <div className="relative animate-fade-in" style={{ animationDelay: '0.5s' }}>
                <div className="w-64 h-96 border-8 border-[#2a2a2a] rounded-t-2xl bg-gradient-to-b from-[#1a1a1a] to-[#0a0a0a] shadow-[inset_0_0_60px_rgba(0,0,0,0.9),0_0_80px_rgba(0,0,0,0.5)]">
                  <div className="absolute inset-4 bg-gradient-to-b from-amber-500/10 via-transparent to-transparent rounded-t-xl" />
                  <div className="absolute top-6 left-1/2 -translate-x-1/2 w-24 h-10 bg-black/90 rounded border border-amber-500/30 flex items-center justify-center shadow-[0_0_20px_rgba(251,191,36,0.3)]">
                    <span className="text-amber-400 text-2xl font-mono font-bold" style={{ textShadow: '0 0 15px rgba(251,191,36,0.8)' }}>▲ 03</span>
                  </div>
                  <div className="absolute bottom-0 left-4 right-4 top-20 flex gap-1 overflow-hidden rounded-t">
                    <div className="flex-1 bg-gradient-to-r from-[#3a3a3a] via-[#404040] to-[#353535] border-t border-l border-white/10 shadow-inner">
                      <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-black/30 to-transparent" />
                    </div>
                    <div className="w-0.5 bg-black/50" />
                    <div className="flex-1 bg-gradient-to-l from-[#3a3a3a] via-[#404040] to-[#353535] border-t border-r border-white/10 shadow-inner">
                      <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-black/30 to-transparent" />
                    </div>
                  </div>
                  <div className="absolute top-20 left-1/2 -translate-x-1/2 w-32 h-16 bg-gradient-to-b from-amber-400/20 to-transparent blur-xl" />
                </div>
                <div className="absolute -right-12 top-1/2 -translate-y-1/2 w-8 h-32 bg-[#1a1a1a] rounded-r-lg border border-white/5 flex flex-col items-center justify-center gap-3 shadow-xl">
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 shadow-[0_0_15px_rgba(251,191,36,1)] animate-pulse" />
                  <div className="w-5 h-5 rounded-full bg-white/10 border border-white/10" />
                  <div className="w-4 h-8 bg-black/50 rounded-sm mt-2 flex flex-col items-center justify-center">
                    <div className="w-2 h-0.5 bg-amber-500/50 mb-0.5" />
                    <div className="w-2 h-0.5 bg-white/20" />
                  </div>
                </div>
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-80 h-8 bg-gradient-to-t from-transparent to-amber-500/10 blur-md" />
                <div className="absolute -left-2 top-0 bottom-0 w-2 bg-gradient-to-r from-[#333] to-[#222] rounded-l" />
                <div className="absolute -right-2 top-0 bottom-0 w-2 bg-gradient-to-l from-[#333] to-[#222] rounded-r" />
              </div>
              
              <div className="flex-1 max-w-lg flex flex-col justify-center">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-full mb-4 animate-fade-in-up" style={{ animationDelay: '0.7s' }}>
                  <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                  <span className="text-amber-400/80 text-xs font-mono uppercase tracking-wider">Andar 03 • Saguão</span>
                </div>
                <div className="mb-6 animate-fade-in-up" style={{ animationDelay: '0.8s' }}>
                  <p className="text-amber-500/40 text-sm uppercase tracking-[0.5em] mb-2 font-light">Bem-vindo ao</p>
                  <h1 className="text-5xl lg:text-7xl font-black text-white leading-none mb-1" style={{ textShadow: '0 0 60px rgba(255,255,255,0.1)' }}>
                    THE <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200">NORMAL</span>
                  </h1>
                  <h2 className="text-3xl lg:text-5xl font-extralight text-white/80 tracking-[0.4em] uppercase">
                    ELEVATOR
                  </h2>
                </div>
                
                <div className="animate-fade-in-up mt-2" style={{ animationDelay: '1s' }}>
                  <div className="flex flex-col gap-3 p-4 border border-white/10 rounded-xl mb-4 bg-black/50 backdrop-blur-sm max-w-sm">
                     <div className="flex items-center justify-between">
                         <span className="text-white/70 text-sm font-mono tracking-widest">MODO MULTIPLAYER (ONLINE)</span>
                         <button onClick={() => setMultiplayerEnabled(m => !m)} className={`w-12 h-6 rounded-full transition-colors relative border border-white/20 ${multiplayerEnabled ? 'bg-amber-500' : 'bg-gray-800'}`}>
                            <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${multiplayerEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                         </button>
                     </div>
                     {multiplayerEnabled && (
                         <button onClick={handleShare} className="flex items-center justify-center gap-2 border border-white/30 bg-white/10 py-2 rounded-lg text-sm text-white font-mono hover:bg-white/20 transition-all">
                             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                             {copiedLink ? "Link na Área de Transferência!" : "Copiar Link de Convite"}
                         </button>
                     )}
                     {loginError && <p className="text-red-400 text-xs mt-1 text-center font-mono">{loginError}</p>}
                  </div>
                  <button onClick={handlePlay} disabled={isLoggingIn} className="group relative overflow-hidden rounded-xl transition-all duration-500 hover:scale-[1.02] active:scale-[0.98]">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 rounded-xl opacity-70 group-hover:opacity-100 blur-sm transition-opacity" />
                    <div className="relative bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 rounded-xl">
                      <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent rounded-xl" />
                      <div className="relative flex items-center gap-4 px-12 py-5 text-black font-bold text-xl justify-center">
                        <span className="tracking-[0.2em] group-hover:tracking-[0.3em] transition-all duration-500">{isLoggingIn ? "CONECTANDO..." : "ENTRAR NO SAGUÃO"}</span>
                        {!isLoggingIn && (
                            <svg className="w-6 h-6 group-hover:translate-x-2 transition-transform duration-300" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M13.025 1l-2.847 2.828 6.176 6.176h-16.354v3.992h16.354l-6.176 6.176 2.847 2.828 10.975-11z"/>
                            </svg>
                        )}
                      </div>
                    </div>
                  </button>
                  
                  <div className="flex gap-8 mt-6 text-white/20 text-sm">
                    <span className="flex items-center gap-2"><kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-xs font-mono">WASD</kbd> Mover</span>
                    <span className="flex items-center gap-2"><kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-xs font-mono">MOUSE</kbd> Olhar</span>
                    <span className="flex items-center gap-2"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728" /></svg> Fones</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="absolute top-6 left-6 text-white/10 text-xs font-mono hidden md:flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />SISTEMA ATIVO
          </div>
          <div className="absolute top-6 right-6 text-white/10 text-xs font-mono hidden md:flex items-center gap-2">
            <span className="text-red-500">●</span> REC<span className="ml-4">CAM_01</span>
          </div>
          <div className="absolute bottom-6 left-6 text-white/10 text-xs font-mono hidden md:block">© 2026 LIMINAL SYSTEMS</div>
          <div className="absolute bottom-6 right-6 text-white/10 text-xs font-mono hidden md:block">v1.0.3</div>
        </div>
        <div className="absolute inset-0 pointer-events-none opacity-[0.02]" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)' }} />
      </div>
  );
};
