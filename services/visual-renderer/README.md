# KathaQuest visual renderer

This worker keeps Python, Manim and FFmpeg outside the Vercel runtime. It accepts
only constrained template data, never model-generated Python code.

```bash
docker build -t kathaquest-visual-renderer services/visual-renderer
docker run --rm -p 8090:8090 \
  -e PUBLIC_BASE_URL=http://localhost:8090 \
  -e RENDERER_API_KEY=replace-with-a-long-random-value \
  kathaquest-visual-renderer
```

Configure the web app with:

```dotenv
MANIM_RENDERER_URL=http://localhost:8090
MANIM_RENDERER_API_KEY=replace-with-a-long-random-value
IMAGE_VIDEO_RENDERER_URL=http://localhost:8090
IMAGE_VIDEO_RENDERER_API_KEY=replace-with-a-long-random-value
```

For production, run this container behind HTTPS on ECS or EKS, use the same
private API token on both sides, and put `/assets` behind persistent object
storage or a shared CDN volume before using more than one replica.
