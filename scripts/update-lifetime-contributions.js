const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const README_PATH = path.join(ROOT, "README.md");
const ASSET_DIR = path.join(ROOT, "assets");
const SVG_PATH = path.join(ASSET_DIR, "lifetime-contributions.svg");
const START_YEAR = 2020;
const USERNAME =
  process.env.GH_USERNAME ||
  process.env.GITHUB_REPOSITORY_OWNER ||
  "harshitpaunikar1";

function utcDateParts(date) {
  return {
    year: date.getUTCFullYear(),
    month: String(date.getUTCMonth() + 1).padStart(2, "0"),
    day: String(date.getUTCDate()).padStart(2, "0"),
  };
}

function isoDate(date) {
  const { year, month, day } = utcDateParts(date);
  return `${year}-${month}-${day}`;
}

function endOfYearIso(year) {
  return `${year}-12-31`;
}

function buildContributionQuery(startYear, endYear, todayIso) {
  const collections = [];
  for (let year = startYear; year <= endYear; year += 1) {
    const from = `${year}-01-01T00:00:00Z`;
    const to = year === endYear ? `${todayIso}T23:59:59Z` : `${endOfYearIso(year)}T23:59:59Z`;
    collections.push(`
      y${year}: contributionsCollection(from: "${from}", to: "${to}") {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              contributionCount
              date
            }
          }
        }
      }
    `);
  }

  return `
    query LifetimeContributions($login: String!) {
      user(login: $login) {
        ${collections.join("\n")}
      }
    }
  `;
}

async function fetchContributionData() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) {
    throw new Error("Missing GITHUB_TOKEN or GH_TOKEN.");
  }

  const today = new Date();
  const endYear = today.getUTCFullYear();
  const todayIso = isoDate(today);
  const query = buildContributionQuery(START_YEAR, endYear, todayIso);

  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "harshitpaunikar1-lifetime-contributions",
    },
    body: JSON.stringify({
      query,
      variables: { login: USERNAME },
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub GraphQL request failed with ${response.status}.`);
  }

  const payload = await response.json();
  if (payload.errors) {
    throw new Error(`GitHub GraphQL errors: ${JSON.stringify(payload.errors)}`);
  }

  if (!payload.data || !payload.data.user) {
    throw new Error("GitHub GraphQL response did not include user data.");
  }

  const years = [];
  for (let year = START_YEAR; year <= endYear; year += 1) {
    const calendar = payload.data.user[`y${year}`]?.contributionCalendar;
    if (!calendar) {
      throw new Error(`Missing contribution calendar for year ${year}.`);
    }
    const days = calendar.weeks.flatMap((week) => week.contributionDays);
    years.push({
      year,
      total: calendar.totalContributions,
      days,
    });
  }

  return {
    years,
    updatedIso: todayIso,
  };
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function generateSvg(data) {
  const width = 1080;
  const height = 420;
  const chartX = 84;
  const chartY = 118;
  const chartWidth = 930;
  const chartHeight = 220;
  const bars = data.years;
  const maxValue = Math.max(...bars.map((item) => item.total), 1);
  const barSlot = chartWidth / bars.length;
  const barWidth = Math.min(74, barSlot * 0.56);
  const total = bars.reduce((sum, item) => sum + item.total, 0);

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const value = Math.round(maxValue * (1 - ratio));
    const y = chartY + chartHeight * ratio;
    return `
      <line x1="${chartX}" y1="${y}" x2="${chartX + chartWidth}" y2="${y}" stroke="#d0d7de" stroke-width="1" />
      <text x="${chartX - 12}" y="${y + 5}" text-anchor="end" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif" font-size="12" fill="#57606a">${formatNumber(value)}</text>
    `;
  }).join("");

  const barMarkup = bars.map((item, index) => {
    const x = chartX + index * barSlot + (barSlot - barWidth) / 2;
    const barHeight = maxValue === 0 ? 0 : (item.total / maxValue) * chartHeight;
    const y = chartY + chartHeight - barHeight;
    return `
      <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="10" fill="#2da44e" />
      <text x="${x + barWidth / 2}" y="${y - 10}" text-anchor="middle" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif" font-size="12" font-weight="600" fill="#24292f">${formatNumber(item.total)}</text>
      <text x="${x + barWidth / 2}" y="${chartY + chartHeight + 28}" text-anchor="middle" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif" font-size="13" fill="#57606a">${item.year}</text>
    `;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">GitHub lifetime contribution stats</title>
  <desc id="desc">Contribution totals from ${START_YEAR} through ${data.updatedIso} for ${USERNAME}.</desc>
  <rect width="${width}" height="${height}" rx="24" fill="#ffffff" />
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="23" stroke="#d0d7de" />
  <text x="40" y="54" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif" font-size="28" font-weight="700" fill="#24292f">GitHub Lifetime Contributions</text>
  <text x="40" y="84" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif" font-size="16" fill="#57606a">${START_YEAR} to ${data.updatedIso} • ${formatNumber(total)} total contributions</text>
  ${gridLines}
  <line x1="${chartX}" y1="${chartY + chartHeight}" x2="${chartX + chartWidth}" y2="${chartY + chartHeight}" stroke="#8c959f" stroke-width="1.5" />
  ${barMarkup}
</svg>`;
}

function buildSection(data) {
  const total = data.years.reduce((sum, item) => sum + item.total, 0);
  const rows = data.years
    .map((item) => `| ${item.year} | ${formatNumber(item.total)} |`)
    .join("\n");

  return [
    "#### 2020 To Present",
    "",
    "![Lifetime contribution chart](./assets/lifetime-contributions.svg)",
    "",
    `**Total contributions since 2020:** \`${formatNumber(total)}\``,
    "",
    "| Year | Contributions |",
    "| --- | ---: |",
    rows,
    "",
    `Updated: \`${data.updatedIso} UTC\``,
  ].join("\n");
}

function updateReadme(section) {
  const readme = fs.readFileSync(README_PATH, "utf8");
  const updated = readme.replace(
    /<!--START_SECTION:lifetime-contributions-->[\s\S]*?<!--END_SECTION:lifetime-contributions-->/,
    `<!--START_SECTION:lifetime-contributions-->\n${section}\n<!--END_SECTION:lifetime-contributions-->`
  );
  fs.writeFileSync(README_PATH, updated);
}

async function main() {
  const data = await fetchContributionData();
  const svg = generateSvg(data);
  const section = buildSection(data);

  fs.mkdirSync(ASSET_DIR, { recursive: true });
  fs.writeFileSync(SVG_PATH, svg);
  updateReadme(section);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
