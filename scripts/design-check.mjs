#!/usr/bin/env node
/**
 * Design guardrail for the "Front desk" system.
 *
 * 1. Contrast: every text/surface pairing the app is allowed to use is checked
 *    against WCAG AA using the real values in app/globals.css. Change a token and
 *    break a pairing, and this fails.
 * 2. Source rules: scans app/ for the patterns that let drift in before — raw
 *    colours, off-scale type, raw corner sizes, light field borders, bare
 *    marigold text, faint text on linen-2, panels without their edge, icon
 *    strokes other than 1.5.
 *
 * Plain Node, no dependencies: `node scripts/design-check.mjs`. Also runs in `npm test`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

// ---------------------------------------------------------------- tokens

export function readTokens(css = readFileSync(join(ROOT, 'app/globals.css'), 'utf8')) {
  const theme = /@theme\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  const tokens = {};
  for (const [, name, value] of theme.matchAll(/--color-([a-z0-9-]+):\s*([^;]+);/g)) tokens[name] = value.trim();
  return tokens;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function luminance([r, g, b]) {
  const c = [r, g, b].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
/** Blend `fg` at `alpha` over `bg` (both rgb arrays). */
function over(fg, bg, alpha) {
  return fg.map((v, i) => Math.round(v * alpha + bg[i] * (1 - alpha)));
}
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/**
 * Every pairing the app uses. "name/NN" means that token at NN% opacity over the
 * surface (for text) or over paper (for a surface). min: 4.5 text, 3 large text
 * (24px+, or 19px+ bold), UI boundaries and focus rings.
 */
const TEXT = ['ink', 'ink-2', 'muted', 'faint'];
const QUIET_SURFACES = ['sand', 'paper', 'linen', 'linen/60', 'teal-soft'];
export const PAIRS = [
  ...TEXT.flatMap((t) => QUIET_SURFACES.map((s) => [t, s, 4.5])),
  ...['ink', 'ink-2', 'muted'].map((t) => [t, 'linen-2', 4.5]),
  ...['sand', 'paper', 'linen', 'teal-soft'].map((s) => ['teal', s, 4.5]),
  ['teal-strong', 'teal-soft', 4.5],
  ['marigold-ink', 'marigold-soft', 4.5],
  ['marigold-ink', 'marigold-wash', 4.5],
  ['marigold-ink', 'paper', 4.5],
  ['ink', 'marigold', 4.5],
  ['ink', 'marigold-soft', 4.5],
  ['rust', 'paper', 4.5],
  ['rust', 'rust-soft', 4.5],
  ['sand', 'ink', 4.5],
  ['sand', 'ink-2', 4.5],
  ['sand', 'teal', 4.5],
  ['sand/85', 'teal', 4.5],
  ['paper', 'teal', 4.5],
  ['paper', 'teal-strong', 4.5],
  ['paper', 'ink', 4.5],
  // Boundaries: field borders and the focus ring.
  ['field', 'paper', 3],
  ['field', 'sand', 3],
  ['teal', 'paper', 3],
  ['teal', 'sand', 3],
];

function resolve(spec, tokens, under) {
  const [name, pct] = spec.split('/');
  const value = tokens[name];
  if (!value || !value.startsWith('#')) throw new Error(`Unknown or non-hex colour token "${name}"`);
  const rgb = hexToRgb(value);
  return pct ? over(rgb, under, Number(pct) / 100) : rgb;
}

export function checkContrast(tokens = readTokens()) {
  const problems = [];
  const paper = hexToRgb(tokens.paper ?? '#ffffff');
  for (const [fg, bg, min] of PAIRS) {
    try {
      const surface = resolve(bg, tokens, paper);
      const text = resolve(fg, tokens, surface);
      const ratio = contrast(text, surface);
      if (ratio < min) problems.push(`contrast: ${fg} on ${bg} is ${ratio.toFixed(2)}:1, needs ${min}:1`);
    } catch (e) {
      problems.push(`contrast: ${e.message}`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------- source rules

const DISPLAY_SIZES = 'text-money · text-title · text-heading · text-section · text-lead';
export const RULES = [
  {
    id: 'raw-colour',
    test: (l) => /#[0-9a-fA-F]{3,8}\b(?!\})|\brgba?\(/.test(l.replace(/#\{[^}]*\}/g, '')),
    why: 'Use a colour token (text-ink, bg-linen, var(--color-teal)…), not a raw hex or rgb().',
  },
  {
    id: 'off-scale-type',
    test: (l) => /\btext-(lg|xl|[2-9]xl)\b/.test(l) || [...l.matchAll(/\btext-\[(\d+)px\]/g)].some((m) => !['13', '15'].includes(m[1])),
    why: `Sizes come from the scale: text-xs/[13px]/sm/[15px]/base for text, ${DISPLAY_SIZES} for display.`,
  },
  {
    id: 'raw-tracking',
    test: (l) => /\btracking-/.test(l),
    why: 'Tracking is set by the display size tokens; don’t override it.',
  },
  {
    id: 'raw-radius',
    test: (l) =>
      /\brounded(-[trbl]{1,2})?-(sm|md|lg|xl|2xl|3xl)\b/.test(l) ||
      /\brounded(?=["'`\s])/.test(l) ||
      [...l.matchAll(/\brounded(?:-[trbl]{1,2})?-\[([^\]]+)\]/g)].some((m) => m[1] !== '30%'),
    why: 'Corners come from tokens: rounded-pay/panel/block/control/tooltip/tail/full (rounded-[30%] for business avatars).',
  },
  {
    id: 'weak-field-border',
    test: (l) =>
      /ring-line/.test(l) &&
      (/<(input|textarea|select)\b(?![^>]*type=["'](hidden|radio|checkbox)["'])/.test(l) || /const (field|input|select)\s*=/.test(l)),
    why: 'Fields use FIELD from ui.tsx (ring-field, 3.5:1). ring-line is too light to find a text box by.',
  },
  {
    id: 'bare-marigold-text',
    test: (l) => /\btext-marigold(?![-\w])/.test(l),
    why: 'Marigold is 2.6:1 on paper. Text goes in marigold-ink, or ink on a marigold fill.',
  },
  {
    id: 'faint-on-linen-2',
    test: (l) => /\btext-faint\b/.test(l) && /\bbg-linen-2\b/.test(l),
    why: 'Faint is 4.2:1 on linen-2. Use muted there.',
  },
  {
    id: 'panel-without-edge',
    test: (l) => /\brounded-(panel|pay)\b/.test(l) && /\bbg-paper\b/.test(l) && !/\bring-edge\b/.test(l) && !/\brounded-t-panel\b/.test(l),
    why: 'Paper panels get their 1px edge: ring-1 ring-edge ring-inset (or use <Panel>).',
  },
  {
    id: 'icon-stroke',
    test: (l) => /strokeWidth=\{?["']?([\d.]+)/.test(l) && !/strokeWidth=\{?["']?1\.5\b/.test(l),
    why: 'Icons are one stroke family at 1.5px.',
  },
];

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx|ts)$/.test(f) ? [p] : [];
  });
}

export function checkSource(files = walk(join(ROOT, 'app'))) {
  const problems = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');
    // Fields often spread their props over several lines, so read each whole element.
    for (const m of text.matchAll(/<(input|textarea|select)\b/g)) {
      const end = text.indexOf('/>', m.index);
      const close = text.indexOf(`</${m[1]}`, m.index);
      const stop = [end, close].filter((n) => n > -1).sort((a, b) => a - b)[0] ?? m.index + 800;
      const el = text.slice(m.index, stop);
      if (/type=["'](hidden|radio|checkbox)["']/.test(el) || el.includes('design-check-ignore')) continue;
      if (/\bring-line\b/.test(el) || (/\bring-1\b/.test(el) && !/\bring-field\b/.test(el) && !/\bFIELD\b|\{(field|input|select)\b/.test(el))) {
        const line = text.slice(0, m.index).split('\n').length;
        problems.push(`${relative(ROOT, file)}:${line} [weak-field-border] Fields use FIELD from ui.tsx (ring-field, 3.5:1).`);
      }
    }
    lines.forEach((line, i) => {
      // Comments describe the system; only code is checked.
      if (line.includes('design-check-ignore') || /^\s*(\/\/|\*|\/\*|\{\/\*)/.test(line)) return;
      for (const rule of RULES) {
        if (rule.test(line)) problems.push(`${relative(ROOT, file)}:${i + 1} [${rule.id}] ${rule.why}`);
      }
    });
  }
  return problems;
}

export function runChecks() {
  return [...checkContrast(), ...checkSource()];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const problems = runChecks();
  if (problems.length) {
    console.error(`Design check: ${problems.length} problem${problems.length === 1 ? '' : 's'}\n`);
    for (const p of problems) console.error(`  ${p}`);
    console.error('\nSee DESIGN.md. A line that must break a rule can carry a `design-check-ignore` comment with the reason.');
    process.exit(1);
  }
  console.log(`Design check: ${PAIRS.length} colour pairings pass, ${RULES.length} source rules clean.`);
}
