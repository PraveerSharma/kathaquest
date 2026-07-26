import json
import os

from manim import (
    BLUE,
    DOWN,
    FadeIn,
    GREEN,
    GrowArrow,
    LaggedStart,
    LEFT,
    MoveAlongPath,
    ORANGE,
    ORIGIN,
    PURPLE,
    RIGHT,
    Scene,
    Text,
    UP,
    VGroup,
    WHITE,
    YELLOW,
    Arrow,
    Circle,
    Create,
    Dot,
    RoundedRectangle,
)


COLORS = [BLUE, GREEN, ORANGE, PURPLE, YELLOW]


def fit_label(value: str) -> str:
    clean = " ".join(value.split())
    return clean[:42] if clean else "Idea"


class GeneratedLessonScene(Scene):
    def construct(self):
        job = json.loads(os.environ["KATHAQUEST_RENDER_JOB"])
        title = Text(fit_label(job["title"]), font_size=38, color=WHITE)
        title.to_edge(UP)
        labels = [fit_label(item) for item in job["labels"][:5]]
        template = job["template"]
        self.play(FadeIn(title))

        if template == "orbit":
            center = Dot(ORIGIN, radius=0.35, color=ORANGE)
            orbit = Circle(radius=2.1, color=BLUE)
            satellite = Dot(orbit.point_at_angle(0), radius=0.18, color=YELLOW)
            center_label = Text(labels[0], font_size=25).next_to(center, DOWN)
            outer_label = Text(
                labels[1] if len(labels) > 1 else "Orbit",
                font_size=24,
            ).next_to(orbit, DOWN)
            self.play(Create(orbit), FadeIn(center), FadeIn(center_label))
            self.play(
                MoveAlongPath(satellite, orbit),
                FadeIn(outer_label),
                run_time=4,
            )
        elif template == "layers":
            rings = VGroup(
                *[
                    Circle(
                        radius=0.72 + index * 0.58,
                        color=COLORS[index % len(COLORS)],
                    )
                    for index in range(max(2, min(4, len(labels))))
                ],
            )
            captions = VGroup(
                *[
                    Text(label, font_size=22, color=COLORS[index % len(COLORS)])
                    for index, label in enumerate(labels[:4])
                ],
            ).arrange(DOWN, aligned_edge=LEFT).to_edge(RIGHT)
            rings.shift(LEFT * 1.6)
            self.play(
                LaggedStart(*[Create(ring) for ring in reversed(rings)], lag_ratio=0.25),
                FadeIn(captions),
            )
        else:
            nodes = VGroup(
                *[
                    RoundedRectangle(
                        width=2.35,
                        height=1.0,
                        corner_radius=0.18,
                        color=COLORS[index % len(COLORS)],
                    ).add(
                        Text(label, font_size=20).move_to(ORIGIN),
                    )
                    for index, label in enumerate(labels[:4])
                ],
            ).arrange(RIGHT, buff=0.75).scale_to_fit_width(11)
            arrows = VGroup(
                *[
                    Arrow(
                        nodes[index].get_right(),
                        nodes[index + 1].get_left(),
                        buff=0.1,
                        color=WHITE,
                    )
                    for index in range(len(nodes) - 1)
                ],
            )
            self.play(
                LaggedStart(*[FadeIn(node, shift=UP * 0.25) for node in nodes], lag_ratio=0.2),
            )
            if len(arrows):
                self.play(LaggedStart(*[GrowArrow(arrow) for arrow in arrows], lag_ratio=0.2))

        self.wait(1.5)
