"""Manim: os gráficos das cutscenes do final do Andar 14 (fundo transparente, PNG 1280×608, 24 q/s).
  manim -t --format=png -r 1280,608 --fps 24 titulo_final.py PontoCego      → "O PONTO CEGO" (≈3 s)
  manim -t --format=png -r 1280,608 --fps 24 titulo_final.py AntiSimulacao  → "ANTI-SIMULAÇÃO" (≈3 s)
  manim -t --format=png -r 1280,608 --fps 24 titulo_final.py Selo           → o selo que gira sobre o portal (≈4 s)
O Remotion (Final14.jsx) põe cada sequência por cima dos quadros do Blender."""
from manim import *
import numpy as np

VIOLETA = "#c9a6ff"; AMBAR = "#ffcf8a"; config.background_opacity = 0
config.frame_height = 8; config.frame_width = 8 * 1280 / 608


def relogio(cena):
    cena.add(Mobject().add_updater(lambda m, dt: None))


def cartela(cena, titulo, sub, cor):
    t = Text(titulo, font="DejaVu Serif", weight=BOLD, color=cor).scale(1.05)
    s = Text(sub, font="DejaVu Serif", slant=ITALIC, color=cor).scale(.42).next_to(t, DOWN, buff=.28)
    l = Line(LEFT * 2.6, RIGHT * 2.6, color=cor, stroke_width=2).next_to(s, DOWN, buff=.2)
    g = VGroup(t, s, l).to_edge(UP, buff=.75); relogio(cena)
    cena.play(DrawBorderThenFill(t, run_time=1.1, rate_func=smooth))
    cena.play(Create(l, run_time=.35), FadeIn(s, shift=UP * .1, run_time=.4))
    cena.wait(.8)
    cena.play(FadeOut(g, shift=UP * .2, run_time=.5))


class PontoCego(Scene):
    def construct(self): cartela(self, "O PONTO CEGO", "sob a cratera de Kessar-9", VIOLETA)


class AntiSimulacao(Scene):
    def construct(self): cartela(self, "ANTI-SIMULAÇÃO", "o que ela não sabe desenhar", AMBAR)


class Selo(Scene):
    """Um selo geométrico (círculos, polígonos estrelados, marcas) que se desenha e gira — achatado em
    perspectiva para deitar sobre o portal no chão."""
    def construct(self):
        relogio(self)
        aneis = VGroup(*[Circle(radius=r, color=VIOLETA, stroke_width=w, stroke_opacity=o) for r, w, o in ((2.6, 3, .9), (2.3, 1.5, .6), (1.5, 2, .8), (.7, 1.5, .6))])
        estrela = Polygram([[np.cos(a) * 2.3, np.sin(a) * 2.3, 0] for a in np.linspace(0, TAU * 3, 8, endpoint=False) + PI / 2], color=VIOLETA, stroke_width=2)
        hexa = RegularPolygon(6, radius=1.5, color=AMBAR, stroke_width=2)
        marcas = VGroup(*[Line(ORIGIN, RIGHT * .22, color=VIOLETA, stroke_width=2).shift(RIGHT * 2.38).rotate(a, about_point=ORIGIN) for a in np.linspace(0, TAU, 36, endpoint=False)])
        runas = VGroup(*[Text(c, font="DejaVu Sans", color=AMBAR).scale(.32).move_to([np.cos(a) * 1.9, np.sin(a) * 1.9, 0])
                         for c, a in zip("Ꝏ⟁⌬⟟⍜⌖", np.linspace(0, TAU, 6, endpoint=False) + PI / 6)])
        base = VGroup(aneis, estrela, hexa, marcas, runas)
        ang = ValueTracker(0); achata = [[1, 0, 0], [0, .38, 0], [0, 0, 1]]
        deitado = lambda: base.copy().rotate(ang.get_value(), about_point=ORIGIN).apply_matrix(achata).shift(DOWN * 1.2)   # gira no plano do chão
        selo = deitado()
        self.play(LaggedStart(*[Create(m) for m in selo[:4]], FadeIn(selo[4]), lag_ratio=.25, run_time=2.2))
        self.remove(selo); selo = always_redraw(deitado); self.add(selo)
        self.play(ang.animate.set_value(1.4), run_time=1.6, rate_func=linear)
        selo.clear_updaters(); self.play(FadeOut(selo, scale=1.3), run_time=.7)
