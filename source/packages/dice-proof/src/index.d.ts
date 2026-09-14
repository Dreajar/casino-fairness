export const DICE_PROOF_SCHEMA_VERSION: 1;
export const DICE_PROOF_PROTOCOL_VERSION: "replicate-dice-nitro-v1";
export const DICE_PROOF_GAME_ID: "dice";
export const DICE_PROOF_TICKET_TTL_MS: number;
export const DICE_MULTIPLIER_SCALE: bigint;
export const DICE_HOUSE_RETURN_BASIS_POINTS: bigint;

export type DiceDirection = "over" | "under";

export interface DiceTicketBinding {
  readonly protocolVersion: string;
  readonly releaseId: string;
  readonly gameId: "dice";
  readonly ticketId: string;
  readonly serverSeedHash: string;
  readonly publicKeySha256: string;
  readonly sessionId: string;
  readonly sequence: number;
  readonly expiresAt: number;
}

export interface DicePlayInput {
  readonly requestId: string;
  readonly clientSeed: string;
  readonly direction: DiceDirection;
  readonly targetBasisPoints: number;
  readonly wagerAtoms: string;
}

export interface DiceReceipt extends DiceTicketBinding, DicePlayInput {
  readonly schemaVersion: 1;
  readonly rollBasisPoints: number;
  readonly won: boolean;
  readonly multiplierMicros: string;
  readonly payoutAtoms: string;
  readonly issuedAt: number;
}

export interface DiceProofBundle {
  readonly schemaVersion: 1;
  readonly verifierVersion: string;
  readonly releaseManifest: Readonly<Record<string, unknown>>;
  readonly ticketBinding: DiceTicketBinding;
  readonly publicKeySpkiB64: string;
  readonly attestationB64: string;
  readonly receipt: DiceReceipt;
  readonly receiptSignatureB64: string;
  readonly serverSeed: string;
  readonly challengeB64: string;
  readonly mockPolicy?: {
    readonly rootCertPem: string;
    readonly expectedPcrs: Readonly<Record<string, string>>;
  };
}

export function canonicalJson(value: unknown): string;
export function bytesToHex(input: Uint8Array | ArrayBuffer): string;
export function hexToBytes(value: string, expectedBytes?: number): Uint8Array;
export function bytesToBase64(input: Uint8Array | ArrayBuffer): string;
export function base64ToBytes(value: string): Uint8Array;
export function randomHex(bytes: number): string;
export function sha256Bytes(value: string | Uint8Array): Promise<Uint8Array>;
export function sha256Hex(value: string | Uint8Array): Promise<string>;
export function ticketBindingHashHex(binding: DiceTicketBinding): Promise<string>;
export function publicKeyHashHex(spki: Uint8Array): Promise<string>;
export function releaseIdForManifest(manifest: Readonly<Record<string, unknown>>): Promise<string>;
export function validateReleaseManifestIdentity(manifest: Readonly<Record<string, unknown>>): Promise<boolean>;
export function validateTicketBinding<T extends DiceTicketBinding>(binding: T): T;
export function validatePlayInput<T extends DicePlayInput>(input: T): T;
export function diceMultiplierMicros(direction: DiceDirection, targetBasisPoints: number): bigint;
export function dicePayoutAtoms(wagerAtoms: string | bigint, multiplierMicros: string | bigint, won: boolean): bigint;
export function diceWins(direction: DiceDirection, targetBasisPoints: number, rollBasisPoints: number): boolean;
export function diceRollBasisPoints(serverSeedHex: string, context: DiceTicketBinding & DicePlayInput): Promise<number>;
export function resolveDice(
  serverSeedHex: string,
  binding: DiceTicketBinding,
  playInput: DicePlayInput
): Promise<{
  readonly rollBasisPoints: number;
  readonly won: boolean;
  readonly multiplierMicros: string;
  readonly payoutAtoms: string;
}>;
export function validateReceipt<T extends DiceReceipt>(receipt: T): T;
export function receiptHashHex(receipt: DiceReceipt): Promise<string>;
export function generateP256SigningKey(): Promise<CryptoKeyPair>;
export function exportP256PublicKey(publicKey: CryptoKey): Promise<Uint8Array>;
export function signReceipt(receipt: DiceReceipt, privateKey: CryptoKey): Promise<string>;
export function verifyReceiptSignature(
  receipt: DiceReceipt,
  signatureB64: string,
  publicKeySpkiB64: string
): Promise<boolean>;
export function verifyDiceResult(input: {
  readonly binding: DiceTicketBinding;
  readonly receipt: DiceReceipt;
  readonly receiptSignatureB64: string;
  readonly publicKeySpkiB64: string;
  readonly serverSeed: string;
  readonly expectedPlayInput?: DicePlayInput;
}): Promise<{
  readonly ok: boolean;
  readonly checks: Readonly<Record<string, boolean>>;
  readonly reasons: readonly string[];
}>;
