import {
  BedrockRuntimeClient,
  ConverseCommand,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';

/**
 * Verifies Bedrock model access before any agent code depends on it.
 *
 * IAM permission and model access are two separate gates: bedrock:InvokeModel in
 * a policy is necessary but not sufficient, because access is granted per-account
 * in the Bedrock console and is off by default. This script tells the two apart —
 * AccessDeniedException means the console grant is missing, not the policy.
 *
 * Usage: node scripts/bedrock-check.mjs
 */

const region = process.env.AWS_REGION ?? 'us-east-1';
const client = new BedrockRuntimeClient({ region });

const TEXT_MODELS = ['amazon.nova-pro-v1:0', 'us.amazon.nova-pro-v1:0'];
const IMAGE_MODEL = 'amazon.nova-canvas-v1:0';

function explain(err) {
  const name = err?.name ?? 'Error';
  if (name === 'AccessDeniedException') {
    return 'DENIED — request access in the Bedrock console (this is not an IAM problem)';
  }
  if (name === 'ValidationException') {
    return `INVALID — ${err.message}`;
  }
  if (name === 'ResourceNotFoundException') {
    return 'NOT FOUND — wrong model id for this region';
  }
  if (name === 'ThrottlingException') {
    return 'THROTTLED — access works, retry';
  }
  return `${name} — ${err?.message ?? err}`;
}

async function checkText(modelId) {
  try {
    const res = await client.send(
      new ConverseCommand({
        modelId,
        messages: [{ role: 'user', content: [{ text: 'Reply with exactly: OK' }] }],
        inferenceConfig: { maxTokens: 20, temperature: 0.2 },
      }),
    );
    const text = res.output?.message?.content?.[0]?.text?.trim() ?? '(empty)';
    console.log(`  GRANTED  ${modelId} -> "${text}"`);
    return true;
  } catch (err) {
    console.log(`  ${explain(err)}\n           ${modelId}`);
    return false;
  }
}

async function checkImage(modelId) {
  try {
    const res = await client.send(
      new InvokeModelCommand({
        modelId,
        contentType: 'application/json',
        body: JSON.stringify({
          taskType: 'TEXT_IMAGE',
          textToImageParams: { text: 'a single grey pebble on wet stone, minimal' },
          imageGenerationConfig: { numberOfImages: 1, width: 512, height: 512, cfgScale: 7 },
        }),
      }),
    );
    const parsed = JSON.parse(new TextDecoder().decode(res.body));
    const bytes = parsed?.images?.[0]?.length ?? 0;
    console.log(`  GRANTED  ${modelId} -> ${bytes} base64 chars returned`);
    return true;
  } catch (err) {
    console.log(`  ${explain(err)}\n           ${modelId}`);
    return false;
  }
}

console.log(`region:  ${region}`);
console.log(`profile: ${process.env.AWS_PROFILE ?? 'default'}\n`);

console.log('text (Converse API)');
let textOk = false;
for (const m of TEXT_MODELS) {
  // eslint-disable-next-line no-await-in-loop
  if (await checkText(m)) {
    textOk = true;
    break;
  }
}

console.log('\nimage (InvokeModel)');
const imageOk = await checkImage(IMAGE_MODEL);

console.log('\n--------------------------------');
console.log(`text:  ${textOk ? 'ready' : 'BLOCKED'}`);
console.log(`image: ${imageOk ? 'ready' : 'BLOCKED'}`);

if (!textOk) {
  console.log('\nText is the hard requirement — the agent cannot publish without it.');
  console.log('Bedrock console -> us-east-1 -> Model access -> enable Amazon Nova Pro.');
}
if (textOk && !imageOk) {
  console.log('\nText works, so the agent can publish text-only capsules today.');
  console.log('Enable Amazon Nova Canvas for illustrations. There is no alternative image model.');
}

process.exitCode = textOk ? 0 : 1;
