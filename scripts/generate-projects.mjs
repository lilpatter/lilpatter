// Builds one SVG tile per project from the website's projects.json, and lists them in README.md.
// Usage: node scripts/generate-projects.mjs   (SITE_URL overrides https://lilpatter.github.io)
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";

const site = (process.env.SITE_URL || "https://lilpatter.github.io").replace(/\/$/, "");
const { projects } = await (await fetch(`${site}/projects.json`)).json();

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

function tile(p, icon) {
  const W = 340, H = 132;
  const tagline = wrap(p.tagline, 27, 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(p.name)}: ${esc(p.tagline)}">
  <title>${esc(p.name)}</title>
  <defs>
    <clipPath id="icon"><rect x="22" y="30" width="72" height="72" rx="16.2"/></clipPath>
    <radialGradient id="glow" cx="${W}" cy="0" r="220" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${esc(p.accent || "#9cc6f5")}" stop-opacity="0.18"/>
      <stop offset="1" stop-color="${esc(p.accent || "#9cc6f5")}" stop-opacity="0"/>
    </radialGradient>
    <style>
      text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif; }
      .mono { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; }
    </style>
  </defs>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="16" fill="#161b22" stroke="#30363d"/>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="16" fill="url(#glow)"/>
  <image href="${icon}" x="22" y="30" width="72" height="72" clip-path="url(#icon)" preserveAspectRatio="xMidYMid slice"/>
  <rect x="22" y="30" width="72" height="72" rx="16.2" fill="none" stroke="#f0f6fc" stroke-opacity="0.1"/>
  <circle cx="${W - 24}" cy="26" r="4.5" fill="${STATUS[p.status] || "#6e7681"}"/>
  <text x="112" y="${tagline.length > 1 ? 48 : 56}" font-size="20" font-weight="600" fill="#f0f6fc" letter-spacing="-0.3">${esc(p.name)}</text>
  ${tagline.map((l, i) => `<text x="112" y="${(tagline.length > 1 ? 70 : 78) + i * 18}" font-size="13.5" fill="#9198a1">${esc(l)}</text>`).join("\n  ")}
  <text x="112" y="112" font-size="11" fill="#6e7681" class="mono">${esc(p.platforms.join(" · "))}</text>
</svg>
`;
}

await mkdir("projects", { recursive: true });
const keep = new Set();
for (const p of projects) {
  await writeFile(`projects/${p.id}.svg`, tile(p, await dataUrl(p.icon)));
  keep.add(`${p.id}.svg`);
}
for (const f of await readdir("projects")) if (!keep.has(f)) await rm(`projects/${f}`);

// Every tile links to the project on the website, never straight to a repository.
const row = projects
  .map((p) => `  <a href="${site}/#${p.id}"><img src="./projects/${p.id}.svg" width="32%" alt="${esc(p.name)}: ${esc(p.tagline)}" /></a>`)
  .join("\n");
const readme = await readFile("README.md", "utf8");
const next = readme.replace(
  /<!-- projects:start -->[\s\S]*<!-- projects:end -->/,
  `<!-- projects:start -->\n<p align="center">\n${row}\n</p>\n<!-- projects:end -->`
);
await writeFile("README.md", next);
console.log(`Wrote ${projects.length} project tiles from ${site}`);
