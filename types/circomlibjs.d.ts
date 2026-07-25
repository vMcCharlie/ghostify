declare module 'circomlibjs' {
  export function buildMimc7(): Promise<{ F: { toString(value: unknown): string }; hash(left: bigint, right: bigint): unknown }>;
}
