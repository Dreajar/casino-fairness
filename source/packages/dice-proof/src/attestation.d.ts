import type { DiceTicketBinding } from "./index.mjs";

export interface DiceReleaseManifest {
  readonly schemaVersion: number;
  readonly mode: "aws" | "mock";
  readonly releaseId: string;
  readonly pcrs: Readonly<Record<string, string>>;
  readonly [key: string]: unknown;
}

export function verifyDiceTicketAttestation(input: {
  readonly attestationB64: string;
  readonly binding: DiceTicketBinding;
  readonly publicKeySpkiB64: string;
  readonly challengeB64: string;
  readonly releaseManifest: DiceReleaseManifest;
  readonly rootCertPem: string;
  readonly now?: number;
  readonly maximumAgeMs?: number;
}): Promise<{
  readonly ok: boolean;
  readonly trustedHardware: boolean;
  readonly checks: Readonly<Record<string, boolean>>;
  readonly reasons: readonly string[];
  readonly pcr0?: string;
  readonly timestamp?: number;
  readonly moduleId?: string;
  readonly chainSubjects: readonly string[];
}>;
