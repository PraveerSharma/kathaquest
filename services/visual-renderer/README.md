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

The production AWS stack does not keep this container running. Its HTTPS job
API writes a request to S3, starts one Fargate task with `worker.py`, persists
status in DynamoDB, uploads the MP4 to a private S3 bucket fronted by
CloudFront, and then exits. The web application polls the returned `statusUrl`.
This keeps Manim and FFmpeg outside Vercel without paying for an idle renderer,
NAT Gateway, or load balancer.
