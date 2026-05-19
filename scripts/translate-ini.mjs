#!/usr/bin/env node
// Post-build .ini translator. Replaces every quoted string that has a PT-BR mapping.
// Also re-applies menu/field overrides if present in the translations file.
// The .ini signature line is intentionally left alone — rusEFI regenerates it
// from SHORT_BOARD_NAME + ini hash during the build.
import fs from "node:fs";

const [, , inPath, mapPath, outPath] = process.argv;
if (!inPath || !mapPath || !outPath) {
  console.error("usage: translate-ini.mjs <in.ini> <translations.json> <out.ini>");
  process.exit(1);
}
// TunerStudio reads .ini as Windows-1252 (CP1252) single-byte text. The source
// .ini may arrive as UTF-8 (with or without BOM), ISO-8859-1, ASCII or CP1252,
// so we decode tolerantly and ALWAYS re-emit as CP1252 — that's the only way
// PT-BR accents render correctly regardless of the upstream encoding.
const inputBytes = fs.readFileSync(inPath);
const stripped = (inputBytes.length >= 3 && inputBytes[0] === 0xef && inputBytes[1] === 0xbb && inputBytes[2] === 0xbf)
  ? inputBytes.subarray(3)
  : inputBytes;
const decodeCp1252 = (buf) => {
  const cp1252 = {0x80:0x20ac,0x82:0x201a,0x83:0x0192,0x84:0x201e,0x85:0x2026,0x86:0x2020,0x87:0x2021,0x88:0x02c6,0x89:0x2030,0x8a:0x0160,0x8b:0x2039,0x8c:0x0152,0x8e:0x017d,0x91:0x2018,0x92:0x2019,0x93:0x201c,0x94:0x201d,0x95:0x2022,0x96:0x2013,0x97:0x2014,0x98:0x02dc,0x99:0x2122,0x9a:0x0161,0x9b:0x203a,0x9c:0x0153,0x9e:0x017e,0x9f:0x0178};
  let s = "";
  for (const b of buf) s += String.fromCodePoint(cp1252[b] || b);
  return s;
};
const raw = (() => {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(stripped).replace(/^\uFEFF/, ""); }
  catch { return decodeCp1252(stripped).replace(/^\uFEFF/, ""); }
})();
const data = JSON.parse(fs.readFileSync(mapPath, "utf8"));
const map = new Map();
const norm = (s) => String(s).replace(/\s+/g, " ").trim();
const normalize = (s) => String(s)
  .replace(/\u03bc/g, "µ")
  .replace(/\u03a9/g, "Ohm")
  .replace(/\u2212/g, "-")
  .replace(/\u00A0/g, " ");
const sanitize = (s) => normalize(s)
  .replace(/[\r\n\t]+/g, " ")
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
  .replace(/"/g, "'")
  .replace(/\s{2,}/g, " ")
  .trim();
const toCp1252 = (s) => sanitize(s);
const toIniBytes = (s) => {
  const cleaned = normalize(s).replace(/^\uFEFF/, "");
  const extra = {0x20ac:0x80,0x201a:0x82,0x0192:0x83,0x201e:0x84,0x2026:0x85,0x2020:0x86,0x2021:0x87,0x02c6:0x88,0x2030:0x89,0x0160:0x8a,0x2039:0x8b,0x0152:0x8c,0x017d:0x8e,0x2018:0x91,0x2019:0x92,0x201c:0x93,0x201d:0x94,0x2022:0x95,0x2013:0x96,0x2014:0x97,0x02dc:0x98,0x2122:0x99,0x0161:0x9a,0x203a:0x9b,0x0153:0x9c,0x017e:0x9e,0x0178:0x9f};
  const bytes = [];
  for (const ch of cleaned) {
    const cc = ch.codePointAt(0) || 0x3F;
    if (cc <= 0x7F || (cc >= 0xA0 && cc <= 0xFF)) bytes.push(cc);
    else bytes.push(extra[cc] || 0x3F);
  }
  return Buffer.from(bytes);
};
for (const e of data.entries || []) {
  if (e && e.en && e.pt && String(e.pt).trim()) {
    map.set(norm(e.en), toCp1252(e.pt));
  }
}

// Translate UI sections only. Rewriting strings inside protocol sections
// (e.g. [OutputChannels], [TunerStudio], [Constants]) can silently break the
// TS/ECU handshake and hide runtime warning popups, even when the substitution
// looks harmless. Skip those sections entirely.
const PROTOCOL_SECTIONS = new Set([
  "TunerStudio", "Constants", "OutputChannels", "PcVariables",
  "KeyCommands", "Tools", "SettingGroups", "ReferenceTables",
  "BurstMode", "Datalog", "LoggerDefinition", "AccelerometerLog",
  "VeAnalyze", "WueAnalyze", "EventTriggers", "ControllerCommands",
  "TableEditor", "CurveEditor",
]);
const translateBody = (body) => body.replace(/"([^"\n]+)"/g, (full, content) => {
  const tr = map.get(norm(content));
  return tr ? '"' + tr.replace(/"/g, "'") + '"' : full;
});
let out = "";
{
  const headerRe = /^[ \t]*\[([^\]]+)\][ \t]*$/gm;
  const parts = [];
  let lastSection = null;
  let lastStart = 0;
  let hm;
  while ((hm = headerRe.exec(raw)) !== null) {
    parts.push({ section: lastSection, start: lastStart, end: hm.index });
    lastSection = hm[1].trim();
    lastStart = headerRe.lastIndex;
  }
  parts.push({ section: lastSection, start: lastStart, end: raw.length });
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const body = raw.slice(p.start, p.end);
    out += PROTOCOL_SECTIONS.has(p.section || "") ? body : translateBody(body);
    if (i < parts.length - 1) out += "[" + parts[i + 1].section + "]";
  }
}

// Apply menu overrides (hide / rename subMenus)
const overrides = data.menuOverrides || [];
if (overrides.length) {
  const byId = new Map(overrides.map((o) => [o.id, o]));
  out = out.replace(/^\[MenuEditor\][^\[]*/m, (block) =>
    block.split(/\r?\n/).map((line) => {
      const m = line.match(/^(\s*)subMenu\s*=\s*([A-Za-z_][\w]*)\s*,\s*"([^"]+)"(.*)$/);
      if (!m) return line;
      const [, indent, id, oldLabel, tail] = m;
      const ov = byId.get(id);
      if (!ov) return line;
      const newLabel = toCp1252((ov.label || oldLabel)).replace(/"/g, "'");
      const rebuilt = indent + 'subMenu = ' + id + ', "' + newLabel + '"' + tail;
      return ov.hidden ? indent + '; [hidden] ' + rebuilt.trim() : rebuilt;
    }).join("\n"),
  );
}

// Apply field overrides (hide / rename "field = ..., varName" lines)
const fieldOverrides = data.fieldOverrides || [];
if (fieldOverrides.length) {
  const byVar = new Map();
  const byLabel = new Map();
  for (const o of fieldOverrides) {
    if (!o || !o.pattern) continue;
    if (o.matchType === "var") byVar.set(o.pattern, o);
    else byLabel.set(String(o.pattern).trim(), o);
  }
  out = out.replace(
    /^([ \t]*)(field\s*=\s*")([^"]+)("\s*,\s*)([A-Za-z_][\w]*)([^\n]*)$/gm,
    (full, indent, prefix, label, mid, varName, tail) => {
      const ov = byVar.get(varName) || byLabel.get(String(label).trim());
      if (!ov) return full;
      const newLabel = toCp1252(ov.label || label).replace(/"/g, "'");
      const rebuilt = indent + prefix + newLabel + mid + varName + tail;
      return ov.hidden ? indent + "; [hidden] " + rebuilt.trim() : rebuilt;
    },
  );
}

// NOTE: signature is intentionally NOT touched here — rusEFI's gen_signature.sh
// computes it from SHORT_BOARD_NAME + a hash of the .ini and embeds it during
// the build. Overriding it would break the TunerStudio handshake.


fs.writeFileSync(outPath, toIniBytes(out));
console.log("Re-encoded", inPath, "->", outPath, "(" + map.size + " strings mapped, cp1252)");
