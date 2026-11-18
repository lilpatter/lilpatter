// Builds one SVG tile per project from the website's projects.json, and lists them in README.md.
// Usage: node scripts/generate-projects.mjs   (SITE_URL overrides https://lilpatter.github.io)
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";

const site = (process.env.SITE_URL || "https://lilpatter.github.io").replace(/\/$/, "");
const { projects } = await (await fetch(`${site}/projects.json`)).json();
// Each app's accent colour, which the site takes from its icon (projects.json only holds overrides).
const accents = await fetch(`${site}/accents.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
// Each app's current version (from its latest GitHub release), which the site writes on every build.
const versions = await fetch(`${site}/versions.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const STATUS = { available: "#3fb950", "in-development": "#d29922", beta: "#4493f8" };

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

async function dataUrl(path) {
  const res = await fetch(`${site}/${path}`);
  return `data:${res.headers.get("content-type") || "image/png"};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
}

// Blends two #rrggbb colours: t of `a` into `b`.
function mix(a, b, t) {
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [rgb(a), rgb(b)];
  return "#" + x.map((v, i) => Math.round(v * t + y[i] * (1 - t)).toString(16).padStart(2, "0")).join("");
}

function tile(p, icon) {
  const W = 340, H = 132;
  const tagline = wrap(p.tagline, 27, 2);
  // A muted, solid tint of the app's accent colour.
  const color = p.accent || accents[p.id];
  const accent = /^#[0-9a-f]{6}$/i.test(color || "") ? color : "#9cc6f5";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(p.name)}: ${esc(p.tagline)}">
  <title>${esc(p.name)}</title>
  <defs>
    <clipPath id="icon"><rect x="22" y="30" width="72" height="72" rx="16.2"/></clipPath>
    <style>
      text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif; }
      .mono { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; }
    </style>
  </defs>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="16" fill="${mix(accent, "#161b22", 0.11)}" stroke="${mix(accent, "#30363d", 0.18)}"/>
  <image href="${icon}" x="22" y="30" width="72" height="72" clip-path="url(#icon)" preserveAspectRatio="xMidYMid slice"/>
  <rect x="22" y="30" width="72" height="72" rx="16.2" fill="none" stroke="#f0f6fc" stroke-opacity="0.1"/>
  <circle cx="${W - 24}" cy="26" r="4.5" fill="${STATUS[p.status] || "#6e7681"}"/>
  <text x="112" y="${tagline.length > 1 ? 48 : 56}" font-size="20" font-weight="600" fill="#f0f6fc" letter-spacing="-0.3">${esc(p.name)}</text>
  ${tagline.map((l, i) => `<text x="112" y="${(tagline.length > 1 ? 70 : 78) + i * 18}" font-size="13.5" fill="#9198a1">${esc(l)}</text>`).join("\n  ")}
  <text x="112" y="112" font-size="11" fill="#6e7681" class="mono">${esc(p.platforms.join(" · "))}</text>
</svg>
`;
}

// The app being announced ("spotlight" in projects.json): a wide tile on a row of its own, first,
// glowing in the app's accent colour, with a "New" badge and the current version.
function spotlightTile(p, icon) {
  const W = 700, H = 176, M = 14; // M: room around the card for the glow
  const color = p.accent || accents[p.id];
  const accent = /^#[0-9a-f]{6}$/i.test(color || "") ? color : "#9cc6f5";
  const version = versions[p.id] ? `v${versions[p.id]}` : "";
  const title = wrap(p.spotlight.title, 44, 1)[0];
  const line = wrap(p.tagline, 64, 1)[0];
  const cw = W - 2 * M, ch = H - 2 * M;
  const badgeW = 46, verW = version ? 14 + version.length * 7.4 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(p.name)} ${esc(version)}: ${esc(p.spotlight.title)}">
  <title>${esc(p.name)}</title>
  <defs>
    <clipPath id="icon"><rect x="${M + 26}" y="${M + 26}" width="${ch - 52}" height="${ch - 52}" rx="${(ch - 52) * 0.225}"/></clipPath>
    <filter id="glow" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="7"/></filter>
    <linearGradient id="wash" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.26"/>
      <stop offset="0.55" stop-color="${accent}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/>
      <stop offset="0.5" stop-color="#fff" stop-opacity="0.9"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <mask id="edge"><rect x="${M}" y="${M}" width="${cw}" height="${ch}" rx="18" fill="none" stroke="#fff" stroke-width="2"/></mask>
    <style>
      text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif; }
      .mono { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; }
      .halo { animation: breathe 3.2s ease-in-out infinite; }
      .sweep { animation: sweep 4.5s linear infinite; }
      @keyframes breathe { 0%, 100% { opacity: 0.45; } 50% { opacity: 0.95; } }
      @keyframes sweep { from { transform: translateX(-${cw}px); } to { transform: translateX(${cw}px); } }
      @media (prefers-reduced-motion: reduce) { .halo, .sweep { animation: none; } }
    </style>
  </defs>
  <rect class="halo" x="${M}" y="${M}" width="${cw}" height="${ch}" rx="18" fill="${accent}" filter="url(#glow)"/>
  <rect x="${M}" y="${M}" width="${cw}" height="${ch}" rx="18" fill="${mix(accent, "#0d1117", 0.1)}"/>
  <rect x="${M}" y="${M}" width="${cw}" height="${ch}" rx="18" fill="url(#wash)"/>
  <rect x="${M + 0.5}" y="${M + 0.5}" width="${cw - 1}" height="${ch - 1}" rx="17.5" fill="none" stroke="${accent}" stroke-opacity="0.75"/>
  <g mask="url(#edge)"><rect class="sweep" x="${M}" y="${M - 2}" width="${cw * 0.35}" height="${ch + 4}" fill="url(#sweep)"/></g>
  <image href="${icon}" x="${M + 26}" y="${M + 26}" width="${ch - 52}" height="${ch - 52}" clip-path="url(#icon)" preserveAspectRatio="xMidYMid slice"/>
  <rect x="${M + 26}" y="${M + 26}" width="${ch - 52}" height="${ch - 52}" rx="${(ch - 52) * 0.225}" fill="none" stroke="#f0f6fc" stroke-opacity="0.12"/>
  <g transform="translate(${M + ch}, ${M + 30})">
    <rect width="${badgeW}" height="20" rx="10" fill="${accent}"/>
    <text x="${badgeW / 2}" y="14.2" text-anchor="middle" font-size="11" font-weight="800" letter-spacing="0.8" fill="#0d1117">${esc((p.spotlight.label || "New").toUpperCase())}</text>
    ${version ? `<rect x="${badgeW + 8}" width="${verW}" height="20" rx="10" fill="none" stroke="${accent}" stroke-opacity="0.7"/>
    <text x="${badgeW + 8 + verW / 2}" y="14.2" text-anchor="middle" font-size="11.5" font-weight="700" fill="${accent}" class="mono">${esc(version)}</text>` : ""}
    <text y="54" font-size="25" font-weight="700" fill="#f0f6fc" letter-spacing="-0.4">${esc(title)}</text>
    <text y="78" font-size="14" fill="#9198a1">${esc(line)}</text>
    <text y="104" font-size="11" fill="#6e7681" class="mono">${esc([p.name, ...p.platforms, "Free"].join(" · "))}</text>
  </g>
</svg>
`;
}

await mkdir("projects", { recursive: true });
const keep = new Set();
const spotlight = projects.find((p) => p.spotlight);
for (const p of projects) {
  const icon = await dataUrl(p.icon);
  await writeFile(`projects/${p.id}.svg`, tile(p, icon));
  keep.add(`${p.id}.svg`);
  if (p === spotlight) {
    await writeFile(`projects/${p.id}-spotlight.svg`, spotlightTile(p, icon));
    keep.add(`${p.id}-spotlight.svg`);
  }
}
for (const f of await readdir("projects")) if (!keep.has(f)) await rm(`projects/${f}`);

// Every tile links to the project on the website, never straight to a repository.
// The spotlight app leads on a row of its own; the rest follow in rows of three, or two when that
// leaves no tile alone on the last row (four apps make a 2 × 2 grid).
const rest = projects.filter((p) => p !== spotlight);
const perRow = rest.length % 3 === 1 && rest.length % 2 === 0 ? 2 : 3;
const row = rest
  .map((p) => `  <a href="${site}/${p.id}/"><img src="./projects/${p.id}.svg" width="${perRow === 2 ? 48 : 32}%" alt="${esc(p.name)}: ${esc(p.tagline)}" /></a>`)
  .join("\n");
const lead = spotlight
  ? `<p align="center">\n  <a href="${site}/${spotlight.id}/"><img src="./projects/${spotlight.id}-spotlight.svg" width="97%" alt="${esc(spotlight.name)}${versions[spotlight.id] ? ` ${esc(versions[spotlight.id])}` : ""}: ${esc(spotlight.spotlight.title)}" /></a>\n</p>\n`
  : "";
const readme = await readFile("README.md", "utf8");
const next = readme.replace(
  /<!-- projects:start -->[\s\S]*<!-- projects:end -->/,
  `<!-- projects:start -->\n${lead}<p align="center">\n${row}\n</p>\n<!-- projects:end -->`
);
await writeFile("README.md", next);
console.log(`Wrote ${projects.length} project tiles from ${site}`);
