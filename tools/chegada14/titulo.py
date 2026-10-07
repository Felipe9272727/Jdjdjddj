"""Manim: os gráficos da chegada ao Andar 14 (fundo transparente, sequência de PNG 1280×608 a 24 q/s).
  manim -t --format=png -r 1280,608 --fps 24 titulo.py Titulo   → KESSAR-9 riscado em traço (≈2,9 s)
  manim -t --format=png -r 1280,608 --fps 24 titulo.py Folego   → o traço da respiração achatando, O₂ 21% → 2% (≈8,3 s)
  manim -t --format=png -r 1280,608 --fps 24 titulo.py Alivio   → o primeiro fôlego dentro do capacete, O₂ volta a 21% (≈2 s)
O Remotion (Chegada14.jsx) põe cada sequência por cima dos quadros do Blender."""
from manim import *
import numpy as np

AMBAR = "#ffcf8a"; VERMELHO = "#ff4a3a"; config.background_opacity = 0
config.frame_height = 8; config.frame_width = 8 * 1280 / 608   # quadro largo: sem isto o topo e o pé saem cortados


def relogio(cena):
    """Sem isto o Manim grava UM quadro só para cada self.wait() parado, e a sequência sai curta."""
    cena.add(Mobject().add_updater(lambda m, dt: None))


def traco(k, fase, cor):
    """A onda da respiração: k=0 fôlego largo e lento; k→1 curto, rápido e achatado."""
    amp = .55 * (1 - k) ** 1.3 + .04; freq = 1.1 + 3.4 * k
    f = lambda x: amp * np.sin(freq * x * 2 - fase) * np.exp(-(((x + fase * .3) % 2.8) - 1.4) ** 2 * (1 + 3 * k))
    return FunctionGraph(f, x_range=[-2.6, 2.6], color=cor, stroke_width=3)


def leitura(valor, cor):
    return Text(f"O₂ {valor:4.1f}%", font="DejaVu Sans Mono", color=cor).scale(.42)


def painel(k, fase, valor):
    cor = interpolate_color(ManimColor(AMBAR), ManimColor(VERMELHO), min(1, k * 1.2))
    g = traco(k, fase, cor)
    moldura = RoundedRectangle(width=5.6, height=1.5, corner_radius=.12, stroke_color=cor, stroke_width=1.2, stroke_opacity=.45, fill_color="#120806", fill_opacity=.35)
    t = leitura(valor, cor).next_to(moldura, UP, buff=.12, aligned_edge=LEFT)
    return VGroup(moldura, g, t).scale(.62).to_corner(DR, buff=.45)


class Titulo(Scene):
    def construct(self):
        t = Text("KESSAR-9", font="DejaVu Serif", weight=BOLD, color=AMBAR).scale(1.25)
        sub = Text("andar 14", font="DejaVu Serif", slant=ITALIC, color=AMBAR).scale(.45).next_to(t, DOWN, buff=.3)
        linha = Line(LEFT * 2.8, RIGHT * 2.8, color=AMBAR, stroke_width=2).next_to(sub, DOWN, buff=.22)
        grupo = VGroup(t, sub, linha).to_edge(UP, buff=.7); relogio(self)
        self.play(DrawBorderThenFill(t, run_time=1.2, rate_func=smooth))
        self.play(Create(linha, run_time=.4), FadeIn(sub, shift=UP * .12, run_time=.45))
        self.wait(.8)
        self.play(FadeOut(grupo, shift=UP * .2, run_time=.5))


class Folego(Scene):
    def construct(self):
        k = ValueTracker(0); fase = ValueTracker(0)
        p = always_redraw(lambda: painel(k.get_value(), fase.get_value(), 21 * (1 - k.get_value()) + 2 * k.get_value()))
        self.add(p)
        # 200 quadros (8,3 s): do chão até as mãos alcançarem o capacete
        self.play(k.animate.set_value(1), fase.animate.set_value(38), run_time=200 / 24, rate_func=rate_functions.ease_in_quad)


class Alivio(Scene):
    def construct(self):
        k = ValueTracker(1); fase = ValueTracker(0); relogio(self)
        p = always_redraw(lambda: painel(k.get_value(), fase.get_value(), 21 * (1 - k.get_value()) + 2 * k.get_value()))
        self.add(p)
        self.play(k.animate.set_value(0), fase.animate.set_value(6), run_time=1.5, rate_func=rate_functions.ease_out_cubic)
        self.wait(.2)
        p.clear_updaters(); self.play(FadeOut(p), run_time=.4)
