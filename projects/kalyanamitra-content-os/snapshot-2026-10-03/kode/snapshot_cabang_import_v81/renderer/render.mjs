#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";
import { applyBrandIdentity, resolveBrandProfile } from "./brand-profile.mjs";

const inputPath = process.argv[2];
const outputDir = process.argv[3] ?? "renderer/output";
if (!inputPath) { console.error("Usage: node renderer/render.mjs <content-json> [output-dir]"); process.exit(2); }

const input = JSON.parse(await fs.readFile(inputPath, "utf8"));
const draft = input.content ?? input;
const brand = resolveBrandProfile(input.brandId);
const slides = draft.carousel?.slides;
if (!Array.isArray(slides) || slides.length < 5 || slides.length > 9) throw new Error("carousel.slides must contain 5–9 slides");
for (const [index, slide] of slides.entries()) {
  if (!slide || slide.number !== index + 1 || typeof slide.type !== "string" || typeof slide.headline !== "string" || typeof slide.body !== "string") throw new Error(`Invalid slide at index ${index}`);
}

const targets = [{ name:"instagram", width:1080, height:1350 }, { name:"tiktok", width:1080, height:1920 }];
const presets = new Set(["brand", "minimalist", "elegant", "bold", "editorial"]);
const fontMap = { classic:"Georgia, 'Times New Roman', serif", modern:"'Trebuchet MS', Arial, sans-serif", editorial:"'Times New Roman', Georgia, serif", rounded:"'Arial Rounded MT Bold', Arial, sans-serif", sans:"Arial, Helvetica, sans-serif" };
const defaults = { preset:"brand", colors:{ background:"#fffaf0", primary:"#9e1b13", accent:"#c69a3d", text:"#1b1612" }, fonts:{ heading:"classic", body:"sans" }, logo:{ url:null, position:"top-right", size:"medium" }, slides:{} };

function escapeHtml(value) { return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function conciseTitle(value, maxLength = 44, fallback = "UMKM Naik Kelas") {
  const raw = String(value ?? "").trim();
  const firstClause = raw.split(/\s*[:|—–]\s*/, 1)[0]?.trim() ?? "";
  const candidate = firstClause || raw || fallback;
  if (candidate.length <= maxLength) return candidate;
  const shortened = candidate.slice(0, maxLength + 1).replace(/\s+\S*$/, "").trim();
  return `${shortened || candidate.slice(0, maxLength).trim()}…`;
}
function safeHex(value, fallback) { return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback; }
function safeAssetUrl(value) {
  if (typeof value !== "string") return null;
  try { const url = new URL(value); return url.protocol === "https:" && url.hostname === "media.umkmnaikkelas.id" ? url.toString() : null; } catch { return null; }
}
function normalizeDesign(raw) {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const colors = value.colors && typeof value.colors === "object" ? value.colors : {};
  const fonts = value.fonts && typeof value.fonts === "object" ? value.fonts : {};
  const logo = value.logo && typeof value.logo === "object" ? value.logo : {};
  const slideValues = value.slides && typeof value.slides === "object" && !Array.isArray(value.slides) ? value.slides : {};
  const normalizedSlides = {};
  for (let number = 1; number <= slides.length; number += 1) {
    const candidate = slideValues[String(number)];
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    normalizedSlides[String(number)] = { imageUrl:safeAssetUrl(candidate.imageUrl), layout:candidate.layout === "background" ? "background" : "right" };
  }
  return {
    preset:presets.has(value.preset) ? value.preset : defaults.preset,
    colors:{ background:safeHex(colors.background, defaults.colors.background), primary:safeHex(colors.primary, defaults.colors.primary), accent:safeHex(colors.accent, defaults.colors.accent), text:safeHex(colors.text, defaults.colors.text) },
    fonts:{ heading:Object.hasOwn(fontMap, fonts.heading) ? fonts.heading : defaults.fonts.heading, body:Object.hasOwn(fontMap, fonts.body) ? fonts.body : defaults.fonts.body },
    logo:{ url:safeAssetUrl(logo.url), position:["top-left","top-right","bottom-left","bottom-right"].includes(logo.position) ? logo.position : defaults.logo.position, size:["small","medium","large"].includes(logo.size) ? logo.size : defaults.logo.size },
    slides:normalizedSlides
  };
}
async function loadOfficialLogoDataUrl(assetName, mimeType) {
  if (!assetName) return null;
  const bytes = await fs.readFile(new URL(`./assets/${assetName}`, import.meta.url));
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

const officialLogoUrl = await loadOfficialLogoDataUrl(brand.logoAsset, brand.logoMimeType);
const design = applyBrandIdentity(normalizeDesign(input.design), brand, officialLogoUrl);

function slideHtml(slide, index, total, target) {
  const rawRole = slide.type.toLowerCase();
  const role = rawRole === "cta" ? "cta" : rawRole === "cover" || rawRole === "hook" ? "cover" : "content-slide";
  const rawTitle = draft.carousel?.title ?? draft.title ?? brand.label;
  const title = escapeHtml(rawTitle);
  const shortTitle = escapeHtml(conciseTitle(rawTitle, 44, brand.label));
  const headline = escapeHtml(slide.headline);
  const body = escapeHtml(slide.body);
  const page = String(index + 1).padStart(2, "0");
  const totalLabel = String(total).padStart(2, "0");
  const slideDesign = design.slides[String(slide.number)] ?? { imageUrl:null, layout:"right" };
  const imageMarkup = slideDesign.imageUrl ? `<img class="slide-image ${slideDesign.layout}" src="${escapeHtml(slideDesign.imageUrl)}" alt="">` : "";
  const logoMarkup = design.logo.url ? `<img class="custom-logo logo-${design.logo.position} logo-${design.logo.size}" src="${escapeHtml(design.logo.url)}" alt="${escapeHtml(brand.logoAlt)}">` : `<span class="mark">${escapeHtml(brand.fallbackMark)}</span>`;
  const layoutClass = slideDesign.imageUrl ? `has-image image-${slideDesign.layout}` : "";
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><style>
    :root{--primary:${design.colors.primary};--accent:${design.colors.accent};--paper:${design.colors.background};--ink:${design.colors.text};--heading:${fontMap[design.fonts.heading]};--body:${fontMap[design.fonts.body]}}
    *{box-sizing:border-box}html,body{width:100%;height:100%;margin:0}body{background:var(--paper);color:var(--ink);font-family:var(--body)}
    .slide{width:${target.width}px;height:${target.height}px;position:relative;isolation:isolate;overflow:hidden;display:flex;flex-direction:column;padding:${target.name === "tiktok" ? 92 : 82}px ${target.name === "tiktok" ? 86 : 78}px;background:linear-gradient(150deg,var(--paper),color-mix(in srgb,var(--paper),var(--accent) 18%))}
    .slide::before{content:"";position:absolute;z-index:-2;inset:0;background:radial-gradient(circle at 90% 8%,color-mix(in srgb,var(--primary),transparent 84%),transparent 28%),radial-gradient(circle at 8% 96%,color-mix(in srgb,var(--accent),transparent 72%),transparent 32%)}
    .frame{position:absolute;z-index:3;inset:28px;border:2px solid color-mix(in srgb,var(--primary),transparent 82%);border-radius:24px;pointer-events:none}.top{position:relative;z-index:4;display:flex;justify-content:space-between;align-items:center;color:var(--primary);font-weight:800;letter-spacing:.16em;font-size:${target.name === "tiktok" ? 24 : 22}px;text-transform:uppercase}
    .mark{width:54px;height:54px;border-radius:50%;display:grid;place-items:center;color:var(--accent);background:var(--primary);border:2px solid var(--accent);font-family:Arial,sans-serif;font-size:17px;font-weight:900;letter-spacing:-.04em}.custom-logo{position:absolute;z-index:5;object-fit:contain;filter:drop-shadow(0 4px 10px rgba(0,0,0,.1))}.logo-small{width:54px;height:54px}.logo-medium{width:76px;height:76px}.logo-large{width:102px;height:102px}.logo-top-right{top:0;right:0}.logo-top-left{top:0;left:0}.logo-bottom-right{right:0;bottom:${target.name === "tiktok" ? -168 : -116}px}.logo-bottom-left{left:0;bottom:${target.name === "tiktok" ? -168 : -116}px}
    .content{position:relative;z-index:2;margin:auto 0;max-width:100%}.eyebrow{color:var(--primary);font-size:${target.name === "tiktok" ? 28 : 26}px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;margin-bottom:26px}h1{margin:0;max-width:100%;color:var(--primary);font-family:var(--heading);font-size:${target.name === "tiktok" ? 82 : 72}px;line-height:1.04;letter-spacing:-.035em}p{margin:30px 0 0;max-width:94%;font-size:${target.name === "tiktok" ? 42 : 38}px;line-height:1.38;color:var(--ink)}.rule{width:118px;height:8px;margin-top:34px;background:var(--accent);border-radius:20px}
    .footer{position:relative;z-index:4;display:flex;justify-content:space-between;align-items:end;color:color-mix(in srgb,var(--ink),transparent 24%);font-size:${target.name === "tiktok" ? 24 : 22}px;font-weight:700}.footer strong{color:var(--primary)}.cover .content{margin-top:15%}.cover h1{font-size:${target.name === "tiktok" ? 96 : 88}px}.cover p{font-size:${target.name === "tiktok" ? 44 : 40}px}
    .slide-image{position:absolute;z-index:-1;object-fit:cover}.slide-image.right{right:6%;top:25%;width:35%;height:50%;border-radius:24px;box-shadow:0 18px 50px rgba(24,15,10,.18)}.image-right .content{max-width:58%}.image-right .content p{max-width:100%;font-size:${target.name === "tiktok" ? 38 : 34}px}.slide-image.background{inset:0;width:100%;height:100%}.image-background::after{content:"";position:absolute;z-index:0;inset:0;background:linear-gradient(90deg,color-mix(in srgb,var(--paper),transparent 3%) 5%,color-mix(in srgb,var(--paper),transparent 13%) 65%,color-mix(in srgb,var(--paper),transparent 58%))}
    .minimalist{background:var(--paper)}.minimalist::before{display:none}.minimalist .frame{border-radius:0;border-width:1px}.minimalist h1{letter-spacing:-.045em}.elegant .frame{inset:36px;border-color:color-mix(in srgb,var(--accent),transparent 50%)}.elegant .rule{height:3px}.elegant h1{font-weight:500}.bold{background:var(--paper)}.bold::before{background:linear-gradient(125deg,transparent 0 70%,color-mix(in srgb,var(--accent),transparent 8%) 70%)}.bold h1{text-transform:uppercase;line-height:.96}.bold .frame{border-width:5px;border-radius:10px}.editorial .frame{border-radius:0}.editorial .eyebrow{border-bottom:2px solid var(--accent);padding-bottom:18px}.editorial h1{font-weight:500}
    .cta{background:var(--primary);color:var(--paper)}.cta::before{opacity:.2;filter:grayscale(1) brightness(2)}.cta .top,.cta h1,.cta p,.cta .footer{color:var(--paper)}.cta .eyebrow,.cta .footer strong{color:var(--accent)}.cta .rule{background:var(--accent)}.cta .mark{background:var(--accent);color:var(--primary);border-color:var(--paper)}
  </style></head><body><main class="slide ${design.preset} ${role} ${layoutClass}">${imageMarkup}<div class="frame"></div><header class="top"><span>${escapeHtml(brand.label)}</span>${logoMarkup}</header><section class="content"><div class="eyebrow">${rawRole === "hook" ? escapeHtml(brand.hookEyebrow) : shortTitle}</div><h1>${headline}</h1><p>${body}</p><div class="rule"></div></section><footer class="footer"><span>${shortTitle}</span><span><strong>${page}</strong> / ${totalLabel}</span></footer></main></body></html>`;
}

await fs.rm(outputDir, { recursive:true, force:true });
await fs.mkdir(outputDir, { recursive:true });
const browser = await chromium.launch({ headless:true });
try {
  for (const target of targets) {
    const targetDir = path.join(outputDir, target.name);
    await fs.mkdir(targetDir, { recursive:true });
    const page = await browser.newPage({ viewport:{ width:target.width, height:target.height }, deviceScaleFactor:1 });
    for (const [index, slide] of slides.entries()) {
      await page.setContent(slideHtml(slide, index, slides.length, target), { waitUntil:"load" });
      await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete), { timeout:10000 }).catch(() => undefined);
      const safeType = slide.type.toLowerCase().replace(/[^a-z0-9-]/g, "-");
      await page.screenshot({ path:path.join(targetDir, `${String(index + 1).padStart(2, "0")}-${safeType}.png`), type:"png" });
    }
    await page.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ ok:true, outputDir, slides:slides.length, targets:targets.map((target) => target.name), preset:design.preset, brand:brand.id }));
