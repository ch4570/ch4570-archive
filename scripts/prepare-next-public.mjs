#!/usr/bin/env node

import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const copies = [
  ["assets/design-system.css", "public/assets/design-system.css"],
  ["assets/site.js", "public/assets/site.js"],
  ["assets/profile.jpg", "public/assets/profile.jpg"],
  ["assets/diagrams/feed-serving.svg", "public/assets/diagrams/feed-serving.svg"],
  ["output/pdf/seo-minjae-resume.pdf", "public/pdf/seo-minjae-resume.pdf"],
  [
    "output/pdf/seo-minjae-career-description.pdf",
    "public/pdf/seo-minjae-career-description.pdf",
  ],
  [
    "output/pdf/seo-minjae-backend-portfolio.pdf",
    "public/pdf/seo-minjae-backend-portfolio.pdf",
  ],
];

await Promise.all(
  copies.map(async ([source, target]) => {
    const targetPath = join(repositoryRoot, target);
    await mkdir(dirname(targetPath), { recursive: true });
    await copyFile(join(repositoryRoot, source), targetPath);
  }),
);

process.stdout.write(`Prepared ${copies.length} public assets for Next.js.\n`);
