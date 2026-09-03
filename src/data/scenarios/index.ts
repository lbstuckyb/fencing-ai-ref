import type { Weapon } from '../rules';
import { EPEE_001 } from './epee-001';
import { FOIL_001 } from './foil-001';
import { SABRE_001 } from './sabre-001';
import type { Scenario } from '../../scenario/schema';

/**
 * The scenario bank. Three stub clips today, one per weapon — real footage
 * drops in later without changing this shape, per the plan's decision to keep
 * video as placeholder/local clips and not let a rights question block the
 * build.
 */
export const SCENARIOS: readonly Scenario[] = [FOIL_001, EPEE_001, SABRE_001];

export function scenariosFor(weapon: Weapon): readonly Scenario[] {
  return SCENARIOS.filter((scenario) => scenario.weapon === weapon);
}

export function scenarioById(id: string): Scenario | undefined {
  return SCENARIOS.find((scenario) => scenario.id === id);
}
