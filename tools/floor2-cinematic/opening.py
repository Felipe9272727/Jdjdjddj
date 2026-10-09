"""Manim draws the opening over the Blender well; no dialogue is baked into the film."""
from manim import *
config.background_opacity=0
config.frame_width=14.222222
config.frame_height=8
class Abismo(Scene):
    def construct(self):
        self.add(Mobject().add_updater(lambda m,dt: None))
        title=Text('O ABISMO',font='DejaVu Serif',color='#e0efed',weight=BOLD).scale(.9)
        title.move_to(UP*.2)
        label=Text('ANDAR 02',font='DejaVu Sans',color='#8aacb3').scale(.24)
        label.next_to(title,UP,buff=.3)
        line=Line(LEFT*1.3,RIGHT*1.3,stroke_width=1.3,color='#79afb4')
        line.next_to(title,DOWN,buff=.35)
        self.play(FadeIn(label,shift=UP*.06),FadeIn(title,shift=UP*.10),Create(line),run_time=20/24)
        self.wait(1.25)
        self.play(FadeOut(VGroup(label,title,line),shift=DOWN*.08),run_time=22/24)
