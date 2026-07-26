import base64
import hmac
import json
import logging
import os
import shutil
import subprocess
import uuid
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.staticfiles import StaticFiles
from imageio_ffmpeg import get_ffmpeg_exe
from pydantic import BaseModel, Field


ROOT = Path(__file__).parent
ASSETS = ROOT / "assets"
JOBS = ROOT / "jobs"
ASSETS.mkdir(exist_ok=True)
JOBS.mkdir(exist_ok=True)

app = FastAPI(title="KathaQuest visual renderer", version="1.0.0")
app.mount("/assets", StaticFiles(directory=ASSETS), name="assets")
logger = logging.getLogger("kathaquest.visual-renderer")


class RenderRequest(BaseModel):
    lessonId: str = Field(min_length=8, max_length=80)
    sceneId: str = Field(min_length=3, max_length=80)
    template: Literal["cycle", "process", "layers", "orbit"] | None = None
    title: str | None = Field(default=None, max_length=120)
    labels: list[str] = Field(default_factory=list, max_length=5)
    durationSeconds: int = Field(default=10, ge=3, le=32)
    motion: Literal["reveal", "flow", "orbit", "pulse", "pan_zoom"] | None = None
    imageBase64: str | None = None
    imageFormat: Literal["png", "jpeg", "webp"] = "png"
    format: Literal["mp4"] = "mp4"


def authorize(authorization: str | None = Header(default=None)):
    expected = os.getenv("RENDERER_API_KEY")
    if not expected:
        return
    supplied = (authorization or "").removeprefix("Bearer ").strip()
    if not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Invalid renderer token")


def public_url(filename: str) -> str:
    base = os.getenv("PUBLIC_BASE_URL", "http://localhost:8090").rstrip("/")
    return f"{base}/assets/{filename}"


def render_manim(request: RenderRequest, job_dir: Path, target: Path):
    if not request.template or not request.title or len(request.labels) < 2:
        raise HTTPException(
            status_code=422,
            detail="Manim renders require a template, title and at least two labels",
        )
    environment = {
        **os.environ,
        "KATHAQUEST_RENDER_JOB": json.dumps(
            {
                "template": request.template,
                "title": request.title,
                "labels": request.labels,
            },
            ensure_ascii=False,
        ),
    }
    subprocess.run(
        [
            "manim",
            "-ql",
            "--disable_caching",
            "--media_dir",
            str(job_dir),
            str(ROOT / "render_templates.py"),
            "GeneratedLessonScene",
        ],
        check=True,
        capture_output=True,
        env=environment,
        timeout=100,
    )
    candidates = list(job_dir.rglob("*.mp4"))
    if not candidates:
        raise RuntimeError("Manim produced no MP4")
    shutil.move(str(max(candidates, key=lambda item: item.stat().st_mtime)), target)


def render_image_motion(request: RenderRequest, job_dir: Path, target: Path):
    if not request.imageBase64:
        raise HTTPException(status_code=422, detail="imageBase64 is required")
    if len(request.imageBase64) > 24_000_000:
        raise HTTPException(status_code=413, detail="Image is too large")
    source = job_dir / f"source.{request.imageFormat}"
    source.write_bytes(base64.b64decode(request.imageBase64, validate=True))
    frames = request.durationSeconds * 30
    subprocess.run(
        [
            get_ffmpeg_exe(),
            "-y",
            "-i",
            str(source),
            "-vf",
            (
                "scale=1400:788:force_original_aspect_ratio=increase,"
                "crop=1280:720,"
                f"zoompan=z='min(1+0.0007*on,1.08)':d={frames}:s=1280x720:fps=30"
            ),
            "-frames:v",
            str(frames),
            "-an",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(target),
        ],
        check=True,
        capture_output=True,
        timeout=100,
    )


@app.get("/health")
def health():
    return {"status": "ok", "renderer": "manim-and-image-motion"}


@app.post("/render", dependencies=[Depends(authorize)])
def render(request: RenderRequest):
    job_id = uuid.uuid4().hex
    job_dir = JOBS / job_id
    job_dir.mkdir()
    filename = f"{request.lessonId}-{request.sceneId}-{job_id[:8]}.mp4"
    target = ASSETS / filename
    try:
        if request.imageBase64:
            render_image_motion(request, job_dir, target)
            renderer = "image-motion"
        else:
            render_manim(request, job_dir, target)
            renderer = "manim"
        return {"videoUrl": public_url(filename), "renderer": renderer}
    except HTTPException:
        raise
    except subprocess.TimeoutExpired as error:
        raise HTTPException(status_code=504, detail="Render timed out") from error
    except Exception as error:
        logger.exception("Render failed for scene %s", request.sceneId)
        raise HTTPException(status_code=500, detail="Render failed") from error
    finally:
        shutil.rmtree(job_dir, ignore_errors=True)
