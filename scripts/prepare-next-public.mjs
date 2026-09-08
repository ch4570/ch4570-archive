#!/usr/bin/env node

import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const copies = [
  ["assets/diagrams/orbit-jpa.svg", "public/assets/diagrams/orbit-jpa.svg"],
  ["assets/diagrams/orbit-event.svg", "public/assets/diagrams/orbit-event.svg"],
  ["assets/diagrams/orbit-batch.svg", "public/assets/diagrams/orbit-batch.svg"],
  ["assets/diagrams/orbit-feed.svg", "public/assets/diagrams/orbit-feed.svg"],

  ["assets/fonts/BarlowCondensed-BlackItalic.ttf", "public/assets/fonts/BarlowCondensed-BlackItalic.ttf"],
  ["assets/fonts/OFL-BarlowCondensed.txt", "public/assets/fonts/OFL-BarlowCondensed.txt"],
  ["assets/universe.css", "public/assets/universe.css"],
  ["assets/cosmic-cinema.webp", "public/assets/cosmic-cinema.webp"],
  ["assets/design-system.css", "public/assets/design-system.css"],
  ["assets/terminal-home.css", "public/assets/terminal-home.css"],
  ["assets/site.js", "public/assets/site.js"],
  ["assets/system-scene.js", "public/assets/system-scene.js"],
  ["assets/archive-terminal.js", "public/assets/archive-terminal.js"],
  ["assets/portrait-terminal.js", "public/assets/portrait-terminal.js"],
  ["assets/resume-explorer.js", "public/assets/resume-explorer.js"],
  ["assets/profile.jpg", "public/assets/profile.jpg"],
  ["assets/social-card.png", "public/assets/social-card.png"],
  [
    "assets/diagrams/feed-serving.svg",
    "public/assets/diagrams/feed-serving.svg",
  ],
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
