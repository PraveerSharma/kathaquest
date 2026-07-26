import base64
import hmac
import json
import os
import time
import uuid

import boto3


dynamodb = boto3.resource("dynamodb")
ecs = boto3.client("ecs")
s3 = boto3.client("s3")
table = dynamodb.Table(os.environ["JOB_TABLE"])


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "content-type": "application/json",
            "cache-control": "no-store",
        },
        "body": json.dumps(body),
    }


def authorized(event):
    headers = {
        key.lower(): value for key, value in (event.get("headers") or {}).items()
    }
    supplied = headers.get("authorization", "").removeprefix("Bearer ").strip()
    expected = os.environ["RENDERER_API_KEY"]
    return bool(supplied) and hmac.compare_digest(supplied, expected)


def decode_body(event):
    raw = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8")
    return json.loads(raw)


def submit(event):
    payload = decode_body(event)
    encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    if len(encoded) > 9_000_000:
        return response(413, {"error": "Render request is too large"})
    job_id = uuid.uuid4().hex
    now = int(time.time())
    s3.put_object(
        Bucket=os.environ["JOB_BUCKET"],
        Key=f"jobs/{job_id}.json",
        Body=encoded,
        ContentType="application/json",
        ServerSideEncryption="AES256",
    )
    table.put_item(
        Item={
            "jobId": job_id,
            "status": "queued",
            "createdAt": now,
            "expiresAt": now + 86_400,
        }
    )
    result = ecs.run_task(
        cluster=os.environ["ECS_CLUSTER"],
        taskDefinition=os.environ["TASK_DEFINITION"],
        launchType="FARGATE",
        count=1,
        platformVersion="LATEST",
        networkConfiguration={
            "awsvpcConfiguration": {
                "subnets": os.environ["PUBLIC_SUBNETS"].split(","),
                "securityGroups": [os.environ["TASK_SECURITY_GROUP"]],
                "assignPublicIp": "ENABLED",
            }
        },
        overrides={
            "containerOverrides": [
                {
                    "name": os.environ["CONTAINER_NAME"],
                    "environment": [{"name": "JOB_ID", "value": job_id}],
                }
            ]
        },
        enableECSManagedTags=True,
    )
    failures = result.get("failures") or []
    if failures:
        error = failures[0].get("reason", "ECS rejected the render task")
        table.update_item(
            Key={"jobId": job_id},
            UpdateExpression="SET #status = :status, #error = :error",
            ExpressionAttributeNames={"#status": "status", "#error": "error"},
            ExpressionAttributeValues={":status": "failed", ":error": error},
        )
        return response(503, {"error": error})
    return response(
        202,
        {
            "jobId": job_id,
            "status": "queued",
            "statusUrl": f"/jobs/{job_id}",
        },
    )


def get_job(job_id):
    item = table.get_item(Key={"jobId": job_id}).get("Item")
    if not item:
        return response(404, {"error": "Render job not found"})
    result = {"jobId": job_id, "status": item["status"]}
    for key in ("videoUrl", "renderer", "error"):
        if key in item:
            result[key] = item[key]
    return response(200, result)


def handler(event, context):
    if not authorized(event):
        return response(401, {"error": "Invalid renderer token"})
    route = event.get("routeKey", "")
    if route == "POST /render":
        try:
            return submit(event)
        except (ValueError, TypeError, json.JSONDecodeError) as error:
            return response(400, {"error": str(error)})
    if route == "GET /jobs/{jobId}":
        return get_job((event.get("pathParameters") or {}).get("jobId", ""))
    return response(404, {"error": "Route not found"})
