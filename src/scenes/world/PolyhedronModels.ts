import type { PolyhedronModel } from "./models/geometry";
import { generateGeodesic, geodesicFaceCount } from "./models/GeodesicGeometry";
import { generateGoldberg, goldbergFaceCount } from "./models/GoldbergGeometry";
import { generateHorosphere, horosphereFaceCount } from "./models/HorosphereGeometry";
import { generateFibonacci } from "./models/FibonacciGeometry";

export const PolyhedronTypes = {
	geodesic: { symbol: "△", name: "Geodesic sphere" },
	goldberg: { symbol: "⭔", name: "Goldberg polyhedron" },
	fibonacci: { symbol: "◇", name: "Fibonacci sphere" },
	horosphere: { symbol: "⬡", name: "Horosphere" },
} as const;

export type PolyhedronType = keyof typeof PolyhedronTypes;

interface ModelPreset {
	type: PolyhedronType;
	name: `${(typeof PolyhedronTypes)[PolyhedronType]["symbol"]} ${number}`;
	count: number;
	getModel: () => PolyhedronModel;
}

function preset(
	type: PolyhedronType,
	count: number,
	generate: () => PolyhedronModel,
): ModelPreset {
	let cached: PolyhedronModel | undefined;
	return {
		type,
		name: `${PolyhedronTypes[type].symbol} ${count}`,
		count,
		getModel: () => (cached ??= generate()),
	};
}

const GEODESICS = [
	[1, 1], // 60
	[3, 0], // 180
	[4, 0], // 320
	[5, 0], // 500
] as const;

const GOLDBERGS = [
	[3, 0], // 92
	[4, 2], // 282
	[7, 0], // 492
	[8, 2], // 842
] as const;

const FIBONACCI_COUNTS = [
	100,
	500,
] as const;

const HOROSPHERE_SIZES = [
	0.17212, // 625
	0.09917, // 1801
] as const;

/** Startup loads only parameters; coordinates and topology are built on first selection. */
export const PolyhedraModels = [
	...GEODESICS.map(([h, k]) => {
		const count = geodesicFaceCount(h, k);
		return preset("geodesic", count, () => generateGeodesic(h, k));
	}),
	...GOLDBERGS.map(([h, k]) => {
		const count = goldbergFaceCount(h, k);
		return preset("goldberg", count, () => generateGoldberg(h, k));
	}),
	...FIBONACCI_COUNTS.map((count) =>
		preset("fibonacci", count, () => generateFibonacci(count)),
	),
	...HOROSPHERE_SIZES.map((size) => {
		const count = horosphereFaceCount(size);
		return preset("horosphere", count, () => generateHorosphere(size));
	}),
] as const;
