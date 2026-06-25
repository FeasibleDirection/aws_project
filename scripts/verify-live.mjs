// Live end-to-end smoke test against the deployed always-on stacks.
// Reads stack outputs from CloudFormation, gets a Cognito JWT, then exercises
// auth + CRUD + S3 presign + (Streams→EventBridge→Step Functions auto-ship).
//
// Usage: AWS_REGION=us-east-1 node scripts/verify-live.mjs
import {
  CloudFormationClient,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation";
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";

const REGION = process.env.AWS_REGION ?? "us-east-1";
const cfn = new CloudFormationClient({ region: REGION });
const cog = new CognitoIdentityProviderClient({ region: REGION });

const out = (stack) =>
  cfn
    .send(new DescribeStacksCommand({ StackName: stack }))
    .then((r) =>
      Object.fromEntries(
        (r.Stacks?.[0]?.Outputs ?? []).map((o) => [o.OutputKey, o.OutputValue]),
      ),
    );

const log = (...a) => console.log(...a);
let pass = 0;
let fail = 0;
const check = (name, ok, extra = "") => {
  log(`${ok ? "✅" : "❌"} ${name}${extra ? "  " + extra : ""}`);
  ok ? pass++ : fail++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const core = await out("CoreApiStack");
  const auth = await out("AuthStack");
  const api = core.ApiUrl.replace(/\/+$/, "");
  const poolId = auth.UserPoolId;
  const clientId = auth.UserPoolClientId;
  log(`API: ${api}`);
  log(`UserPool: ${poolId}  Client: ${clientId}\n`);

  // --- get a token ---
  const username = "verify@example.com";
  const password = "Verify!2345";
  try {
    await cog.send(
      new AdminCreateUserCommand({
        UserPoolId: poolId,
        Username: username,
        MessageAction: "SUPPRESS",
      }),
    );
  } catch (e) {
    if (e.name !== "UsernameExistsException") throw e;
  }
  await cog.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: poolId,
      Username: username,
      Password: password,
      Permanent: true,
    }),
  );
  const a = await cog.send(
    new InitiateAuthCommand({
      ClientId: clientId,
      AuthFlow: "USER_PASSWORD_AUTH",
      AuthParameters: { USERNAME: username, PASSWORD: password },
    }),
  );
  const token = a.AuthenticationResult?.IdToken;
  check("Cognito: obtained ID token", !!token);
  const authH = { authorization: `Bearer ${token}`, "content-type": "application/json" };

  // --- auth gate ---
  const noAuth = await fetch(`${api}/orders`);
  check("401 without token (JWT authorizer)", noAuth.status === 401, `got ${noAuth.status}`);

  // --- create ---
  const created = await fetch(`${api}/orders`, {
    method: "POST",
    headers: authH,
    body: JSON.stringify({ items: [{ sku: "VERIFY-1", qty: 3, price: 7 }] }),
  });
  const createdBody = await created.json();
  const id = createdBody?.data?.id;
  check("201 create order (total computed)", created.status === 201 && createdBody?.data?.total === 21, `id=${id}`);

  // --- get / list (per-user) ---
  const got = await fetch(`${api}/orders/${id}`, { headers: authH });
  check("200 get own order", got.status === 200);
  const list = await fetch(`${api}/orders`, { headers: authH });
  const listBody = await list.json();
  check("200 list own orders (GSI query)", list.status === 200 && Array.isArray(listBody?.data?.items));

  // --- S3 presigned upload + download ---
  const presign = await fetch(`${api}/orders/${id}/attachment`, {
    method: "POST",
    headers: authH,
    body: JSON.stringify({ contentType: "text/plain" }),
  });
  const presignBody = await presign.json();
  let s3ok = false;
  if (presign.status === 200 && presignBody?.data?.uploadUrl) {
    const put = await fetch(presignBody.data.uploadUrl, {
      method: "PUT",
      headers: { "content-type": "text/plain" },
      body: "hello-from-verify",
    });
    const dl = await fetch(`${api}/orders/${id}/attachment`, { headers: authH });
    const dlBody = await dl.json();
    if (put.ok && dlBody?.data?.downloadUrl) {
      const fetched = await fetch(dlBody.data.downloadUrl);
      s3ok = (await fetched.text()) === "hello-from-verify";
    }
  }
  check("S3 presigned PUT + GET round-trip", s3ok);

  // --- async chain: order should auto-ship via Streams→EventBridge→StepFns ---
  let shipped = false;
  for (let i = 0; i < 15 && !shipped; i++) {
    await sleep(3000);
    const r = await fetch(`${api}/orders/${id}`, { headers: authH });
    const b = await r.json();
    if (b?.data?.status === "SHIPPED") shipped = true;
  }
  check("order auto-SHIPPED (Streams→EventBridge→Step Functions saga)", shipped);

  // --- delete + 404 ---
  const del = await fetch(`${api}/orders/${id}`, { method: "DELETE", headers: authH });
  check("204 delete", del.status === 204);
  const gone = await fetch(`${api}/orders/${id}`, { headers: authH });
  check("404 after delete (conditional)", gone.status === 404);

  log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("VERIFY ERROR:", e);
  process.exit(1);
});
