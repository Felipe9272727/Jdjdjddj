"""Manim: os gráficos da chegada ao Andar 14 (fundo transparente, PNGs).
  manim -t --format=png -r 1280,608 --fps 24 titulo.py Titulo     → título KESSAR-9 riscado em traço
  manim -t --format=png -r 1280,608 --fps 24 titulo.py Folego      → a linha da respiração achatando até 0%"""
from manim import *
import numpy as np

AMBAR = "#ffcf8a"; VERMELHO = "#ff4a3a"

class Titulo(Scene):
    def construct(self):
        t = Text("KESSAR-9", font="DejaVu Serif", weight=BOLD, color=AMBAR).scale(1.6)
        sub = Text("andar 14", font="DejaVu Serif", slant=ITALIC, color=AMBAR).scale(.55).next_to(t, DOWN, buff=.35)
        linha = Line(LEFT * 3.4, RIGHT * 3.4, color=AMBAR, stroke_width=2).next_to(sub, DOWN, buff=.25)
        self.play(DrawBorderThenFill(t, run_time=1.6, rate_func=smooth))
        self.play(Create(linha, run_time=.5), FadeIn(sub, shift=UP * .15, run_time=.6))
        self.wait(1.2)
        self.play(FadeOut(VGroup(t, sub, linha), shift=UP * .2, run_time=.6))

class Folego(Scene):
    def construct(self):
        # o traço da respiração: ondas que vão ficando curtas e rápidas, e achatam
        eixo = ValueTracker(0)
        def onda():
            k = eixo.get_value()
            amp = 1.0 * (1 - k) ** 1.5; freq = 1.2 + 4 * k
            f = lambda x: amp * np.sin(freq * x * 2) * np.exp(-((x % 2.6) - 1.3) ** 2 * (1 + 3 * k))
            return FunctionGraph(f, x_range=[-5.5, 5.5], color=interpolate_color(ManimColor(AMBAR), ManimColor(VERMELHO), k), stroke_width=4).shift(DOWN * 2.2)
        g = always_redraw(onda)
        rot = always_redraw(lambda: Text(f"O₂  {int(round((1 - eixo.get_value()) * 21))}%", font="DejaVu Sans Mono", color=interpolate_color(ManimColor(AMBAR), ManimColor(VERMELHO), eixo.get_value())).scale(.6).to_corner(DR, buff=.5))
        self.add(g, rot)
        self.play(eixo.animate.set_value(1), run_time=4.5, rate_func=rate_functions.ease_in_quad)
        self.wait(.5)
