const fs = require("fs");
const path = require("path");

const readmePath = path.join(__dirname, "..", "README.md");
const readme = fs.readFileSync(readmePath, "utf8");

const now = new Date();
const year = now.getUTCFullYear();
const start = Date.UTC(year, 0, 1, 0, 0, 0);
const end = Date.UTC(year, 11, 31, 23, 59, 59);
const progress = (Date.now() - start) / (end - start);
const clamped = Math.max(0, Math.min(progress, 1));
const width = 30;
const filled = Math.floor(clamped * width);
const bar = "█".repeat(filled) + "░".repeat(width - filled);
const percentText = `${(clamped * 100).toFixed(2)}%`;
const dateText = now.toLocaleDateString("en-GB", {
  timeZone: "UTC",
  day: "2-digit",
  month: "short",
  year: "numeric",
}).replace(/ /g, "-");

const badgeUrl = `https://img.shields.io/badge/${year}%20Progress-${encodeURIComponent(percentText)}-111111?style=for-the-badge`;
const section = [
  `### Year Progress`,
  ``,
  `![${year} Progress](${badgeUrl})`,
  ``,
  `\`${bar}\` **${percentText}**`,
  ``,
  `Updated: \`${dateText} UTC\``
].join("\n");

const updated = readme.replace(
  /<!--START_SECTION:year-progress-->[\s\S]*?<!--END_SECTION:year-progress-->/,
  `<!--START_SECTION:year-progress-->\n${section}\n<!--END_SECTION:year-progress-->`
);

fs.writeFileSync(readmePath, updated);
