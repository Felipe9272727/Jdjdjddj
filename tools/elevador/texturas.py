"""Texturas art déco da cabine, desenhadas no Manim (geometria exata, sem pintar à mão).
  python3 texturas.py <pasta_saida>
Gera: teto-sol.png (medalhão do teto), mostrador.png (face do ponteiro de andares),
piso-rosa.png (rosa dos ventos do piso)."""
import sys, os, numpy as np
from manim import *

OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
OURO, OURO_ESC, CREME, MADEIRA, PRETO = '#d9a93a', '#8a6420', '#f3e6c4', '#3a2116', '#141014'
config.background_color = MADEIRA
config.pixel_width = config.pixel_height = 1024
config.frame_width = config.frame_height = 8

def salvar(cena_cls, nome):
    config.output_file = nome
    c = cena_cls(); c.render()
    img = c.renderer.get_frame()
    from PIL import Image
    Image.fromarray(img).convert('RGB').save(os.path.join(OUT, nome + '.png'))

class Sol(Scene):
    """Leque/sol nascente em anéis: o medalhão clássico de teto de hotel de 1930."""
    def construct(self):
        g = VGroup()
        g.add(Circle(3.95, color=OURO, stroke_width=14))
        g.add(Circle(3.75, color=OURO_ESC, stroke_width=4))
        for i in range(32):
            a = i * TAU / 32
            raio = 3.6 if i % 2 == 0 else 2.9
            g.add(Line(1.15 * np.array([np.cos(a), np.sin(a), 0]), raio * np.array([np.cos(a), np.sin(a), 0]),
                       color=OURO if i % 2 == 0 else OURO_ESC, stroke_width=10 if i % 2 == 0 else 5))
        for r in (1.15, 1.6):
            g.add(Circle(r, color=OURO, stroke_width=9))
        g.add(Circle(0.95, fill_color=CREME, fill_opacity=1, stroke_color=OURO, stroke_width=10))
        for k in range(8):
            a = k * TAU / 8
            g.add(Polygon(*[2.25 * np.array([np.cos(a + d), np.sin(a + d), 0]) for d in (-0.09, 0.09)],
                          3.25 * np.array([np.cos(a), np.sin(a), 0]), color=OURO, fill_color=OURO, fill_opacity=1, stroke_width=0))
        self.add(g)

class Mostrador(Scene):
    """Meia-lua de andares 1..13, o ponteiro é geometria à parte (gira no jogo).
    Ângulo do andar n: 170° - (n-1)*(160/12)° (andar 1 à esquerda, 13 à direita)."""
    def construct(self):
        self.camera.background_color = PRETO
        c = np.array([0, -2.2, 0])
        g = VGroup(AnnularSector(inner_radius=0, outer_radius=3.9, angle=PI, start_angle=0, fill_color=CREME, fill_opacity=1).shift(c))
        g.add(Arc(3.9, 0, PI, color=OURO, stroke_width=22).shift(c))
        g.add(Arc(3.35, 0, PI, color=PRETO, stroke_width=4).shift(c))
        for n in range(1, 14):
            a = PI * (170 - (n - 1) * 160 / 12) / 180
            d = np.array([np.cos(a), np.sin(a), 0])
            g.add(Line(c + 3.35 * d, c + 3.75 * d, color=PRETO, stroke_width=7))
            t = Text(str(n), font='DejaVu Serif', weight=BOLD, color=PRETO).scale(0.42 if n < 10 else 0.36)
            t.move_to(c + 2.85 * d); g.add(t)
        for k in range(7):
            a = k * PI / 6
            g.add(Line(c + 0.6 * np.array([np.cos(a), np.sin(a), 0]), c + 2.2 * np.array([np.cos(a), np.sin(a), 0]),
                       color=OURO, stroke_width=3, stroke_opacity=0.55))
        g.add(Dot(c, radius=0.32, color=OURO))
        self.add(g)

class Rosa(Scene):
    """Rosa dos ventos de mármore para o meio do piso (troca três planos por um)."""
    def construct(self):
        self.camera.background_color = '#f5f0eb'
        g = VGroup(Circle(3.9, color=OURO, stroke_width=16), Circle(3.6, color=PRETO, stroke_width=5))
        for k in range(8):
            a = k * TAU / 8 + PI / 8 * 0
            longa = 3.5 if k % 2 == 0 else 2.4
            for lado, cor in ((1, OURO), (-1, OURO_ESC)):
                g.add(Polygon(ORIGIN, longa * np.array([np.cos(a), np.sin(a), 0]),
                              0.55 * np.array([np.cos(a + lado * PI / 8), np.sin(a + lado * PI / 8), 0]),
                              fill_color=cor, fill_opacity=1, stroke_color=PRETO, stroke_width=2))
        g.add(Circle(0.45, fill_color=PRETO, fill_opacity=1, stroke_color=OURO, stroke_width=8))
        self.add(g)

for cls, nome in ((Sol, 'teto-sol'), (Mostrador, 'mostrador'), (Rosa, 'piso-rosa')):
    salvar(cls, nome)
print('ok')
