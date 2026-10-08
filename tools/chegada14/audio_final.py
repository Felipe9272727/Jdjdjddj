"""Som das cutscenes do final do Andar 14 (sintetizado, determinístico; sem áudio de terceiros).
    python3 audio_final.py   → frames/descida.wav (15 s) e frames/portal.wav (20 s), sincronizados a final.py (24 q/s)"""
import numpy as np, wave, os

SR = 48000; FPS = 24
AQUI = os.path.dirname(os.path.abspath(__file__))
rng = np.random.default_rng(1414)


def faixa(quadros):
    N = int(SR * quadros / FPS); t = np.arange(N) / SR
    def filtrado(cor):
        s = np.fft.rfft(rng.standard_normal(N)); fr = np.fft.rfftfreq(N, 1 / SR)
        x = np.fft.irfft(s * cor(fr), N); return x / (np.std(x) + 1e-9)
    q = lambda f: (f - 1) / FPS
    def env(ini, ataque, queda):
        u = t - ini; return np.where(u < 0, 0, np.where(u < ataque, np.clip(u, 0, None) / max(ataque, 1e-4), np.exp(-(u - ataque) / queda)))
    def janela(ini, dur, forma=2.):
        p = (t - ini) / dur; return np.where((p >= 0) & (p <= 1), np.sin(np.clip(p, 0, 1) * np.pi) ** forma, 0.)
    def liso(a, b):
        x = np.clip((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x)
    return N, t, filtrado, q, env, janela, liso


def grava(nome, x):
    x = np.tanh(x * 1.1); x *= .85 / max(.85, np.max(np.abs(x)))
    st = np.column_stack([x, np.roll(x, 37) * .97])
    out = os.path.join(AQUI, 'frames', nome); os.makedirs(os.path.dirname(out), exist_ok=True)
    with wave.open(out, 'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((st * 32767).astype('<i2').tobytes())
    print(out)


# ═════════ DESCIDA (360 quadros) ═════════
N, t, filtrado, q, env, janela, liso = faixa(360)
vento = filtrado(lambda f: 1 / (1 + (f / 380) ** 2)); grave = filtrado(lambda f: 1 / (1 + (f / 90) ** 4))
areia = filtrado(lambda f: np.exp(-((f - 3500) / 2500) ** 2)); chiado = filtrado(lambda f: np.exp(-((f - 6000) / 1800) ** 2))
fora = 1 - liso(q(200), q(300))                                    # o vento some conforme desce
x = .05 * vento * (.7 + .3 * np.sin(t * .8)) * fora
x += janela(q(36), q(62) - q(36), 1.) * (.3 * grave + .12 * areia)  # a pedra sobe raspando
x += env(q(60), .01, .3) * .35 * grave
u = np.clip(t - q(119), 0, None); x += (t >= q(119)) * (np.exp(-u * 40) * .4 * np.sin(2 * np.pi * 1800 * u) + np.exp(-u * 3) * .18 * np.sin(2 * np.pi * 62 * u))   # o botão
x += liso(q(128), q(165)) * (1 - liso(q(300), q(340))) * (.05 * np.sin(2 * np.pi * 110 * t) + .03 * np.sin(2 * np.pi * 220 * t) + .02 * chiado)   # as juntas
x += env(q(160), .01, .5) * .3 * grave
motor = liso(q(185), q(200)) * (1 - liso(q(325), q(335)))
x += motor * (.16 * grave * (1 + .3 * np.sin(2 * np.pi * 7 * t)) + .06 * np.sin(2 * np.pi * (48 + 4 * np.sin(t)) * t) + .03 * areia)
metal = filtrado(lambda f: np.exp(-((f - 1400) / 500) ** 2))
x += janela(q(168), q(196) - q(168), 1.) * (.12 * metal * (1 + .5 * np.sin(2 * np.pi * 13 * t)) + .1 * areia)   # a grade de latão rasga a areia
u = np.clip(t - q(196), 0, None); x += (t >= q(196)) * np.exp(-u * 18) * .2 * np.sin(2 * np.pi * 420 * u)        # trava no lugar
x += env(q(190), .005, .25) * .55 * grave + env(q(193), .003, .12) * .25 * metal                                   # o tranco
x += env(q(330), .02, .6) * .4 * grave                             # chega ao fundo
x += janela(q(334), q(352) - q(334), 1.2) * (.1 * metal + .08 * grave)                                              # a porta desliza
x += liso(q(300), q(345)) * (.05 * np.sin(2 * np.pi * 174.6 * t) + .04 * np.sin(2 * np.pi * 261.6 * t))   # a porta: um acorde quente
x *= np.minimum(1, t / .5) * np.minimum(1, (t[-1] - t) / .6)
ir = np.zeros(int(SR * .5)); ir[0] = 1
for ms, g in ((70, .4), (140, .28), (230, .18), (360, .1)): ir[int(SR * ms / 1000)] = g
eco = np.fft.irfft(np.fft.rfft(x, 2 * N) * np.fft.rfft(ir, 2 * N), 2 * N)[:N]
grava('descida.wav', x * (1 - .5 * liso(q(220), q(260))) + eco * .6 * liso(q(200), q(260)))

# ═════════ PORTAL (480 quadros) ═════════
N, t, filtrado, q, env, janela, liso = faixa(480)
zumbido = np.sin(2 * np.pi * 60 * t) * .02 + np.sin(2 * np.pi * 120 * t) * .01
ar = filtrado(lambda f: np.exp(-((f - 500) / 400) ** 2)); vidro = filtrado(lambda f: np.exp(-((f - 7000) / 3000) ** 2))
grave = filtrado(lambda f: 1 / (1 + (f / 80) ** 4)); brilho = filtrado(lambda f: np.exp(-((f - 3200) / 900) ** 2))
x = zumbido + .015 * ar
for k in range(14):   # a mistura borbulha na mão
    b = q(rng.uniform(1, 60)); u = np.clip(t - b, 0, None); x += (t >= b) * np.exp(-u * 30) * .05 * np.sin(2 * np.pi * (500 + 300 * rng.random()) * u * (1 + u * 4))
x += janela(q(56), q(74) - q(56), 1.5) * .22 * ar * np.clip((t - q(56)) / .6, 0, 1)   # o assobio do arremesso
u = np.clip(t - q(72), 0, None); x += (t >= q(72)) * np.exp(-u * 9) * (.5 * vidro + .2 * grave)   # estilhaça
for k in range(10):
    b = q(72) + rng.uniform(.05, .6); u = np.clip(t - b, 0, None); x += (t >= b) * np.exp(-u * 60) * .12 * np.sin(2 * np.pi * rng.uniform(3000, 7000) * u)   # cacos tinindo
abre = liso(q(76), q(140))
x += abre * (.18 * grave * (.8 + .2 * np.sin(2 * np.pi * .5 * t)) + .05 * brilho * (.5 + .5 * np.sin(2 * np.pi * 3 * t)))
x += abre * (.04 * np.sin(2 * np.pi * (55 + 30 * abre) * t) + .025 * np.sin(2 * np.pi * (110 + 60 * abre) * t))
mergulho = liso(q(415), q(478))
x += mergulho * (.35 * ar + .25 * grave + .08 * brilho)
x *= np.minimum(1, t / .4) * np.minimum(1, (t[-1] - t) / .3)
grava('portal.wav', x)
