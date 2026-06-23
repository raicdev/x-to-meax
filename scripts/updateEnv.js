const ENV_LINE_PATTERN = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;

export function readEnvEntries(text) {
  const seen = new Set();
  const entries = [];

  for (const line of String(text || "").split(/\r?\n/)) {
    const match = line.match(ENV_LINE_PATTERN);
    if (!match) continue;

    const key = match[1];
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ key, line });
  }

  return entries;
}

export function mergeMissingEnvFields(existingText, exampleText) {
  const existingKeys = new Set(readEnvEntries(existingText).map((entry) => entry.key));
  const missing = readEnvEntries(exampleText).filter(
    (entry) => !existingKeys.has(entry.key),
  );

  if (missing.length === 0) {
    return {
      text: existingText,
      added: [],
    };
  }

  const lineEnding = String(existingText).includes("\r\n") ? "\r\n" : "\n";
  const prefix = existingText.endsWith("\n") || existingText.length === 0
    ? ""
    : lineEnding;
  const block = [
    "# Added by bun update-env from .env.example",
    ...missing.map((entry) => entry.line),
  ].join(lineEnding);

  return {
    text: `${existingText}${prefix}${lineEnding}${block}${lineEnding}`,
    added: missing.map((entry) => entry.key),
  };
}

async function main() {
  const { envPath, examplePath } = parseArgs(Bun.argv.slice(2));
  const exampleFile = Bun.file(examplePath);

  if (!(await exampleFile.exists())) {
    throw new Error(`${examplePath} does not exist.`);
  }

  const envFile = Bun.file(envPath);
  const exampleText = await exampleFile.text();

  if (!(await envFile.exists())) {
    await Bun.write(envPath, exampleText);
    console.log(`Created ${envPath} from ${examplePath}.`);
    return;
  }

  const existingText = await envFile.text();
  const result = mergeMissingEnvFields(existingText, exampleText);
  if (result.added.length === 0) {
    console.log(`${envPath} already contains every field from ${examplePath}.`);
    return;
  }

  await Bun.write(envPath, result.text);
  console.log(`Added ${result.added.length} missing env field(s): ${result.added.join(", ")}`);
}

function parseArgs(args) {
  const result = {
    envPath: ".env",
    examplePath: ".env.example",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--env") {
      result.envPath = args[++index];
    } else if (arg === "--example") {
      result.examplePath = args[++index];
    }
  }

  if (!result.envPath) throw new Error("--env requires a path.");
  if (!result.examplePath) throw new Error("--example requires a path.");
  return result;
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
