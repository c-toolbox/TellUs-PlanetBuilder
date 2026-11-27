import type { Tile } from "@/scenes/world/TileManager";
import { PolyhedraModels } from "./PolyhedronModels";

export { PolyhedraModels };

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
	"textured tiles",
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
