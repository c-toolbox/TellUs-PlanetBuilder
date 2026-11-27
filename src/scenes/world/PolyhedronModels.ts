import type { PolyhedronModel } from "./models/geometry";
import { generateGeodesic, geodesicFaceCount } from "./models/GeodesicGeometry";
import { generateGoldberg, goldbergFaceCount } from "./models/GoldbergGeometry";
import { generateHorosphere, horosphereFaceCount, HOROSPHERE_HEX_SIZE } from "./models/HorosphereGeometry";
import { generateFibonacci } from "./models/FibonacciGeometry";

interface ModelPreset {
	name: `△ ${number}` | `⭔ ${number}` | `⬡ ${number}` | `◇ ${number}`;
	count: number;
	getModel: () => PolyhedronModel;
}

function preset(
	name: ModelPreset["name"],
	count: number,
	generate: () => PolyhedronModel,
): ModelPreset {
	let cached: PolyhedronModel | undefined;
	return { name, count, getModel: () => (cached ??= generate()) };
}

const GEODESICS = [
	[1, 0],
	[1, 1],
	[2, 0],
	[2, 1],
	[3, 0],
	[2, 2],
	[4, 0],
	[4, 1],
	[5, 0],
	[3, 3],
] as const;
const GOLDBERGS = [
	[1, 0],
	[1, 1],
	[2, 0],
	[2, 1],
	[3, 0],
	[2, 2],
	[4, 0],
	[4, 1],
	[5, 0],
	[3, 3],
	[4, 2],
	[6, 0],
	[4, 4],
	[7, 0],
	[10, 0],
	[14, 0],
	[12, 6],
	[21, 0],
	[18, 9],
	[28, 0],
	[28, 7],
] as const;

const FIBONACCI_COUNTS = [32, 64, 128, 256, 512, 1024, 2048, 4096] as const;

/** Startup loads only parameters; coordinates and topology are built on first selection. */
export const PolyhedraModels = [
	...GEODESICS.map(([h, k]) => {
		const count = geodesicFaceCount(h, k);
		return preset(`△ ${count}`, count, () => generateGeodesic(h, k));
	}),
	...GOLDBERGS.map(([h, k]) => {
		const count = goldbergFaceCount(h, k);
		return preset(`⭔ ${count}`, count, () => generateGoldberg(h, k));
	}),
	...[2, 1, 0].map((step) => {
		const size = HOROSPHERE_HEX_SIZE * 1.5 ** step;
		const count = horosphereFaceCount(size);
		return preset(`⬡ ${count}`, count, () => generateHorosphere(size));
	}),
	...FIBONACCI_COUNTS.map(count => preset(`◇ ${count}`, count, () => generateFibonacci(count))),
] as const;
