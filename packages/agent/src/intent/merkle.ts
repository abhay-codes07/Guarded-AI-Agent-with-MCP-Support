import { createHash } from 'node:crypto';

const h = (s: string) => createHash('sha256').update(s).digest('hex');

/** Hash a leaf payload (domain-separated from internal nodes). */
export function leafHash(payload: string): string {
  return h(`leaf:${payload}`);
}

function nodeHash(a: string, b: string): string {
  // Sorted-pair hashing: order-independent, so inclusion proofs need only sibling hashes.
  const [x, y] = a <= b ? [a, b] : [b, a];
  return h(`node:${x}${y}`);
}

export interface MerkleTree {
  root: string;
  leaves: string[];
}

export function buildMerkleTree(leaves: string[]): MerkleTree {
  if (leaves.length === 0) return { root: leafHash('empty'), leaves: [] };
  let level = [...leaves];
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = level[i + 1] ?? left; // duplicate last on odd count
      next.push(nodeHash(left, right));
    }
    level = next;
  }
  return { root: level[0]!, leaves };
}

/** Sibling hashes from a leaf up to the root. */
export function merkleProof(leaves: string[], index: number): string[] {
  const proof: string[] = [];
  let idx = index;
  let level = [...leaves];
  while (level.length > 1) {
    const isRight = idx % 2 === 1;
    const siblingIdx = isRight ? idx - 1 : idx + 1;
    proof.push(level[siblingIdx] ?? level[idx]!);
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = level[i + 1] ?? left;
      next.push(nodeHash(left, right));
    }
    level = next;
    idx = Math.floor(idx / 2);
  }
  return proof;
}

export function verifyMerkleProof(leaf: string, proof: string[], root: string): boolean {
  let acc = leaf;
  for (const sib of proof) acc = nodeHash(acc, sib);
  return acc === root;
}
