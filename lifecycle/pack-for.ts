import { PACKS, type Language, type LifecyclePack } from './lang/pack.ts';
import { textOf } from './map.ts';
import type { Row, Store } from './store.ts';

/**
 * The pack a stored record's messages are in. Kept apart from the guards and the numbering, which use it, so
 * that the email route, which only needs the words, does not bundle their rules.
 */

/** The pack of an issuer's profile language: a ledger row has no language of its own. */
export async function packForIssuer(store: Store, issuerId: unknown): Promise<LifecyclePack> {
  const issuer = typeof issuerId === 'string' && issuerId !== '' ? await store.get('billingIssuers', issuerId) : null;
  const profileId = issuer?.profileId;
  const profile = typeof profileId === 'string' && profileId !== '' ? await store.get('billingProfiles', profileId) : null;
  return PACKS[profile?.language as Language] ?? PACKS.EN;
}

/** Messages are in the document's language, else its issuer's profile's. */
export async function packForDocument(store: Store, document: Row): Promise<LifecyclePack> {
  return PACKS[textOf(document.language) as Language] ?? packForIssuer(store, document.issuerId);
}
