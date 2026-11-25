#!/usr/bin/env node

import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const copies = [

  ["assets/fonts/BarlowCondensed-BlackItalic.ttf", "public/assets/fonts/BarlowCondensed-BlackItalic.ttf"],
  ["assets/fonts/OFL-BarlowCondensed.txt", "public/assets/fonts/OFL-BarlowCondensed.txt"],
  ["assets/fonts/Pretendard-Regular.woff2", "public/assets/fonts/Pretendard-Regular.woff2"],
  ["assets/fonts/Pretendard-SemiBold.woff2", "public/assets/fonts/Pretendard-SemiBold.woff2"],
  ["assets/fonts/Pretendard-Bold.woff2", "public/assets/fonts/Pretendard-Bold.woff2"],
  ["assets/fonts/Pretendard-ExtraBold.woff2", "public/assets/fonts/Pretendard-ExtraBold.woff2"],
  ["assets/fonts/JetBrainsMono-Regular.woff2", "public/assets/fonts/JetBrainsMono-Regular.woff2"],
  ["assets/fonts/JetBrainsMono-Medium.woff2", "public/assets/fonts/JetBrainsMono-Medium.woff2"],
  ["assets/fonts/JetBrainsMono-Bold.woff2", "public/assets/fonts/JetBrainsMono-Bold.woff2"],
  ["assets/fonts/OFL-Pretendard.txt", "public/assets/fonts/OFL-Pretendard.txt"],
  ["assets/fonts/OFL-JetBrainsMono.txt", "public/assets/fonts/OFL-JetBrainsMono.txt"],
  ["assets/home.css", "public/assets/home.css"],
  ["assets/home.js", "public/assets/home.js"],
  ["assets/flow.js", "public/assets/flow.js"],
  ["assets/home-data.js", "public/assets/home-data.js"],
  ["assets/cosmic-cinema.webp", "public/assets/cosmic-cinema.webp"],
  ["assets/design-system.css", "public/assets/design-system.css"],
  ["assets/site-frame.css", "public/assets/site-frame.css"],
  ["assets/resume.css", "public/assets/resume.css"],
  ["assets/viz.css", "public/assets/viz.css"],
  ["assets/doc.css", "public/assets/doc.css"],
  ["assets/resume-terminal.js", "public/assets/resume-terminal.js"],
  ["assets/resume-deco/dark/cmd-activity.png", "public/assets/resume-deco/dark/cmd-activity.png"],
  ["assets/resume-deco/dark/cmd-career.png", "public/assets/resume-deco/dark/cmd-career.png"],
  ["assets/resume-deco/dark/cmd-oss.png", "public/assets/resume-deco/dark/cmd-oss.png"],
  ["assets/resume-deco/dark/cmd-stack.png", "public/assets/resume-deco/dark/cmd-stack.png"],
  ["assets/resume-deco/dark/head.png", "public/assets/resume-deco/dark/head.png"],
  ["assets/resume-deco/dark/prompt.png", "public/assets/resume-deco/dark/prompt.png"],
  ["assets/resume-deco/dark/title.png", "public/assets/resume-deco/dark/title.png"],
  ["assets/resume-deco/light/cmd-activity.png", "public/assets/resume-deco/light/cmd-activity.png"],
  ["assets/resume-deco/light/cmd-career.png", "public/assets/resume-deco/light/cmd-career.png"],
  ["assets/resume-deco/light/cmd-oss.png", "public/assets/resume-deco/light/cmd-oss.png"],
  ["assets/resume-deco/light/cmd-stack.png", "public/assets/resume-deco/light/cmd-stack.png"],
  ["assets/resume-deco/light/head.png", "public/assets/resume-deco/light/head.png"],
  ["assets/resume-deco/light/prompt.png", "public/assets/resume-deco/light/prompt.png"],
  ["assets/resume-deco/light/title.png", "public/assets/resume-deco/light/title.png"],
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
    "output/pdf/seo-minjae-resume-print.pdf",
    "public/pdf/seo-minjae-resume-print.pdf",
  ],
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
