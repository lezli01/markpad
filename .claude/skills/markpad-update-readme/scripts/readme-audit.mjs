#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const json = args.includes("--json");
const readmeArg = args.find((arg) => arg !== "--json") ?? "README.md";
const readmePath = path.resolve(process.cwd(), readmeArg);
const repoRoot = path.dirname(readmePath);

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!fs.existsSync(readmePath)) {
  fail(`README not found: ${readmePath}`);
}

const markdown = fs.readFileSync(readmePath, "utf8");

function collectHeadings(text) {
  return [...text.matchAll(/^(#{1,6})\s+(.+)$/gm)].map((match) => ({
    level: match[1].length,
    text: match[2].trim(),
  }));
}

function sectionBody(text, headingName) {
  const escaped = headingName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^##\\s+${escaped}\\s*$`, "im").exec(text);
  if (!match) return "";

  const start = match.index + match[0].length;
  const next = /^##\s+/gim;
  next.lastIndex = start;
  const nextMatch = next.exec(text);
  return text.slice(start, nextMatch?.index ?? text.length);
}

function collectFeatureBullets(text) {
  return sectionBody(text, "Features")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) =>
      line
        .replace(/^[-*]\s+/, "")
        .replace(/\*\*/g, "")
        .trim(),
    );
}

function collectImages(text) {
  const images = [];

  for (const match of text.matchAll(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    images.push({
      type: "markdown",
      alt: match[1],
      src: match[2],
    });
  }

  for (const match of text.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    const tag = match[0];
    const alt = /\balt=["']([^"']*)["']/i.exec(tag)?.[1] ?? "";
    images.push({
      type: "html",
      alt,
      src: match[1],
    });
  }

  return images.map((image) => {
    const remote = /^(?:https?:)?\/\//i.test(image.src) || image.src.startsWith("data:");
    const cleanSrc = image.src.split("#")[0].split("?")[0];
    const filePath = remote ? null : path.resolve(repoRoot, cleanSrc);

    return {
      ...image,
      remote,
      exists: remote ? null : fs.existsSync(filePath),
      path: filePath,
    };
  });
}

const report = {
  readme: readmePath,
  headings: collectHeadings(markdown),
  features: collectFeatureBullets(markdown),
  images: collectImages(markdown),
};

report.missingLocalImages = report.images.filter((image) => image.remote === false && !image.exists);

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`README audit: ${report.readme}`);
  console.log("");

  console.log("Headings:");
  for (const heading of report.headings) {
    console.log(`${"  ".repeat(heading.level - 1)}- ${heading.text}`);
  }

  console.log("");
  console.log(`Features (${report.features.length}):`);
  for (const feature of report.features) {
    console.log(`- ${feature}`);
  }

  console.log("");
  console.log(`Images (${report.images.length}):`);
  for (const image of report.images) {
    const status = image.remote ? "remote" : image.exists ? "ok" : "missing";
    console.log(`- [${status}] ${image.src}${image.alt ? ` (${image.alt})` : ""}`);
  }

  if (report.missingLocalImages.length > 0) {
    console.log("");
    console.log("Missing local images:");
    for (const image of report.missingLocalImages) {
      console.log(`- ${image.src}`);
    }
    process.exitCode = 2;
  }
}
