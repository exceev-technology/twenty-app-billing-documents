import type { Preset } from './types.ts';
import generic from './generic.ts';

/** Seeding order. Generic first, then countries. */
export const PRESETS: readonly Preset[] = [generic];
