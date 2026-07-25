import * as secp from '@noble/secp256k1';
import { bytesToHex, hexToBytes, keccak256, toHex } from 'viem';

export type MetaAddress = { spendingPublicKey: string; viewingPublicKey: string };
const strip = (value: string) => value.startsWith('0x') ? value.slice(2) : value;
const asHex = (value: string) => `0x${strip(value)}` as `0x${string}`;
const pointHex = (point: secp.ProjectivePoint) => bytesToHex(point.toRawBytes(false));
const hashScalar = (bytes: Uint8Array) => BigInt(keccak256(bytes)) % secp.CURVE.n;

export function createKeys() {
  const spendingPrivateKey = secp.utils.randomPrivateKey();
  const viewingPrivateKey = secp.utils.randomPrivateKey();
  return { spendingPrivateKey: bytesToHex(spendingPrivateKey), viewingPrivateKey: bytesToHex(viewingPrivateKey), metaAddress: formatMetaAddress({ spendingPublicKey: bytesToHex(secp.getPublicKey(spendingPrivateKey, false)), viewingPublicKey: bytesToHex(secp.getPublicKey(viewingPrivateKey, false)) }) };
}
export function formatMetaAddress(meta: MetaAddress) { return `st:monad:${meta.spendingPublicKey}:${meta.viewingPublicKey}`; }
export function parseMetaAddress(value: string): MetaAddress | null {
  const parts = value.trim().split(':');
  if (parts.length !== 4 || parts[0] !== 'st' || parts[1] !== 'monad' || !/^0x04[0-9a-fA-F]{128}$/.test(parts[2]) || !/^0x04[0-9a-fA-F]{128}$/.test(parts[3])) return null;
  return { spendingPublicKey: parts[2], viewingPublicKey: parts[3] };
}
export function makeStealthPayment(meta: MetaAddress) {
  const ephemeralPrivateKey = secp.utils.randomPrivateKey();
  const shared = secp.getSharedSecret(ephemeralPrivateKey, hexToBytes(asHex(meta.viewingPublicKey)), false);
  const recipient = secp.ProjectivePoint.fromHex(strip(meta.spendingPublicKey)).add(secp.ProjectivePoint.BASE.multiply(hashScalar(shared)));
  return { stealthAddress: `0x${keccak256(hexToBytes(pointHex(recipient))).slice(-40)}` as `0x${string}`, ephemeralPubKey: bytesToHex(secp.getPublicKey(ephemeralPrivateKey, false)) };
}
export function matchesAnnouncement(spendingPublicKey: string, viewingPrivateKey: string, ephemeralPubKey: string, announcedAddress: string) {
  const shared = secp.getSharedSecret(hexToBytes(asHex(viewingPrivateKey)), hexToBytes(asHex(ephemeralPubKey)), false);
  const recipient = secp.ProjectivePoint.fromHex(strip(spendingPublicKey)).add(secp.ProjectivePoint.BASE.multiply(hashScalar(shared)));
  return (`0x${keccak256(hexToBytes(pointHex(recipient))).slice(-40)}`).toLowerCase() === announcedAddress.toLowerCase();
}
export function keyToHex(key: Uint8Array) { return toHex(key); }
export function publicKeyFromPrivate(privateKey: string) { return bytesToHex(secp.getPublicKey(hexToBytes(asHex(privateKey)), false)); }
