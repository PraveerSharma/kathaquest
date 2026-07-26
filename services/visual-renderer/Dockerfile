FROM manimcommunity/manim:v0.20.1

USER root
RUN pip install --no-cache-dir \
  boto3==1.40.30 \
  fastapi==0.140.0 \
  imageio-ffmpeg==0.6.0 \
  pydantic==2.13.4 \
  uvicorn==0.51.0

WORKDIR /service
COPY --chown=manimuser:manimuser app.py render_templates.py worker.py /service/
RUN mkdir -p /service/assets /service/jobs \
  && chown -R manimuser:manimuser /service

USER manimuser
ENV PORT=8090
EXPOSE 8090

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8090"]
