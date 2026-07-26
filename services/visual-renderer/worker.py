import json
import logging
import os
import shutil
import sys
import uuid
from pathlib import Path

import boto3

from app import ASSETS, JOBS, RenderRequest, public_url, render_image_motion, render_manim


logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("kathaquest.visual-renderer.worker")


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def update_job(table, job_id: str, status: str, **values):
    names = {"#status": "status"}
    attributes = {":status": status}
    assignments = ["#status = :status"]
    for index, (key, value) in enumerate(values.items()):
        name_key = f"#field{index}"
        value_key = f":value{index}"
        names[name_key] = key
        attributes[value_key] = value
        assignments.append(f"{name_key} = {value_key}")
    table.update_item(
        Key={"jobId": job_id},
        UpdateExpression="SET " + ", ".join(assignments),
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=attributes,
    )


def run():
    region = os.getenv("AWS_REGION", "ap-south-1")
    job_id = require_env("JOB_ID")
    job_bucket = require_env("JOB_BUCKET")
    output_bucket = require_env("OUTPUT_BUCKET")
    table_name = require_env("JOB_TABLE")
    s3 = boto3.client("s3", region_name=region)
    table = boto3.resource("dynamodb", region_name=region).Table(table_name)
    job_dir = JOBS / job_id
    job_dir.mkdir(parents=True, exist_ok=False)
    target = None
    try:
        update_job(table, job_id, "running")
        response = s3.get_object(Bucket=job_bucket, Key=f"jobs/{job_id}.json")
        payload = json.loads(response["Body"].read())
        request = RenderRequest.model_validate(payload)
        filename = f"{request.lessonId}-{request.sceneId}-{uuid.uuid4().hex[:8]}.mp4"
        target = ASSETS / filename
        if request.imageBase64:
            render_image_motion(request, job_dir, target)
            renderer = "image-motion"
        else:
            render_manim(request, job_dir, target)
            renderer = "manim"
        s3.upload_file(
            str(target),
            output_bucket,
            f"assets/{filename}",
            ExtraArgs={
                "ContentType": "video/mp4",
                "CacheControl": "public, max-age=604800, immutable",
            },
        )
        update_job(
            table,
            job_id,
            "ready",
            videoUrl=public_url(filename),
            renderer=renderer,
        )
        logger.info("Rendered job %s with %s", job_id, renderer)
    except Exception as error:
        logger.exception("Render job %s failed", job_id)
        try:
            update_job(table, job_id, "failed", error=str(error)[:500])
        except Exception:
            logger.exception("Could not persist failure state for job %s", job_id)
        raise
    finally:
        shutil.rmtree(job_dir, ignore_errors=True)
        if target:
            Path(target).unlink(missing_ok=True)


if __name__ == "__main__":
    try:
        run()
    except Exception:
        sys.exit(1)
