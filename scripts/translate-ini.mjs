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
const raw = fs.readFileSync(inPath, "utf8");
const data = JSON.parse(fs.readFileSync(mapPath, "utf8"));
const map = new Map();
const norm = (s) => String(s).replace(/\s+/g, " ").trim();
const sanitize = (s) => String(s)
  .replace(/[\u2018\u2019\u2032]/g, "'")
  .replace(/[\u201C\u201D\u2033]/g, '"')
  .replace(/[\u2013\u2014]/g, "-")
  .replace(/\u2026/g, "...")
  .replace(/\u00A0/g, " ");
const toCp1252 = (s) => sanitize(s);
const toCp1252Bytes = (s) => {
  const cleaned = sanitize(s);
  const buf = Buffer.alloc(cleaned.length);
  for (let i = 0; i < cleaned.length; i++) {
    const cc = cleaned.charCodeAt(i);
    buf[i] = cc <= 0xFF ? cc : 0x3F; // '?' for anything outside cp1252
  }
  return buf;
};
for (const e of data.entries || []) {
  if (e && e.en && e.pt && String(e.pt).trim()) {
    map.set(norm(e.en), toCp1252(e.pt));
  }
}

// Fold rusEFI \<newline> continuations so multi-line help strings become a
// single quoted token that our regex below can match (otherwise the EN text
// for SettingContextHelp entries leaks through untranslated).
const folded = raw.replace(/\\\r?\n[ \t]*/g, " ");

// Match BOTH multi-line full-line help entries AND inline strings.
let out = folded.replace(
  /^([ \t]*[A-Za-z_]\w*[ \t]*=[ \t]*)"(.*)"([ \t]*(?:;.*)?)$/gm,
  (full, pre, content, post) => {
    const tr = map.get(norm(content));
    return tr ? pre + '"' + String(tr).replace(/"/g, "'") + '"' + post : full;
  },
);
out = out.replace(/"([^"\n]+)"/g, (full, content) => {
  const tr = map.get(norm(content));
  return tr ? '"' + String(tr).replace(/"/g, "'") + '"' : full;
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
