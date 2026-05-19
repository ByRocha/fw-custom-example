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
// TunerStudio reads .ini as Windows-1252. The source .ini produced by
// ConfigDefinition can be UTF-8 (multi-byte accents), so we decode as UTF-8
// first, normalize punctuation that isn't in cp1252, and re-encode every
// char to its single-byte cp1252 representation on write.
const inputBytes = fs.readFileSync(inPath);
const decodeCp1252 = (buf) => {
  const cp1252 = {0x80:0x20ac,0x82:0x201a,0x83:0x0192,0x84:0x201e,0x85:0x2026,0x86:0x2020,0x87:0x2021,0x88:0x02c6,0x89:0x2030,0x8a:0x0160,0x8b:0x2039,0x8c:0x0152,0x8e:0x017d,0x91:0x2018,0x92:0x2019,0x93:0x201c,0x94:0x201d,0x95:0x2022,0x96:0x2013,0x97:0x2014,0x98:0x02dc,0x99:0x2122,0x9a:0x0161,0x9b:0x203a,0x9c:0x0153,0x9e:0x017e,0x9f:0x0178};
  let s = "";
  for (const b of buf) s += String.fromCodePoint(cp1252[b] || b);
  return s;
};
const raw = (() => {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(inputBytes); }
  catch { return decodeCp1252(inputBytes); }
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
const toCp1252Bytes = (s) => {
  const cleaned = normalize(s);
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

let out = raw.replace(/"([^"\n]+)"/g, (full, content) => {
  const tr = map.get(norm(content));
  return tr ? '"' + tr.replace(/"/g, "'") + '"' : full;
});

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


fs.writeFileSync(outPath, toCp1252Bytes(out));
console.log("Translated", inPath, "->", outPath, "(" + map.size + " strings mapped, cp1252)");
