import { describe, expect, it } from 'vitest';
import { checkContrast, checkSource, PAIRS } from '../scripts/design-check.mjs';

// The design system's rules, enforced. Details and fixes: scripts/design-check.mjs and DESIGN.md.
describe('design system', () => {
  it(`every allowed colour pairing meets WCAG AA (${PAIRS.length} pairs)`, () => {
    expect(checkContrast()).toEqual([]);
  });

  it('app code uses tokens: no raw colours, off-scale type, raw corners or light field borders', () => {
    expect(checkSource()).toEqual([]);
  });
});
