import { Tile } from "@/scenes/world/TileManager";

/* Polyhedra models */

// https://en.wikipedia.org/wiki/List_of_geodesic_polyhedra_and_Goldberg_polyhedra
import geodesic20 from "./models/geodesic20.json";
import geodesic60 from "./models/geodesic60.json";
import geodesic80 from "./models/geodesic80.json";
import geodesic140 from "./models/geodesic140.json";
import geodesic180 from "./models/geodesic180.json";
import geodesic240 from "./models/geodesic240.json";
import geodesic320 from "./models/geodesic320.json";
import geodesic420 from "./models/geodesic420.json";
import geodesic500 from "./models/geodesic500.json";
import geodesic540 from "./models/geodesic540.json";
import goldberg12 from "./models/goldberg12.json";
import goldberg32 from "./models/goldberg32.json";
import goldberg42 from "./models/goldberg42.json";
import goldberg72 from "./models/goldberg72.json";
import goldberg92 from "./models/goldberg92.json";
import goldberg122 from "./models/goldberg122.json";
import goldberg162 from "./models/goldberg162.json";
import goldberg212 from "./models/goldberg212.json";
import goldberg252 from "./models/goldberg252.json";
import goldberg272 from "./models/goldberg272.json";
import goldberg282 from "./models/goldberg282.json";
import goldberg363 from "./models/goldberg363.json";
import goldberg482 from "./models/goldberg482.json";
import goldberg492 from "./models/goldberg492.json";
import goldberg1002 from "./models/goldberg1002.json";
import goldberg1962 from "./models/goldberg1962.json";
import goldberg2522 from "./models/goldberg2522.json";
import goldberg4412 from "./models/goldberg4412.json";
import goldberg5672 from "./models/goldberg5672.json";
import goldberg7842 from "./models/goldberg7842.json";
import goldberg10292 from "./models/goldberg10292.json";
import half_sphere_hexagon from "./models/half_sphere_hexagon.json";

export const PolyhedraModels = [
	{ model: geodesic20, name: "△ 20", count: 20 },
	{ model: geodesic60, name: "△ 60", count: 60 },
	{ model: geodesic80, name: "△ 80", count: 80 },
	{ model: geodesic140, name: "△ 140", count: 140 },
	{ model: geodesic180, name: "△ 180", count: 180 },
	{ model: geodesic240, name: "△ 240", count: 240 },
	{ model: geodesic320, name: "△ 320", count: 320 },
	{ model: geodesic420, name: "△ 420", count: 420 },
	{ model: geodesic500, name: "△ 500", count: 500 },
	{ model: geodesic540, name: "△ 540", count: 540 },

	{ model: goldberg12, name: "⭔ 12", count: 12 },
	{ model: goldberg32, name: "⭔ 32", count: 32 },
	{ model: goldberg42, name: "⭔ 42", count: 42 },
	{ model: goldberg72, name: "⭔ 72", count: 72 },
	{ model: goldberg92, name: "⭔ 92", count: 92 },
	{ model: goldberg122, name: "⭔ 122", count: 122 },
	{ model: goldberg162, name: "⭔ 162", count: 162 },
	{ model: goldberg212, name: "⭔ 212", count: 212 },
	{ model: goldberg252, name: "⭔ 252", count: 252 },
	{ model: goldberg272, name: "⭔ 272", count: 272 },
	{ model: goldberg282, name: "⭔ 282", count: 282 },
	{ model: goldberg363, name: "⭔ 363", count: 363 },
	{ model: goldberg482, name: "⭔ 482", count: 482 },
	{ model: goldberg492, name: "⭔ 492", count: 492 },
	{ model: goldberg1002, name: "⭔ 1002", count: 1002 },
	{ model: goldberg1962, name: "⭔ 1962", count: 1962 },
	{ model: goldberg2522, name: "⭔ 2522", count: 2522 },
	{ model: goldberg4412, name: "⭔ 4412", count: 4412 },
	{ model: goldberg5672, name: "⭔ 5672", count: 5672 },
	{ model: goldberg7842, name: "⭔ 7842", count: 7842 },
	{ model: goldberg10292, name: "⭔ 10292", count: 10292 },

	{ model: half_sphere_hexagon, name: "⬡ 227", count: 227 },
] as const;

// Model
export type ModelName = (typeof PolyhedraModels)[number]["name"];
export const ModelNames = PolyhedraModels.map(({ name }) => name);

// Tile lines
export const TileEdges = ["hide all", "show all", "show borders"] as const;
export type TileEdge = (typeof TileEdges)[number];

// Tile texture
export const TileTextures = [
	"invisible tiles",
	"colored tiles",
	"symbol tiles",
	"realistic tiles",
] as const;
export type TileTexture = (typeof TileTextures)[number];

// Distribution
export const DistributionTypes = [
	"height & temp.",
	"height only",
	"temp. only",
	"random",
] as const;
export type DistributionType = (typeof DistributionTypes)[number];

// Biomes
export type EnabledBiomes = { [key in Tile]: boolean };
export type BiomeCount = { [key in Tile]: number };

/* Socket UI config */

export interface WorldUiConfig {
	model: ModelName;
	tileEdge: TileEdge;
	tileTexture: TileTexture;
	distribution: DistributionType;
	autoGenerate: boolean;
	rotationMode: boolean;
	enabledBiomes: EnabledBiomes;
	biomeCount: BiomeCount;
	edgeWidth: number;
	edgeColor: string;
}
