#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import {
  EditableDocumentError,
  assertEditableOnlyChanges,
} from "../admin/editor-core.js";

const DEFAULT_FILES = [
  "index.html",
  "resume/index.html",
  "career/index.html",
  "portfolio/index.html",
];

function printUsage() {
  process.stdout.write(`Usage: node scripts/validate-editables.mjs [options] [file ...]

Validate that working HTML differs from a Git baseline only inside elements with
data-edit-id, and that every editable value contains safe inline HTML.

Options:
  --base <sha-or-ref>  Git baseline to compare against (default: HEAD)
  --help               Show this help

With no file arguments, validates:
  ${DEFAULT_FILES.join("\n  ")}
`);
}

function parseArguments(argumentsList) {
  let baseline = "HEAD";
  const files = [];

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--help" || argument === "-h") {
      return { help: true, baseline, files };
    }
    if (argument === "--base") {
      baseline = argumentsList[index + 1];
      if (!baseline || baseline.startsWith("--")) {
        throw new Error("--base requires a Git SHA or ref.");
      }
      index += 1;
      continue;
    }
    if (argument.startsWith("--base=")) {
      baseline = argument.slice("--base=".length);
      if (!baseline) {
        throw new Error("--base requires a Git SHA or ref.");
      }
      continue;
    }
    if (argument.startsWith("-")) {
      throw new Error(`Unknown option: ${argument}`);
    }
    files.push(argument);
  }

  return {
    help: false,
    baseline,
    files: files.length > 0 ? files : DEFAULT_FILES,
  };
}

function runGit(argumentsList, cwd) {
  return execFileSync("git", argumentsList, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trimEnd();
}

function findRepositoryRoot() {
  return runGit(["rev-parse", "--show-toplevel"], process.cwd()).trim();
}

function resolveBaseline(repositoryRoot, baseline) {
  return runGit(
    ["rev-parse", "--verify", "--end-of-options", `${baseline}^{commit}`],
    repositoryRoot,
  ).trim();
}

function normalizeRepositoryPath(repositoryRoot, file) {
  const absolutePath = resolve(repositoryRoot, file);
  const repositoryPath = relative(repositoryRoot, absolutePath);

  if (
    !repositoryPath ||
    repositoryPath === ".." ||
    repositoryPath.startsWith(`..${sep}`) ||
    isAbsolute(repositoryPath)
  ) {
    throw new Error(`File must be inside the repository: ${file}`);
  }

  return {
    absolutePath,
    repositoryPath: repositoryPath.split(sep).join("/"),
  };
}

function readBaselineFile(repositoryRoot, baselineSha, repositoryPath) {
  return execFileSync("git", ["show", `${baselineSha}:${repositoryPath}`], {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function formatError(error) {
  if (error instanceof EditableDocumentError) {
    const details = Object.keys(error.details ?? {}).length
      ? ` ${JSON.stringify(error.details)}`
      : "";
    return `${error.code}: ${error.message}${details}`;
  }

  if (error && typeof error === "object" && "stderr" in error) {
    const stderr = String(error.stderr ?? "").trim();
    return stderr || error.message;
  }

  return error instanceof Error ? error.message : String(error);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const repositoryRoot = findRepositoryRoot();
  const baselineSha = resolveBaseline(repositoryRoot, options.baseline);
  let failed = false;
  let editableCount = 0;
  let changedCount = 0;

  for (const file of options.files) {
    try {
      const { absolutePath, repositoryPath } = normalizeRepositoryPath(
        repositoryRoot,
        file,
      );
      const [baselineSource, workingSource] = await Promise.all([
        Promise.resolve(
          readBaselineFile(repositoryRoot, baselineSha, repositoryPath),
        ),
        readFile(absolutePath, "utf8"),
      ]);
      const result = assertEditableOnlyChanges(baselineSource, workingSource);
      editableCount += result.editableIds.length;
      changedCount += result.changedIds.length;
      process.stdout.write(
        `OK ${repositoryPath} (${result.editableIds.length} fields, ${result.changedIds.length} changed)\n`,
      );
    } catch (error) {
      failed = true;
      process.stderr.write(`FAIL ${file}: ${formatError(error)}\n`);
    }
  }

  if (failed) {
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `Validated ${options.files.length} file(s) against ${baselineSha.slice(0, 12)}: ` +
      `${editableCount} editable fields, ${changedCount} changed.\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`Validation failed: ${formatError(error)}\n`);
  process.exitCode = 1;
});
