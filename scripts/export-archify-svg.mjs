#!/usr/bin/env node

import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const expectedArchifyVersion = "2.11.0";

function runArchify(cliPath, args) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(
      `Archify ${args[0]} failed${details ? `:\n${details}` : "."}`,
    );
  }

  return result.stdout.trim();
}

function matchOne(source, pattern, description) {
  const match = source.match(pattern);
  if (!match) throw new Error(`Archify output is missing ${description}.`);
  return match[1];
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildStandaloneSvg(renderedHtml, sourceDocument) {
  const generatorVersion = matchOne(
    renderedHtml,
    /<meta\s+name="generator"\s+content="archify\s+([^"]+)"\s*\/?>/,
    "generator metadata",
  );
  if (generatorVersion !== expectedArchifyVersion) {
    throw new Error(
      `Expected Archify ${expectedArchifyVersion}, received ${generatorVersion}.`,
    );
  }

  const lightPalette = matchOne(
    renderedHtml,
    /\[data-theme="light"\]\s*\{([\s\S]*?)\n\s*\}/,
    "light theme palette",
  ).trim();
  const semanticStyles = matchOne(
    renderedHtml,
    /(\.c-grid\s*\{[\s\S]*?\.c-lane\s*\{[^}]*\})/,
    "SVG semantic styles",
  ).trim();
  const renderedSvg = matchOne(
    renderedHtml,
    /(<svg\b[^>]*>[\s\S]*?<\/svg>)/,
    "diagram SVG",
  );

  const openingTag = matchOne(renderedSvg, /^(<svg\b[^>]*>)/, "SVG opening tag");
  const standaloneOpeningTag = openingTag.replace(
    "<svg",
    `<svg xmlns="http://www.w3.org/2000/svg" data-theme="light" data-generator="archify ${expectedArchifyVersion}"`,
  );
  const title = escapeXml(sourceDocument.meta.title);
  const description = escapeXml(sourceDocument.meta.subtitle ?? sourceDocument.meta.title);
  const stylesheet = `
    <style>
      :root, svg {
        ${lightPalette.replaceAll("\n", "\n        ")}
        color-scheme: light;
        font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas,
          "DejaVu Sans Mono", "Liberation Mono", "Noto Sans Mono CJK SC",
          "Apple SD Gothic Neo", "Malgun Gothic", monospace;
      }

      ${semanticStyles.replaceAll("\n", "\n      ")}
    </style>
    <title>${title}</title>
    <desc>${description}</desc>
    <metadata>Generated from design/archify/feed-serving.architecture.json with Archify ${expectedArchifyVersion}.</metadata>`;

  return `${renderedSvg
    .replace(openingTag, `${standaloneOpeningTag}${stylesheet}`)
    .trim()
    .replace(/[ \t]+$/gmu, "")}\n`;
}

async function main() {
  const [inputArgument, outputArgument, cliArgument] = process.argv.slice(2);
  const inputPath = resolve(
    inputArgument ?? "design/archify/feed-serving.architecture.json",
  );
  const outputPath = resolve(
    outputArgument ?? "assets/diagrams/feed-serving.svg",
  );
  const configuredCli = cliArgument ?? process.env.ARCHIFY_CLI;
  if (!configuredCli) {
    throw new Error(
      `Set ARCHIFY_CLI to the Archify ${expectedArchifyVersion} bin/archify.mjs path.`,
    );
  }
  const cliPath = resolve(configuredCli);
  const temporaryDirectory = await mkdtemp(
    resolve(tmpdir(), "ch4570-archify-export-"),
  );
  const renderedPath = resolve(temporaryDirectory, "feed-serving.html");

  try {
    const validationOutput = runArchify(cliPath, [
      "validate",
      "architecture",
      inputPath,
      "--json",
    ]);
    const validation = JSON.parse(validationOutput);
    if (!validation.ok) {
      throw new Error(`Archify validation failed:\n${validationOutput}`);
    }

    runArchify(cliPath, [
      "render",
      "architecture",
      inputPath,
      renderedPath,
    ]);
    const checkOutput = runArchify(cliPath, ["check", renderedPath]);
    const artifactCheck = JSON.parse(checkOutput);
    if (!artifactCheck.ok) {
      throw new Error(`Archify artifact check failed:\n${checkOutput}`);
    }

    const [sourceJson, renderedHtml] = await Promise.all([
      readFile(inputPath, "utf8"),
      readFile(renderedPath, "utf8"),
    ]);
    const standaloneSvg = buildStandaloneSvg(
      renderedHtml,
      JSON.parse(sourceJson),
    );

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, standaloneSvg, "utf8");
    process.stdout.write(
      `Exported ${outputPath} with Archify ${expectedArchifyVersion}.\n`,
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

await main();
