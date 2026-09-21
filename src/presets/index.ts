import type { Preset } from './types.ts';
import generic from './generic.ts';
import ma from './ma.ts';
import fr from './fr.ts';

/** Seeding order. Generic first, then countries. */
export const PRESETS: readonly Preset[] = [generic, ma, fr];
