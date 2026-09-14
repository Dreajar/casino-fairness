/**
 * Club slugs and usernames are both public, user-chosen identifiers that sit in
 * URLs, so their rules live together and are shared by the server and browser.
 * The browser check is a courtesy that gives immediate feedback; only the
 * database's unique index actually decides, because two concurrent requests both
 * pass any check made before the write.
 */

/**
 * PuntClub application paths that are also meaningful below a club hostname.
 * Keeping them explicit makes additions auditable before new routes ship.
 */
export const PUNTCLUB_RESERVED_SLUGS = [
  "analytics",
  "earnings",
  "manage",
  "notifications",
  "owner",
  "promotions",
  "r",
  "rewards",
  "staff",
  "support",
  "vip"
] as const;

/**
 * Names that must never become a club slug. A slug is the left-most label in a
 * club hostname, and these names are retained for platform/system hosts and for
 * backwards-compatible path redirects.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "about",
  "account",
  "admin",
  "api",
  "assets",
  "auth",
  "billing",
  "blog",
  "cashier",
  "clubs",
  "contact",
  "dashboard",
  "docs",
  "embed",
  "faq",
  "games",
  "help",
  "home",
  "join",
  "legal",
  "lobby",
  "login",
  "logout",
  "me",
  "messages",
  "new",
  "payouts",
  "press",
  "privacy",
  "profile",
  "public",
  "responsible-gaming",
  "search",
  "settings",
  "signup",
  "static",
  "terms",
  "treasury",
  "verify",
  "welcome",
  "wins",
  ...PUNTCLUB_RESERVED_SLUGS
]);

/**
 * ASCII letters, digits and dash only, 3-17 characters. Deliberately not
 * Unicode: a slug is a DNS hostname label people read and retype, and non-Latin
 * lookalikes (Cyrillic `а`, full-width `ａ`) would let one club impersonate
 * another's address while looking identical.
 */
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,15}[a-z0-9])$/;
export const SLUG_MAX_LENGTH = 17;
export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,24}$/;

export type IdentifierProblem = "empty" | "format" | "reserved";

/**
 * The form a slug is stored and routed in. Callers must persist this rather than
 * the raw input: `Dream` and `dream` are one club, and storing the first would
 * make the unique index and the URL disagree.
 */
export function normalizeSlug(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Lowercase, 3-17 characters, no leading, trailing or meaningless doubled
 * dashes. Underscores are invalid because club slugs are DNS labels.
 */
export function validateSlug(raw: string): IdentifierProblem | undefined {
  const slug = normalizeSlug(raw);
  if (!slug) return "empty";
  // Reserved before format: short reserved names like `me` fail the length rule
  // too, and "reserved" is the reason a person can act on.
  if (RESERVED_SLUGS.has(slug)) return "reserved";
  // Reject runs of separators: `a--b` and `a-b` read as the same address to a
  // person, and two clubs must never be confusable.
  if (!SLUG_PATTERN.test(slug) || /--/.test(slug)) return "format";
  return undefined;
}

export function validateUsername(raw: string): IdentifierProblem | undefined {
  const username = raw.trim();
  if (!username) return "empty";
  // A username becomes a club name, which becomes something people navigate to.
  if (RESERVED_SLUGS.has(username.toLowerCase())) return "reserved";
  if (!USERNAME_PATTERN.test(username)) return "format";
  return undefined;
}

export function slugProblemMessage(problem: IdentifierProblem): string {
  if (problem === "empty") return "Enter a club address.";
  if (problem === "reserved") return "That address is reserved. Pick another.";
  return "Use 3-17 characters: lowercase a-z, 0-9, and single dashes.";
}

export function usernameProblemMessage(problem: IdentifierProblem): string {
  if (problem === "empty") return "Enter a username.";
  if (problem === "reserved") return "That username is reserved. Pick another.";
  return "Use 3-24 characters: letters, numbers and underscores.";
}

const SLUG_ADJECTIVES = [
  "amber",
  "bold",
  "brave",
  "calm",
  "cosmic",
  "daring",
  "dusk",
  "eager",
  "ember",
  "fabled",
  "fleet",
  "gold",
  "grand",
  "ivory",
  "jade",
  "keen",
  "lucky",
  "lunar",
  "noble",
  "opal",
  "polar",
  "quiet",
  "rapid",
  "royal",
  "sable",
  "solar",
  "swift",
  "tidal",
  "vivid",
  "wild"
] as const;

const SLUG_NOUNS = [
  "anchor",
  "aurora",
  "bison",
  "canyon",
  "comet",
  "coral",
  "crown",
  "delta",
  "ember",
  "falcon",
  "harbor",
  "heron",
  "lynx",
  "meteor",
  "orbit",
  "otter",
  "quartz",
  "raven",
  "reef",
  "ridge",
  "saloon",
  "summit",
  "tiger",
  "topaz",
  "vault",
  "vector",
  "willow",
  "zenith",
  "zephyr",
  "wharf"
] as const;

/**
 * A readable random slug for a club that has not chosen one. Random rather than
 * derived from the club's name, so nothing reads meaning into a default and a
 * later rename changes nothing.
 */
export function randomSlug(random: () => number = Math.random): string {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
  const suffix = String(Math.floor(random() * 900) + 100);
  const slug = `${pick(SLUG_ADJECTIVES)}-${pick(SLUG_NOUNS)}-${suffix}`;
  // Every word pair is short enough to fit; assert it rather than trust it, so
  // adding a longer word to the lists fails here instead of at the database.
  if (slug.length > SLUG_MAX_LENGTH) throw new Error(`Generated slug exceeds ${SLUG_MAX_LENGTH} characters: ${slug}`);
  return slug;
}
