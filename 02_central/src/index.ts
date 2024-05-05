import { HttpRequest } from "@aws-sdk/protocol-http";
import { SignatureV4 } from "@aws-sdk/signature-v4";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { Sha256 } from "@aws-crypto/sha256-js";
import { URL } from "url";
import {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
} from "aws-lambda";
import * as crypto from "crypto";
import { getLogger } from "./logger";
import { GQLInput, GithubWebhookEvent } from "./types";

const log = getLogger();

export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent
) => {
  log.info("handle event", JSON.stringify(event));

  const result: APIGatewayProxyResult = {
    statusCode: 200,
    body: JSON.stringify({ message: "ok" }),
  };

  const integrationId = event.path.replace("/api/import/", "");
  const githubSecret = await loadParameter(integrationId);
  if (!githubSecret) {
    return {
      statusCode: 400,
      body: "Bad request: integration id not found.",
    };
  }

  const signature = event.headers["X-Hub-Signature-256"];
  const payload = event.body;

  if (!signature || !payload) {
    return {
      statusCode: 400,
      body: "Bad request: Missing signature or payload.",
    };
  }

  const isValid = validateSignature(payload, githubSecret, signature);

  if (!isValid) {
    result.statusCode = 401;
    result.body = "Unauthorized: Invalid signature.";
    return result;
  }

  try {
    const githubEvent: GithubWebhookEvent = JSON.parse(event.body);
    await putJob(githubEvent, integrationId);
  } catch (error) {
    log.error({
      err: error,
      event,
    });
    result.statusCode = 500;
    result.body = JSON.stringify({ message: "error" });
  }

  return result;
};

const validateSignature = (
  payload: string,
  secret: string,
  signature: string
): boolean => {
  const hmac = crypto.createHmac("sha256", secret);
  const digest = "sha256=" + hmac.update(payload).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
};

const putJob = async (job: GithubWebhookEvent, integrationId: string) => {
  log.info("put job", JSON.stringify(job));
  const input = getInput(job, integrationId);
  const inputAsString = JSON.stringify(input).replace(/"([^"]+)":/g, "$1:");
  const allKeys = getAllKeysStructuredFormatted(input);
  const body = JSON.stringify({
    operationName: "PutJob",
    query: `
            mutation PutJob {
                putJob(
                    input: ${inputAsString}
                ) ${allKeys}
            }
        `,
    variables: {},
  });
  log.debug("put job body", JSON.stringify(body));

  const uri = new URL(process.env.GRAPHQL_URI);
  const httpRequest = new HttpRequest({
    headers: {
      "Content-Type": "application/json",
      host: uri.host,
    },
    hostname: uri.hostname,
    method: "POST",
    body,
    path: uri.pathname,
  });

  const signer = new SignatureV4({
    credentials: defaultProvider(),
    region: process.env.AWS_REGION,
    service: "appsync",
    sha256: Sha256,
  });

  const signedRequest = await signer.sign(httpRequest);
  const response = await fetch(uri.href, {
    method: signedRequest.method,
    body: signedRequest.body,
    headers: signedRequest.headers,
  });

  const json = await response.json();
  if (json.errors) {
    throw new Error(JSON.stringify(json.errors));
  }
};

const getInput = (
  event: GithubWebhookEvent,
  integrationId: string
): GQLInput => {
  const input: GQLInput = {
    ...event,
    run_id: event.workflow_job.run_id,
    workflow_name: event.workflow_job.workflow_name,
    expire_at: new Date(
      Math.floor(
        new Date().getTime() + parseInt(process.env.EXPIRE_IN_SEC) * 1000
      )
    ).toISOString(),
    integrationId,
  };

  delete input.workflow_job.steps;
  delete input.workflow_job.labels;
  delete input.repository.topics;
  delete input.repository.custom_properties;

  return input;
};

// TODO: this breaks on all the edge cases -> needs refactoring
const getAllKeysStructuredFormatted = (input: GQLInput) => {
  function extractKeys(item) {
    let currentKeys = [];
    for (let key in item) {
      currentKeys.push(key); // Push key into the current array
      if (item[key] !== null && typeof item[key] === "object") {
        let nestedKeys = extractKeys(item[key]); // Recursive call for nested objects or arrays
        if (nestedKeys.length > 0) {
          currentKeys.push(nestedKeys); // Include nested keys if not empty
        }
      }
    }
    return `{${currentKeys.join(",")}}`; // Format the current array as a string with curly braces
  }

  return extractKeys(input); // Start the recursion with the initial object
};

const loadParameter = async (intergrationId: string): Promise<string> => {
  const parameterName = `${process.env.SSM_PARAMETER_GH_WEBHOOK_SECRET_NAME_PREFIX}${intergrationId}`;
  const url = `http://localhost:2773/systemsmanager/parameters/get?name=${encodeURIComponent(
    parameterName
  )}&withDecryption=true`;
  log.info("load parameter", url);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-Aws-Parameters-Secrets-Token": process.env.AWS_SESSION_TOKEN,
    },
  });

  if (!response.ok) {
    log.error("failed to load parameter", response.statusText);
    return null;
  }

  const { Parameter } = await response.json();
  const { Value } = Parameter;
  return Value;
};
