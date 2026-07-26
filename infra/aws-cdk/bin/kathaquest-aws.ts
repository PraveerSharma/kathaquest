#!/usr/bin/env node

import { App, Environment, Tags, Validations } from "aws-cdk-lib";
import { AwsSolutionsChecks } from "cdk-nag";

import { KathaQuestAwsStack } from "../lib/kathaquest-stack";

const app = new App();
const environment: Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? "ap-south-1",
};

const stack = new KathaQuestAwsStack(app, "KathaQuestProduction", {
  env: environment,
  description:
    "Cost-safe KathaQuest production observability and on-demand visual rendering",
  terminationProtection: true,
});

Tags.of(stack).add("Project", "KathaQuest");
Tags.of(stack).add("Environment", "production");
Tags.of(stack).add("ManagedBy", "AWS-CDK");
Validations.of(app).addPlugins(
  new AwsSolutionsChecks(app, {
    verbose: true,
    writeSuppressionsToCloudFormation: true,
  }),
);
