import * as THREE from "three";
import { Tile } from "@/scenes/world/TileManager";
import type { TileMesh } from "@/scenes/world/TileMesh";

/**
 * Copies biomes from one polyhedra model to another by area-weighted sampling.
 * Works on plain tile geometry (unit-sphere triangles) so it is independent of rendering.
 */

export interface TileShape {
	center: THREE.Vector3;
	// 9 floats per triangle, vertices projected onto the unit sphere
	triangles: Float32Array;
	// Sum of the flat triangle areas, proportional to solid angle
	area: number;
}

export interface BiomeTileShape extends TileShape {
	tile: Tile;
}

export interface TransferOptions {
	/** How far a biome may exceed its area share (0 = exact ratio, Infinity = plain majority vote). */
	ratioSlack?: number;
	/** Samples taken per source-tile-sized area of a target tile. */
	samplesPerSourceTile?: number;
}

const MAX_SUBDIVISION = 24;
// Barycentric tolerance so rays landing on shared edges still hit a tile
const HIT_TOLERANCE = -1e-3;

export function readTileShapes(meshes: TileMesh[]): BiomeTileShape[] {
	const v = new THREE.Vector3();
	const a = new THREE.Vector3();
	const b = new THREE.Vector3();
	const c = new THREE.Vector3();

	return meshes.map((mesh) => {
		mesh.updateMatrix();
		const position = mesh.geometry.getAttribute("position");
		const index = mesh.geometry.getIndex();
		if (!index) throw new Error("Tile geometry is missing an index");

		const triangles = new Float32Array(index.count * 3);
		for (let i = 0; i < index.count; i++) {
			v.fromBufferAttribute(position, index.getX(i))
				.applyMatrix4(mesh.matrix)
				.normalize();
			v.toArray(triangles, i * 3);
		}

		const center = new THREE.Vector3();
		let area = 0;
		for (let t = 0; t < triangles.length; t += 9) {
			a.fromArray(triangles, t);
			b.fromArray(triangles, t + 3);
			c.fromArray(triangles, t + 6);
			const triArea =
				0.5 * b.clone().sub(a).cross(c.clone().sub(a)).length();
			area += triArea;
			center.addScaledVector(a.add(b).add(c), triArea / 3);
		}
		center.normalize();

		return { tile: mesh.tile, center, triangles, area };
	});
}

class SourceIndex {
	private cells = new Map<number, number[]>();
	private cellSize: number;

	constructor(private shapes: TileShape[]) {
		// Roughly two tile spacings, so the 3x3x3 neighbourhood always contains the containing tile
		this.cellSize = 2 * Math.sqrt((4 * Math.PI) / shapes.length);
		shapes.forEach(({ center }, i) => {
			const key = this.key(
				this.cell(center.x),
				this.cell(center.y),
				this.cell(center.z),
			);
			const bucket = this.cells.get(key);
			if (bucket) bucket.push(i);
			else this.cells.set(key, [i]);
		});
	}

	private cell(value: number) {
		return Math.floor(value / this.cellSize);
	}

	private key(x: number, y: number, z: number) {
		return ((x + 1024) * 2048 + (y + 1024)) * 2048 + (z + 1024);
	}

	/** Ray from the origin along (dx, dy, dz) -> index of the source tile it passes through, or -1. */
	locate(dx: number, dy: number, dz: number): number {
		const cx = this.cell(dx);
		const cy = this.cell(dy);
		const cz = this.cell(dz);

		let best = -1;
		let bestScore = HIT_TOLERANCE;

		for (let x = cx - 1; x <= cx + 1; x++) {
			for (let y = cy - 1; y <= cy + 1; y++) {
				for (let z = cz - 1; z <= cz + 1; z++) {
					const bucket = this.cells.get(this.key(x, y, z));
					if (!bucket) continue;

					for (const tileIndex of bucket) {
						const tris = this.shapes[tileIndex].triangles;
						for (let t = 0; t < tris.length; t += 9) {
							const score = rayTriangleScore(tris, t, dx, dy, dz);
							if (score > bestScore) {
								bestScore = score;
								best = tileIndex;
							}
						}
					}
				}
			}
		}

		return best;
	}
}

// Smallest barycentric coordinate of the ray/triangle plane hit (negative when outside), or -Infinity on a miss
function rayTriangleScore(
	tris: Float32Array,
	o: number,
	dx: number,
	dy: number,
	dz: number,
): number {
	const ax = tris[o],
		ay = tris[o + 1],
		az = tris[o + 2];
	const e1x = tris[o + 3] - ax,
		e1y = tris[o + 4] - ay,
		e1z = tris[o + 5] - az;
	const e2x = tris[o + 6] - ax,
		e2y = tris[o + 7] - ay,
		e2z = tris[o + 8] - az;

	const nx = e1y * e2z - e1z * e2y;
	const ny = e1z * e2x - e1x * e2z;
	const nz = e1x * e2y - e1y * e2x;

	const denom = nx * dx + ny * dy + nz * dz;
	if (Math.abs(denom) < 1e-12) return -Infinity;

	const t = (nx * ax + ny * ay + nz * az) / denom;
	if (t <= 0) return -Infinity;

	const wx = dx * t - ax,
		wy = dy * t - ay,
		wz = dz * t - az;
	const nn = nx * nx + ny * ny + nz * nz;

	// p = a + u*e1 + v*e2
	const u = ((wy * e2z - wz * e2y) * nx + (wz * e2x - wx * e2z) * ny + (wx * e2y - wy * e2x) * nz) / nn;
	const v = ((e1y * wz - e1z * wy) * nx + (e1z * wx - e1x * wz) * ny + (e1x * wy - e1y * wx) * nz) / nn;

	return Math.min(u, v, 1 - u - v);
}

// Visits equal-area sub-triangle centroids of every triangle, as unit directions
function forEachSample(
	shape: TileShape,
	perTile: number,
	visit: (x: number, y: number, z: number, weight: number) => void,
) {
	const triCount = shape.triangles.length / 9;
	const n = Math.min(MAX_SUBDIVISION, Math.max(1, Math.ceil(Math.sqrt(perTile / triCount))));
	const tris = shape.triangles;

	for (let o = 0; o < tris.length; o += 9) {
		const ax = tris[o], ay = tris[o + 1], az = tris[o + 2];
		const e1x = tris[o + 3] - ax, e1y = tris[o + 4] - ay, e1z = tris[o + 5] - az;
		const e2x = tris[o + 6] - ax, e2y = tris[o + 7] - ay, e2z = tris[o + 8] - az;

		const cx = e1y * e2z - e1z * e2y;
		const cy = e1z * e2x - e1x * e2z;
		const cz = e1x * e2y - e1y * e2x;
		const weight = (0.5 * Math.hypot(cx, cy, cz)) / (n * n);

		const emit = (u: number, v: number) => {
			const px = ax + (e1x * u + e2x * v) / n;
			const py = ay + (e1y * u + e2y * v) / n;
			const pz = az + (e1z * u + e2z * v) / n;
			const len = Math.hypot(px, py, pz);
			visit(px / len, py / len, pz / len, weight);
		};

		for (let i = 0; i < n; i++) {
			for (let j = 0; j < n - i; j++) {
				emit(i + 1 / 3, j + 1 / 3);
				if (i + j <= n - 2) emit(i + 2 / 3, j + 2 / 3);
			}
		}
	}
}

// Largest-remainder rounding of shares to integer counts summing to total
function allocate(shares: number[], total: number): number[] {
	const exact = shares.map((s) => s * total);
	const counts = exact.map(Math.floor);
	let leftover = total - counts.reduce((sum, c) => sum + c, 0);

	exact
		.map((value, i) => ({ i, remainder: value - Math.floor(value) }))
		.sort((a, b) => b.remainder - a.remainder)
		.forEach(({ i }) => {
			if (leftover-- > 0) counts[i]++;
		});

	return counts;
}

/**
 * Returns a biome for every target tile. Each target tile is sampled across its area and the
 * samples are looked up on the source planet; the tile takes the biome covering most of it.
 * Biomes are capped near their overall area share so a high -> low res transfer keeps the ratios.
 * Tile.None is treated as a biome, as is any area the source does not cover.
 */
export function transferBiomes(
	source: BiomeTileShape[],
	target: TileShape[],
	{ ratioSlack = 0.25, samplesPerSourceTile = 6 }: TransferOptions = {},
): Tile[] {
	if (source.length === 0) return target.map(() => Tile.None);

	const biomes = Object.values(Tile);
	const slotOf = new Map(biomes.map((tile, i) => [tile, i]));
	const noneSlot = slotOf.get(Tile.None)!;
	const sourceSlots = source.map((shape) => slotOf.get(shape.tile)!);

	const index = new SourceIndex(source);
	const meanSourceArea = source.reduce((sum, s) => sum + s.area, 0) / source.length;

	// Area-weighted votes per target tile
	const totals = new Float64Array(biomes.length);
	const votes = target.map((shape) => {
		const tileVotes = new Float64Array(biomes.length);
		const perTile = samplesPerSourceTile * Math.max(1, shape.area / meanSourceArea);

		forEachSample(shape, perTile, (x, y, z, weight) => {
			const hit = index.locate(x, y, z);
			tileVotes[hit < 0 ? noneSlot : sourceSlots[hit]] += weight;
		});

		tileVotes.forEach((value, slot) => (totals[slot] += value));
		return tileVotes;
	});

	// Per-biome tile quota from its overall area share
	const totalWeight = totals.reduce((sum, value) => sum + value, 0);
	const quota = allocate(
		Array.from(totals, (value) => (totalWeight > 0 ? value / totalWeight : 0)),
		target.length,
	);
	const remaining = quota.map((q) =>
		q === 0 ? 0 : Math.min(target.length, Math.ceil(q * (1 + ratioSlack))),
	);

	// Most confident (tile, biome) pairs claim their quota first
	const candidates: { tile: number; slot: number; fraction: number }[] = [];
	votes.forEach((tileVotes, tile) => {
		const sum = tileVotes.reduce((s, value) => s + value, 0);
		if (sum <= 0) return;
		tileVotes.forEach((value, slot) => {
			if (value > 0) candidates.push({ tile, slot, fraction: value / sum });
		});
	});
	candidates.sort((a, b) => b.fraction - a.fraction || a.tile - b.tile);

	const result = new Array<Tile | undefined>(target.length).fill(undefined);
	for (const { tile, slot } of candidates) {
		if (result[tile] !== undefined || remaining[slot] <= 0) continue;
		result[tile] = biomes[slot];
		remaining[slot]--;
	}

	// Tiles whose every candidate biome was full: keep the best one with room, else the plain majority
	return result.map((assigned, tile) => {
		if (assigned !== undefined) return assigned;

		let bestSlot = -1;
		for (let slot = 0; slot < biomes.length; slot++) {
			if (remaining[slot] <= 0) continue;
			if (bestSlot < 0 || votes[tile][slot] > votes[tile][bestSlot]) bestSlot = slot;
		}
		if (bestSlot >= 0) {
			remaining[bestSlot]--;
			return biomes[bestSlot];
		}

		let majority = noneSlot;
		votes[tile].forEach((value, slot) => {
			if (value > votes[tile][majority]) majority = slot;
		});
		return biomes[majority];
	});
}
