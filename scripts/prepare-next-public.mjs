#!/usr/bin/env node

import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const copies = [

  ["assets/fonts/BarlowCondensed-BlackItalic.ttf", "public/assets/fonts/BarlowCondensed-BlackItalic.ttf"],
  ["assets/fonts/OFL-BarlowCondensed.txt", "public/assets/fonts/OFL-BarlowCondensed.txt"],
  ["assets/home.css", "public/assets/home.css"],
  ["assets/home.js", "public/assets/home.js"],
  ["assets/flow.js", "public/assets/flow.js"],
  ["assets/event-stream.js", "public/assets/event-stream.js"],
  ["assets/vendor/three.module.min.js", "public/assets/vendor/three.module.min.js"],
  ["assets/cosmic-cinema.webp", "public/assets/cosmic-cinema.webp"],
  ["assets/design-system.css", "public/assets/design-system.css"],
  ["assets/terminal-home.css", "public/assets/terminal-home.css"],
  ["assets/site.js", "public/assets/site.js"],
  ["assets/system-scene.js", "public/assets/system-scene.js"],
  ["assets/archive-terminal.js", "public/assets/archive-terminal.js"],
  ["assets/portrait-terminal.js", "public/assets/portrait-terminal.js"],
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
