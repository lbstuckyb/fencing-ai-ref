import { describe, expect, it } from 'vitest';
import {
  allowedSignals,
  CORE_SIGNALS,
  exclusionReason,
  FIE_RULES_INDEX,
  isSignalAllowed,
  RULE_DOCUMENTS,
  RULE_DOCUMENTS_EDITION,
  signalLabel,
  WEAPON_RULES,
  type CoreSignalId,
  type Weapon,
} from './rules';

const CORE_IDS = CORE_SIGNALS.map((signal) => signal.id);

describe('rule documents', () => {
  it('lists the technical, organisation and material books', () => {
    expect(RULE_DOCUMENTS.map((doc) => doc.id)).toEqual(['technical', 'organisation', 'material']);
  });

  it('serves every link over https', () => {
    for (const doc of [FIE_RULES_INDEX, ...RULE_DOCUMENTS]) {
      expect(doc.url.startsWith('https://')).toBe(true);
    }
  });

  it('keeps the index link edition-agnostic and the deep links dated', () => {
    // The index must not name an edition, or it rots like the PDFs do.
    expect(FIE_RULES_INDEX.url).not.toMatch(/\d{4}/);
    for (const doc of RULE_DOCUMENTS) {
      expect(decodeURIComponent(doc.url)).toContain(RULE_DOCUMENTS_EDITION);
    }
  });
});

describe('core signals', () => {
  it('covers exactly the ten signals in scope', () => {
    expect(CORE_IDS).toHaveLength(10);
    expect(new Set(CORE_IDS).size).toBe(10);
  });

  it('labels every id', () => {
    for (const signal of CORE_SIGNALS) {
      expect(signalLabel(signal.id)).toBe(signal.label);
    }
  });
});

describe('weapon rules', () => {
  it('covers all three weapons', () => {
    expect(WEAPON_RULES.map((weapon) => weapon.id)).toEqual(['epee', 'foil', 'sabre']);
  });

  it('gives a reason for every excluded call, and excludes only real signals', () => {
    for (const weapon of WEAPON_RULES) {
      for (const [id, reason] of Object.entries(weapon.excluded)) {
        expect(CORE_IDS).toContain(id as CoreSignalId);
        expect(reason?.length ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it('derives the allowed palette as the core set minus the exclusions', () => {
    for (const weapon of WEAPON_RULES) {
      const allowed = allowedSignals(weapon.id);
      const excluded = Object.keys(weapon.excluded);
      expect(allowed).toHaveLength(CORE_IDS.length - excluded.length);
      for (const id of allowed) {
        expect(excluded).not.toContain(id);
        expect(isSignalAllowed(weapon.id, id)).toBe(true);
      }
    }
  });

  it('offers épée no priority calls and no invalid hit', () => {
    const allowed = allowedSignals('epee');
    for (const id of ['attack', 'parry', 'point_in_line', 'simultaneous', 'not_valid'] as const) {
      expect(allowed).not.toContain(id);
      expect(exclusionReason('epee', id)).toBeTruthy();
    }
    // What is left is the outcome set: halt plus who scored.
    expect(allowed).toEqual(['halt', 'hit_scored', 'hit_against', 'double_hit', 'nothing']);
  });

  it('gives foil the full priority set plus the invalid hit', () => {
    const allowed = allowedSignals('foil');
    for (const id of ['attack', 'parry', 'point_in_line', 'simultaneous', 'not_valid'] as const) {
      expect(allowed).toContain(id);
    }
    // Priority always resolves both lights, so a hit for each cannot happen.
    expect(allowed).not.toContain('double_hit');
  });

  it('gives sabre priority but neither an invalid hit nor a hit for each', () => {
    const allowed = allowedSignals('sabre');
    for (const id of ['attack', 'parry', 'point_in_line', 'simultaneous'] as const) {
      expect(allowed).toContain(id);
    }
    expect(allowed).not.toContain('not_valid');
    expect(allowed).not.toContain('double_hit');
  });

  it('flags off-target only where the weapon has one', () => {
    for (const weapon of WEAPON_RULES) {
      expect(isSignalAllowed(weapon.id, 'not_valid')).toBe(weapon.hasOffTarget);
    }
  });

  it('ties the priority calls to right of way', () => {
    const priority: readonly CoreSignalId[] = ['attack', 'parry', 'point_in_line', 'simultaneous'];
    for (const weapon of WEAPON_RULES) {
      for (const id of priority) {
        expect(isSignalAllowed(weapon.id, id)).toBe(weapon.rightOfWay);
      }
    }
  });

  it('leaves halt and the scoring calls available to every weapon', () => {
    const universal: readonly CoreSignalId[] = ['halt', 'hit_scored', 'hit_against', 'nothing'];
    for (const weapon of WEAPON_RULES) {
      for (const id of universal) {
        expect(allowedSignals(weapon.id)).toContain(id);
      }
    }
  });

  it('returns no reason for a call the weapon does allow', () => {
    const weapons: readonly Weapon[] = ['epee', 'foil', 'sabre'];
    for (const weapon of weapons) {
      expect(exclusionReason(weapon, 'halt')).toBeUndefined();
    }
  });
});
