// Generates card.svg: a browser-window style profile card with a contribution heatmap.
// Usage: GITHUB_TOKEN=... node scripts/generate-card.mjs [login]
import { writeFile } from "node:fs/promises";

const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error("GITHUB_TOKEN is required");
const login = process.argv[2] || process.env.PROFILE_LOGIN || process.env.GITHUB_REPOSITORY_OWNER;
if (!login) throw new Error("Pass a GitHub login as the first argument");
const out = process.env.CARD_OUT || "card.svg";

async function gql(query, variables = {}) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

const { user } = await gql(
  `query($login: String!) {
    user(login: $login) {
      login name bio createdAt avatarUrl(size: 240)
      followers { totalCount }
      following { totalCount }
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks { contributionDays { date contributionCount contributionLevel } }
        }
      }
    }
  }`,
  { login }
);

// All-time total: one aliased query per year since the account was created.
const created = new Date(user.createdAt);
const now = new Date();
const years = [];
for (let y = created.getUTCFullYear(); y <= now.getUTCFullYear(); y++) years.push(y);
const yearly = await gql(
  `query($login: String!) { user(login: $login) { ${years
    .map(
      (y) =>
        `y${y}: contributionsCollection(from: "${y}-01-01T00:00:00Z", to: "${y}-12-31T23:59:59Z") { contributionCalendar { totalContributions } }`
    )
    .join("\n")} } }`,
  { login }
);
const allTime = years.reduce((sum, y) => sum + yearly.user[`y${y}`].contributionCalendar.totalContributions, 0);
const yearsOnGitHub = Math.max(1, Math.floor((now - created) / (365.25 * 24 * 3600 * 1000)));

const calendar = user.contributionsCollection.contributionCalendar;
const days = calendar.weeks.flatMap((w) => w.contributionDays);

// Current streak counts back from today; a zero today doesn't break it yet.
let streak = 0;
for (let i = days.length - 1; i >= 0; i--) {
  if (days[i].contributionCount > 0) streak++;
  else if (i !== days.length - 1) break;
}
let best = 0;
for (let run = 0, i = 0; i < days.length; i++) {
  run = days[i].contributionCount > 0 ? run + 1 : 0;
  best = Math.max(best, run);
}

const avatarRes = await fetch(user.avatarUrl);
const avatar = `data:${avatarRes.headers.get("content-type") || "image/png"};base64,${Buffer.from(
  await avatarRes.arrayBuffer()
).toString("base64")}`;

// ---- drawing -------------------------------------------------------------

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = (n) => n.toLocaleString("en-US");
const compact = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "")}K` : String(n));
const plural = (n, word) => `${word}${n === 1 ? "" : "s"}`;

function wrap(text, max, maxLines) {
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if ((line + " " + word).trim().length > max && line) {
      lines.push(line);
      line = word;
    } else line = (line + " " + word).trim();
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "") + "…";
  }
  return lines;
}

const W = 1100, H = 560;
const win = { x: 40, y: 36, w: W - 80, h: H - 72, r: 26 };
const pad = 44;
const levels = {
  NONE: "#25272c",
  FIRST_QUARTILE: "#3a4658",
  SECOND_QUARTILE: "#4d6280",
  THIRD_QUARTILE: "#6789b3",
  FOURTH_QUARTILE: "#9cc6f5",
};

const name = user.name || user.login;
const bio = wrap(user.bio || "Building things on GitHub.", 62, 2);

const cell = 13, gap = 3.6, step = cell + gap;
const gridW = calendar.weeks.length * step - gap;
const gridX = win.x + (win.w - gridW) / 2;
const gridY = win.y + 344;

let cells = "";
let months = "";
let lastMonth = -1, lastLabelX = -100;
calendar.weeks.forEach((week, wi) => {
  const x = gridX + wi * step;
  const first = new Date(week.contributionDays[0].date + "T00:00:00Z");
  const m = first.getUTCMonth();
  // The first column is usually a partial month; only label it if most of that month is visible.
  const startsMonth = wi > 0 || first.getUTCDate() <= 7;
  if (m !== lastMonth) {
    if (startsMonth && x - lastLabelX > 3 * step && wi < calendar.weeks.length - 2) {
      months += `<text x="${x.toFixed(1)}" y="${gridY - 12}" class="muted small">${first.toLocaleString("en-US", { month: "short", timeZone: "UTC" })}</text>`;
      lastLabelX = x;
    }
    lastMonth = m;
  }
  for (const d of week.contributionDays) {
    const row = new Date(d.date + "T00:00:00Z").getUTCDay();
    const y = gridY + row * step;
    cells += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cell}" height="${cell}" rx="3" fill="${levels[d.contributionLevel]}"><title>${d.contributionCount} on ${d.date}</title></rect>`;
  }
});

const ax = win.x + pad + 66, ay = win.y + 172; // avatar centre
const tx = win.x + 230; // text column
const rx = win.x + win.w - pad; // right edge
const githubMark =
  "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z";

const streakText = streak > 0 ? `${streak} Day Streak` : `${best} Day Best Streak`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(name)} on GitHub">
  <title>${esc(name)} (@${esc(user.login)})</title>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#38d6e0"/>
      <stop offset="0.5" stop-color="#9bb8f2"/>
      <stop offset="1" stop-color="#d9a7c7"/>
    </linearGradient>
    <linearGradient id="glow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.05"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#0b1020" flood-opacity="0.45"/>
    </filter>
    <clipPath id="avatar"><circle cx="${ax}" cy="${ay}" r="64"/></clipPath>
    <style>
      text { font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; fill: #e8eaed; }
      .muted { fill: #8b9099; }
      .soft { fill: #b4b8bf; }
      .small { font-size: 13px; }
      .strong { fill: #f2f3f5; font-weight: 600; }
    </style>
  </defs>

  <rect width="${W}" height="${H}" rx="28" fill="url(#bg)"/>
  <g filter="url(#shadow)">
    <rect x="${win.x}" y="${win.y}" width="${win.w}" height="${win.h}" rx="${win.r}" fill="#1b1c1f"/>
  </g>
  <rect x="${win.x}" y="${win.y}" width="${win.w}" height="${win.h}" rx="${win.r}" fill="url(#glow)" stroke="#2c2e33"/>

  <!-- window chrome -->
  <circle cx="${win.x + 30}" cy="${win.y + 30}" r="7" fill="#ff5f57"/>
  <circle cx="${win.x + 52}" cy="${win.y + 30}" r="7" fill="#febc2e"/>
  <circle cx="${win.x + 74}" cy="${win.y + 30}" r="7" fill="#28c840"/>
  <path d="M${win.x + 108} ${win.y + 24} l-6 6 6 6 M${win.x + 128} ${win.y + 24} l6 6 -6 6" stroke="#8b9099" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="${W / 2 - 150}" y="${win.y + 14}" width="300" height="32" rx="10" fill="#26282c"/>
  <g transform="translate(${W / 2 - 132} ${win.y + 23})" stroke="#8b9099" stroke-width="1.6" fill="none">
    <rect x="0" y="5" width="11" height="9" rx="2"/><path d="M2.5 5V3.5a3 3 0 0 1 6 0V5"/>
  </g>
  <text x="${W / 2}" y="${win.y + 35}" text-anchor="middle" class="soft" font-size="14">github.com/${esc(user.login)}</text>

  <!-- identity -->
  <circle cx="${ax}" cy="${ay}" r="67" fill="#2c2e33"/>
  <image href="${avatar}" x="${ax - 64}" y="${ay - 64}" width="128" height="128" clip-path="url(#avatar)" preserveAspectRatio="xMidYMid slice"/>
  <text x="${tx}" y="${win.y + 148}" font-size="52" font-weight="700" letter-spacing="-1.2" class="strong">${esc(name)}</text>
  <text x="${tx}" y="${win.y + 190}" font-size="18">
    <tspan class="strong">@${esc(user.login)}</tspan><tspan class="muted" dx="10">•</tspan><tspan class="strong" dx="10">${compact(user.followers.totalCount)}</tspan><tspan class="soft"> ${plural(user.followers.totalCount, "Follower")}</tspan><tspan class="muted" dx="10">•</tspan><tspan class="strong" dx="10">${compact(user.following.totalCount)}</tspan><tspan class="soft"> Following</tspan>
  </text>
  ${bio.map((l, i) => `<text x="${tx}" y="${win.y + 228 + i * 26}" font-size="17" class="muted">${esc(l)}</text>`).join("\n  ")}

  <!-- totals -->
  <g transform="translate(${rx - 76} ${win.y + 92}) scale(4.75)"><path d="${githubMark}" fill="#e8eaed"/></g>
  <text x="${rx}" y="${win.y + 220}" text-anchor="end" font-size="18" class="soft">${fmt(allTime)} ${plural(allTime, "Contribution")}</text>
  <text x="${rx}" y="${win.y + 248}" text-anchor="end" font-size="18" class="soft">${yearsOnGitHub} ${plural(yearsOnGitHub, "Year")}</text>

  <!-- past year -->
  <text x="${gridX}" y="${gridY - 40}" font-size="18">
    <tspan class="strong">Past Year</tspan><tspan class="soft" dx="16">${fmt(calendar.totalContributions)} ${plural(calendar.totalContributions, "Contribution")}</tspan><tspan class="muted" dx="12">•</tspan><tspan class="soft" dx="12">${streakText}</tspan>
  </text>
  ${months}
  ${cells}
</svg>
`;

await writeFile(out, svg);
console.log(`Wrote ${out} for @${user.login}: ${calendar.totalContributions} past year, ${allTime} all time, streak ${streak}/${best}`);
