import json
import os

import boto3


ec2 = boto3.client("ec2")
ecs = boto3.client("ecs")
freetier = boto3.client("freetier", region_name="us-east-1")


def handler(event, context):
    plan = freetier.get_account_plan_state()
    credits = float(plan["accountPlanRemainingCredits"]["amount"])
    safe = (
        plan["accountPlanType"] == "FREE"
        and plan["accountPlanStatus"] == "ACTIVE"
        and credits > float(os.environ.get("MINIMUM_CREDITS_USD", "5"))
    )
    result = {
        "planType": plan["accountPlanType"],
        "planStatus": plan["accountPlanStatus"],
        "remainingCredits": credits,
        "computeStopped": False,
    }
    if safe:
        return result

    instance_id = os.environ["SIGNOZ_INSTANCE_ID"]
    state = ec2.describe_instances(InstanceIds=[instance_id])
    instances = [
        instance
        for reservation in state.get("Reservations", [])
        for instance in reservation.get("Instances", [])
    ]
    if instances and instances[0]["State"]["Name"] == "running":
        ec2.stop_instances(InstanceIds=[instance_id])

    cluster = os.environ["ECS_CLUSTER"]
    task_arns = ecs.list_tasks(cluster=cluster).get("taskArns", [])
    for task_arn in task_arns:
        ecs.stop_task(
            cluster=cluster,
            task=task_arn,
            reason="KathaQuest credit safety threshold reached",
        )

    result["computeStopped"] = True
    print(json.dumps(result))
    return result
