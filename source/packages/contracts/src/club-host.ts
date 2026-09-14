import { normalizeSlug, validateSlug } from "./identifiers.ts";

function normalizedHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

/** Generated Amplify domains have no wildcard club DNS or certificates. */
export function usesClubPathRouting(siteOrigin: string | null | undefined): boolean {
  if (!siteOrigin) return false;
  try { return normalizedHostname(new URL(siteOrigin).hostname).endsWith(".amplifyapp.com"); }
  catch { return false; }
}

/**
 * Returns the DNS-safe club slug when `hostname` is exactly one label below the
 * configured site origin. The root site and unrelated/ nested hosts are not
 * club tenants.
 */
export function clubSlugForHostname(hostname: string, siteOrigin: string | null | undefined): string | undefined {
  if (!siteOrigin || usesClubPathRouting(siteOrigin)) return undefined;
  let rootHostname: string;
  try {
    rootHostname = normalizedHostname(new URL(siteOrigin).hostname);
  } catch {
    return undefined;
  }
  const candidateHostname = normalizedHostname(hostname);
  const suffix = `.${rootHostname}`;
  if (!candidateHostname.endsWith(suffix)) return undefined;
  const slug = candidateHostname.slice(0, -suffix.length);
  if (!slug || slug.includes(".") || validateSlug(slug)) return undefined;
  return normalizeSlug(slug);
}

/** Builds an absolute club URL while retaining the root origin's protocol and port. */
export function clubUrlForSlug(siteOrigin: string, rawSlug: string, path = "/"): string {
  const slug = normalizeSlug(rawSlug);
  if (validateSlug(slug)) throw new Error("Invalid club slug");
  const root = new URL(siteOrigin);
  const url = new URL(path.startsWith("/") ? path : `/${path}`, root);
  url.protocol = root.protocol;
  url.host = root.host;
  if (usesClubPathRouting(siteOrigin)) {
    url.pathname = `/${slug}${url.pathname === "/" ? "" : url.pathname}`;
  } else {
    url.hostname = `${slug}.${url.hostname}`;
  }
  return url.toString();
}

/** Builds a URL on the platform's root origin. */
export function siteUrl(siteOrigin: string, path = "/"): string {
  const root = new URL(siteOrigin);
  const url = new URL(path.startsWith("/") ? path : `/${path}`, root);
  url.protocol = root.protocol;
  url.host = root.host;
  return url.toString();
}
