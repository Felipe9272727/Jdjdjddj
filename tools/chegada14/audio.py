"""Som da chegada ao Andar 14, sintetizado e determinístico (sem áudio de terceiros, sem voz gerada).
Sincronizado aos planos de cinema.py (24 q/s): python3 audio.py [saida.wav] [quadros]
  (tudo em 1ª pessoa) porta 1–84 (estouro em 37) · sufoco 85–150 · queda 151–210 · chão 211–330 · capacete 331–410 · visor 411–460"""
import numpy as np, wave, os, sys

SR = 48000; FPS = 24
QUADROS = int(sys.argv[2]) if len(sys.argv) > 2 else 472
DUR = QUADROS / FPS; N = int(SR * DUR); t = np.arange(N) / SR
rng = np.random.default_rng(14)
q = lambda f: (f - 1) / FPS   # quadro do Blender → segundos


def filtrado(cor, n=N):
    """Ruído moldado no espectro: cor(freq) → ganho."""
    s = np.fft.rfft(rng.standard_normal(n)); fr = np.fft.rfftfreq(n, 1 / SR)
    x = np.fft.irfft(s * cor(fr), n); return x / (np.std(x) + 1e-9)


def env(ini, ataque, queda, forma=2.):
    """Envelope: sobe em `ataque` s, cai exponencial com constante `queda` s."""
    u = t - ini; e = np.where(u < 0, 0, np.where(u < ataque, (np.clip(u, 0, None) / max(ataque, 1e-4)) ** forma, np.exp(-(u - ataque) / queda)))
    return e


def janela(ini, dur, forma=2.):
    p = (t - ini) / dur; return np.where((p >= 0) & (p <= 1), np.sin(np.clip(p, 0, 1) * np.pi) ** forma, 0.)


def convolve(x, ir):
    n = len(x) + len(ir) - 1; m = 1 << (n - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(x, m) * np.fft.rfft(ir, m), m)[:len(x)]


vento = filtrado(lambda f: 1 / (1 + (f / 380) ** 2))
assobio = filtrado(lambda f: np.exp(-((f - 900) / 500) ** 2))
sopro = filtrado(lambda f: np.exp(-((f - 1400) / 1100) ** 2) + .5 * np.exp(-((f - 2600) / 600) ** 2))   # respiração: formantes de "h"
areia = filtrado(lambda f: np.exp(-((f - 3500) / 2500) ** 2))
grave = filtrado(lambda f: 1 / (1 + (f / 90) ** 4))
abafado = filtrado(lambda f: 1 / (1 + (f / 260) ** 4))

DENTRO = q(406)   # o capacete fecha na cabeça
fora = np.clip((DENTRO - t) / .25, 0, 1); dentro = 1 - fora

amb = np.zeros(N); perto = np.zeros(N)   # amb: o mundo de fora; perto: o corpo, a respiração (vai para o capacete)

# ── o deserto: vento em rajadas, um zumbido grave do planeta ──
raj = .65 + .35 * np.sin(t * .7) + .2 * np.sin(t * 1.9 + 1)
amb += .05 * vento * raj + .012 * assobio * np.clip(np.sin(t * .45), 0, 1) ** 2
amb += .02 * np.sin(2 * np.pi * (34 * t + .3 * np.sin(t * .5))) * np.clip(t / 2, 0, 1)

# ── a porta: a luz vaza (rangido grave), ESTOURA, e vai se apagando ──
amb += janela(q(1), q(37) - q(1), 1.) * .06 * np.sin(2 * np.pi * (46 * t + 8 * t ** 2 / DUR))
inch = np.clip((t - q(20)) / (q(37) - q(20)), 0, 1) ** 3 * (t < q(37))
amb += inch * (.25 * filtrado(lambda f: np.exp(-((f - 700) / 900) ** 2)))   # o sopro que antecede o estouro
amb += env(q(37), .01, .55) * (.6 * grave + .25 * vento + .5 * np.sin(2 * np.pi * 42 * np.clip(t - q(37), 0, None)))
amb += env(q(37), .02, 1.6) * .12 * assobio
for f0 in (39, 43):   # as folhas batem nas dobradiças
    u = np.clip(t - q(f0), 0, None); amb += (t >= q(f0)) * np.exp(-u * 18) * .25 * np.sin(2 * np.pi * 130 * u) * np.exp(-u * 3)

# ── engasgos (porta e queda): sopros curtos, travados, com a glote batendo ──
for ini, d in ((q(90), .34), (q(102), .3), (q(113), .3), (q(124), .26), (q(134), .24), (q(143), .2)):
    trava = .55 + .45 * np.sign(np.sin(2 * np.pi * 26 * t))
    perto += janela(ini, d, 1.5) * .22 * sopro * trava
# ── a queda: baques na areia e a areia escorrendo ──
for f0, a in ((159, .9), (170, .7), (182, .8), (194, .6), (203, .4)):
    u = np.clip(t - q(f0), 0, None)
    amb += (t >= q(f0)) * np.exp(-u * 16) * a * (.5 * grave + .35 * np.sin(2 * np.pi * 58 * u))
    amb += env(q(f0), .005, .35) * a * .16 * areia
amb += janela(q(150), q(212) - q(150), .6) * .07 * areia

# ── no chão: o fôlego que não vem (cada vez mais curto e rápido) e o coração disparando ──
k0, k1 = q(211), q(406)
tk = k0
while tk < k1 - .2:
    p = (tk - k0) / (k1 - k0)
    d = .6 - .35 * p; perto += janela(tk, d, 1.2) * (.2 + .1 * p) * sopro * (.6 + .4 * np.sign(np.sin(2 * np.pi * (18 + 14 * p) * t)))
    tk += d + .45 - .3 * p
tb = q(88)
while tb < DUR - .3:
    p = np.clip((tb - k0) / (k1 - k0), 0, 1) if tb < DENTRO else 1 - np.clip((tb - DENTRO) / 1.8, 0, .7)
    for atraso, a in ((0, .5), (.17, .3)):
        u = np.clip(t - tb - atraso, 0, None); perto += (t >= tb + atraso) * np.exp(-u * 28) * a * .3 * np.sin(2 * np.pi * 48 * u)
    tb += .95 - .45 * p
# ── as mãos arranhando a areia, a madeira do capacete ──
for f0 in (268, 290, 310, 336, 350):   # o corpo se arrastando na areia
    perto += janela(q(f0), .3, 1.) * .12 * areia * (.6 + .4 * np.sin(2 * np.pi * 31 * t))
for f0, a in ((380, .5), (392, .2), (402, .3)):   # agarra (madeira oca), ergue, encosta no ombro
    u = np.clip(t - q(f0), 0, None)
    perto += (t >= q(f0)) * np.exp(-u * 22) * a * (np.sin(2 * np.pi * 210 * u) + .6 * np.sin(2 * np.pi * 330 * u) + .3 * np.sin(2 * np.pi * 520 * u))

# ── o capacete fecha: TUM oco + o selo de latão, e o mundo de fora some para longe ──
u = np.clip(t - DENTRO, 0, None)
perto += (t >= DENTRO) * np.exp(-u * 9) * (.5 * np.sin(2 * np.pi * 95 * u) + .3 * np.sin(2 * np.pi * 160 * u)) + env(DENTRO, .002, .04) * .25 * areia
perto += env(DENTRO + .14, .002, .03) * .3 * np.sin(2 * np.pi * 2400 * np.clip(t - DENTRO - .14, 0, None))   # o trinco
perto += janela(DENTRO + .1, .5, 1.) * .05 * filtrado(lambda f: np.exp(-((f - 5000) / 2000) ** 2))   # o selo chiando
# o primeiro fôlego de verdade: longo, fundo; e a expiração devagar
perto += janela(DENTRO + .55, 1.3, 1.) * .34 * sopro * np.clip((t - DENTRO - .55) / 1.3 + .3, 0, 1)
perto += janela(DENTRO + 1.95, 1.4, 1.5) * .16 * sopro

# dentro do capacete: o mundo de fora abafado e o som do corpo ecoando na madeira (pente de 3–7 ms)
ir = np.zeros(int(SR * .06)); ir[0] = 1
for ms, g in ((3.1, .45), (4.7, .35), (6.9, .25), (11., .15), (17., .08)): ir[int(SR * ms / 1000)] += g
perto_capacete = convolve(perto, ir) * .7
mundo = amb * fora + (.9 * abafado * .05 * raj + convolve(amb, np.exp(-np.arange(400) / 60) / 30)) * dentro
mix = mundo + perto * fora + perto_capacete * dentro
mix = np.tanh(mix * 1.1) * np.minimum(1, t / .6) * np.minimum(1, (DUR - t) / .5)
st = np.column_stack([mix + .004 * np.roll(vento, 90) * fora, mix + .004 * np.roll(vento, 211) * fora])
st *= .85 / max(.85, np.max(np.abs(st)))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'frames/chegada.wav')
os.makedirs(os.path.dirname(out), exist_ok=True)
with wave.open(out, 'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((st * 32767).astype('<i2').tobytes())
print(out, f'{DUR:.2f}s')
