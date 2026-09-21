import type { Preset } from './types.ts';
import generic from './generic.ts';
import ma from './ma.ts';
import fr from './fr.ts';
import gb from './gb.ts';
import us from './us.ts';
import ca from './ca.ts';

/** Seeding order. Generic first, then countries. */
export const PRESETS: readonly Preset[] = [generic, ma, fr, gb, us, ca];
