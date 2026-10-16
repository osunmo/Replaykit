import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseSandboxBuildOptions } from '../packages/cli/src/sandbox-build-options.js';

const NODE_IMAGE = 'node:22-bookworm-slim';
const POSTGRES_IMAGE = 'postgres:17-alpine';
const VARIANTS = ['buggy', 'reference', 'alternate', 'decoy'] as const;
type Variant = (typeof VARIANTS)[number];

function inside(root: string, target: string): boolean {
  const offset = relative(root, target);
  return offset !== '' && !offset.startsWith(`..${sep}`) && offset !== '..' && !isAbsolute(offset);
}

async function allowedSource(root: string, name: string): Promise<string> {
  const source = resolve(root, name);
  if (!inside(root, source)) throw new Error(`Build input is outside repository: ${name}`);
  let partPath = root;
  for (const part of relative(root, source).split(sep)) {
    partPath = join(partPath, part);
    if ((await lstat(partPath)).isSymbolicLink()) {
      throw new Error(`Symlinks are not allowed in sandbox build inputs: ${name}`);
    }
  }
  if (!inside(root, await realpath(source)))
    throw new Error(`Build input escapes repository: ${name}`);
  return source;
}

async function copyAllowed(root: string, name: string, target: string): Promise<void> {
  const source = await allowedSource(root, name);
  const stat = await lstat(source);
  if (stat.isDirectory()) {
    await mkdir(target, { recursive: true });
    for (const entry of (await readdir(source)).sort()) {
      await copyAllowed(root, join(name, entry), join(target, entry));
    }
  } else if (stat.isFile()) {
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
  } else {
    throw new Error(`Unsupported sandbox build input: ${name}`);
  }
}

async function outputDirectory(root: string): Promise<string> {
  let current = root;
  for (const segment of ['work', 'sandbox']) {
    current = join(current, segment);
    await mkdir(current, { recursive: true });
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink() || !inside(root, await realpath(current))) {
      throw new Error('Sandbox work directory must be a real directory inside the repository');
    }
  }
  return current;
}

async function hashTree(directory: string): Promise<string> {
  const hash = createHash('sha256');
  async function visit(current: string): Promise<void> {
    for (const entry of (await readdir(current)).sort()) {
      const path = join(current, entry);
      if ((await lstat(path)).isDirectory()) await visit(path);
      else {
        hash.update(relative(directory, path).split(sep).join('/')).update('\0');
        hash.update(await readFile(path)).update('\0');
      }
    }
  }
  await visit(directory);
  return hash.digest('hex');
}

async function docker(args: string[], streamOutput = false): Promise<string> {
  return new Promise((resolveResult, reject) => {
    const child = spawn('docker', args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let failure: Error | undefined;
    const deadline = setTimeout(
      () => {
        failure = new Error(`Docker ${args[0]} exceeded its 15 minute deadline`);
        child.kill();
      },
      15 * 60 * 1000,
    );
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      if (streamOutput) process.stdout.write(chunk);
      else if (output.length + chunk.length <= 1_048_576) output += chunk;
      else {
        failure = new Error('Docker inspection output exceeded its size limit');
        child.kill();
      }
    });
    child.stderr.on('data', (chunk: string) => process.stderr.write(chunk));
    child.on('error', (error) => {
      clearTimeout(deadline);
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(deadline);
      if (failure) reject(failure);
      else if (code !== 0)
        reject(new Error(`Docker ${args[0]} failed (exit ${code}, signal ${signal ?? 'none'})`));
      else resolveResult(output.trim());
    });
  });
}

async function imageId(image: string): Promise<string> {
  const id = await docker(['image', 'inspect', image, '--format', '{{.Id}}']);
  if (!/^sha256:[0-9a-f]{64}$/.test(id))
    throw new Error('Docker returned an invalid immutable image ID');
  return id;
}

async function buildImage(context: string, tag: string): Promise<string> {
  await docker(['build', '--pull=false', '--tag', tag, context], true);
  return imageId(tag);
}

/** Only copies named runtime inputs into newly created contexts; never builds the checkout root. */
export async function buildSandbox(
  root: string,
  options: ReturnType<typeof parseSandboxBuildOptions> = { postgresMode: 'initdb' },
): Promise<void> {
  root = await realpath(resolve(root));
  // Fail before Docker access if the compiled application or any required input is absent.
  const inputs = [
    'dist/apps/checkout-api/src/bootstrap.js',
    'dist/apps/checkout-api/src/database.js',
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'docker/replay-fixture.mjs',
    'docker/postgres-template.sh',
    'docker/postgres-entrypoint.sh',
    'dist/packages/contracts/src/index.js',
    'dist/packages/planner/src/index.js',
    ...VARIANTS.map((variant) => `dist/benchmark/private/R1/${variant}.js`),
  ];
  for (const input of inputs) await allowedSource(root, input);
  const directory = await outputDirectory(root);
  const contexts = await mkdtemp(join(directory, 'contexts-'));
  const appContext = join(contexts, 'app-base');
  await mkdir(appContext);
  for (const file of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) {
    await copyAllowed(root, file, join(appContext, file));
  }
  await copyAllowed(
    root,
    'dist/apps/checkout-api/src',
    join(appContext, 'dist/apps/checkout-api/src'),
  );
  const appSourceHash = await hashTree(appContext);
  const sourceHashes = {} as Record<Variant, string>;
  for (const variant of VARIANTS) {
    const context = join(contexts, variant);
    await mkdir(context);
    await copyAllowed(
      root,
      `dist/benchmark/private/R1/${variant}.js`,
      join(context, 'payment-policy.js'),
    );
    sourceHashes[variant] = createHash('sha256')
      .update(await readFile(join(context, 'payment-policy.js')))
      .digest('hex');
  }
  const candidateContext = join(contexts, 'candidate');
  await mkdir(candidateContext);
  await copyAllowed(
    root,
    'docker/replay-fixture.mjs',
    join(candidateContext, 'replay-fixture.mjs'),
  );
  const sdkHash = createHash('sha256')
    .update(await readFile(join(candidateContext, 'replay-fixture.mjs')))
    .digest('hex');
  const plannerContext = join(contexts, 'planner');
  await mkdir(plannerContext);
  for (const file of [
    'dist/packages/contracts/src/index.js',
    'dist/packages/planner/src/index.js',
  ]) {
    await copyAllowed(root, file, join(plannerContext, file));
  }
  await writeFile(
    join(plannerContext, 'planner-entry.mjs'),
    [
      "import { planIncident } from './dist/packages/planner/src/index.js';",
      'try {',
      '  const chunks = [];',
      '  let bytes = 0;',
      '  for await (const chunk of process.stdin) {',
      '    bytes += chunk.length;',
      "    if (bytes > 1048576) throw new Error('Planner input exceeds 1 MiB');",
      '    chunks.push(chunk);',
      '  }',
      "  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));",
      "  process.stdout.write(JSON.stringify(planIncident(input)) + '\\n');",
      '} catch {',
      "  process.stderr.write('Planner input rejected\\n');",
      '  process.exitCode = 1;',
      '}',
      '',
    ].join('\n'),
  );
  const plannerHash = await hashTree(plannerContext);

  const postgresContext = join(contexts, 'postgres');
  await mkdir(postgresContext);
  // Use the exact compiled schema copied into the app image, even if source edits
  // have not been rebuilt. Do not mix a newer host source with older app bytecode.
  const { schemaStatements }: { schemaStatements?: unknown } = await import(
    pathToFileURL(join(appContext, 'dist/apps/checkout-api/src/database.js')).href
  );
  if (
    !Array.isArray(schemaStatements) ||
    !schemaStatements.length ||
    !schemaStatements.every((statement: unknown) => typeof statement === 'string')
  )
    throw new Error('Compiled application schema is unavailable; run pnpm build');
  const schemaSql = `BEGIN;\n${schemaStatements.join(';\n')};\nCOMMIT;\n`;
  const schemaHash = createHash('sha256').update(schemaSql).digest('hex');
  await writeFile(join(postgresContext, 'schema.sql'), schemaSql);
  for (const script of ['postgres-template.sh', 'postgres-entrypoint.sh']) {
    const source = await allowedSource(root, `docker/${script}`);
    await writeFile(
      join(postgresContext, script),
      (await readFile(source, 'utf8')).replace(/\r\n/g, '\n'),
    );
  }
  const templateSourceHash = await hashTree(postgresContext);

  console.log('Pulling sandbox base images (build phase requires network access).');
  await docker(['pull', NODE_IMAGE], true);
  await docker(['pull', POSTGRES_IMAGE], true);
  const nodeImage = await imageId(NODE_IMAGE);
  const postgresBaseImage = await imageId(POSTGRES_IMAGE);
  const postgresDigests: unknown = JSON.parse(
    await docker(['image', 'inspect', POSTGRES_IMAGE, '--format', '{{json .RepoDigests}}']),
  );
  const postgresDigest = Array.isArray(postgresDigests)
    ? postgresDigests.find(
        (value: unknown) =>
          typeof value === 'string' &&
          /^(?:docker\.io\/library\/)?postgres@sha256:[0-9a-f]{64}$/.test(value),
      )
    : undefined;
  if (!postgresDigest)
    throw new Error('Pulled PostgreSQL image has no immutable repository digest');
  await writeFile(
    join(postgresContext, 'Dockerfile'),
    [
      `FROM ${postgresDigest}`,
      'COPY --chown=70:70 schema.sql /opt/replaykit/schema.sql',
      'COPY --chmod=755 postgres-template.sh /usr/local/bin/replaykit-postgres-template.sh',
      'COPY --chmod=755 postgres-entrypoint.sh /usr/local/bin/replaykit-postgres-entrypoint.sh',
      'RUN mkdir -p /opt/replaykit-template && chown 70:70 /opt/replaykit-template',
      'USER 70:70',
      'RUN /usr/local/bin/replaykit-postgres-template.sh',
      'ENV PGDATA=/var/lib/postgresql/data REPLAYKIT_PG_FSYNC=on',
      `LABEL org.replaykit.role="postgres-template" org.replaykit.template-sha256="${templateSourceHash}" org.replaykit.schema-sha256="${schemaHash}"`,
      'ENTRYPOINT ["/usr/local/bin/replaykit-postgres-entrypoint.sh"]',
      'CMD []',
      '',
    ].join('\n'),
  );
  if (options.postgresMode === 'template-copy')
    console.log('Building an empty, credential-free PostgreSQL template.');
  const postgresImage =
    options.postgresMode === 'template-copy'
      ? await buildImage(
          postgresContext,
          `replaykit-postgres:${templateSourceHash.slice(0, 20)}-${postgresBaseImage.slice(-12)}`,
        )
      : postgresBaseImage;
  const digests: unknown = JSON.parse(
    await docker(['image', 'inspect', NODE_IMAGE, '--format', '{{json .RepoDigests}}']),
  );
  const nodeDigest = Array.isArray(digests)
    ? (digests.find(
        (value: unknown) =>
          typeof value === 'string' &&
          /^(?:docker\.io\/library\/)?node@sha256:[0-9a-f]{64}$/.test(value),
      ) as string | undefined)
    : undefined;
  if (!nodeDigest) throw new Error('Pulled Node image has no usable immutable repository digest');

  const baseTag = `replaykit-app-base:${appSourceHash.slice(0, 20)}-${nodeImage.slice(-12)}`;
  await writeFile(
    join(appContext, 'Dockerfile'),
    [
      `FROM ${nodeDigest}`,
      'WORKDIR /app',
      'COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./',
      'RUN npm install --global pnpm@10.20.0 && pnpm install --prod --frozen-lockfile --ignore-scripts',
      'COPY dist/apps/checkout-api/src/ /app/dist/apps/checkout-api/src/',
      'LABEL org.opencontainers.image.title="ReplayKit application base" org.replaykit.role="app-base"',
      `LABEL org.replaykit.sources-sha256="${appSourceHash}"`,
      'USER 1000:1000',
      'ENTRYPOINT ["node", "/app/dist/apps/checkout-api/src/bootstrap.js"]',
      '',
    ].join('\n'),
  );
  console.log('Building application base from its allowlisted context.');
  await buildImage(appContext, baseTag);
  const appImages = {} as Record<Variant, string>;
  for (const variant of VARIANTS) {
    const context = join(contexts, variant);
    await writeFile(
      join(context, 'Dockerfile'),
      [
        `FROM ${baseTag}`,
        'COPY payment-policy.js /app/dist/apps/checkout-api/src/payment-policy.js',
        `LABEL org.replaykit.role="app" org.replaykit.variant="${variant}" org.replaykit.source-sha256="${sourceHashes[variant]}"`,
        '',
      ].join('\n'),
    );
    console.log(`Building isolated ${variant} application snapshot.`);
    appImages[variant] = await buildImage(
      context,
      `replaykit-r1-${variant}:${sourceHashes[variant].slice(0, 20)}-${appSourceHash.slice(0, 12)}`,
    );
  }
  await writeFile(
    join(candidateContext, 'Dockerfile'),
    [
      `FROM ${nodeDigest}`,
      'COPY replay-fixture.mjs /sdk/replay-fixture.mjs',
      `LABEL org.replaykit.role="candidate" org.replaykit.sdk-sha256="${sdkHash}"`,
      'USER 1000:1000',
      'WORKDIR /tmp',
      '',
    ].join('\n'),
  );
  console.log('Building candidate image containing only the replay SDK.');
  const candidateImage = await buildImage(
    candidateContext,
    `replaykit-candidate:${sdkHash.slice(0, 20)}-${nodeImage.slice(-12)}`,
  );
  await writeFile(
    join(plannerContext, 'Dockerfile'),
    [
      `FROM ${baseTag}`,
      'COPY dist/packages/contracts/src/index.js /app/dist/packages/contracts/src/index.js',
      'COPY dist/packages/planner/src/index.js /app/dist/packages/planner/src/index.js',
      'COPY planner-entry.mjs /app/planner-entry.mjs',
      `LABEL org.replaykit.role="planner" org.replaykit.sources-sha256="${plannerHash}"`,
      'ENTRYPOINT ["node", "/app/planner-entry.mjs"]',
      '',
    ].join('\n'),
  );
  console.log('Building planner image with visible application code and planner contracts only.');
  const plannerImage = await buildImage(
    plannerContext,
    `replaykit-planner:${plannerHash.slice(0, 20)}-${appSourceHash.slice(0, 12)}`,
  );
  const manifest = {
    schemaVersion: 1,
    nodeImage,
    postgresImage,
    candidateImage,
    plannerImage,
    appImages,
    sourceHashes,
    postgresRuntime: {
      mode: options.postgresMode,
      baseImage: postgresBaseImage,
      ...(options.postgresMode === 'template-copy' ? { templateSourceHash } : {}),
      schemaHash,
      fsync: 'on',
    },
    builtAt: new Date().toISOString(),
  };
  const temporaryManifest = join(contexts, 'manifest.json');
  await writeFile(temporaryManifest, `${JSON.stringify(manifest, null, 2)}\n`);
  await rename(temporaryManifest, join(directory, 'manifest.json'));
  console.log(
    'Saved immutable sandbox image IDs and variant source hashes to work/sandbox/manifest.json.',
  );
}

const entrypoint = process.argv[1];
if (entrypoint && resolve(entrypoint) === fileURLToPath(import.meta.url)) {
  buildSandbox(process.cwd(), parseSandboxBuildOptions(process.argv.slice(2))).catch(
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : 'Sandbox image build failed');
      process.exitCode = 1;
    },
  );
}
