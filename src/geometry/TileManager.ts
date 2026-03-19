import * as THREE from "three";
import { createNoise3D, NoiseFunction3D } from "simplex-noise";
import { getPitchFromVector } from "@/utils/functions";
import {
	BiomeCount,
	DistributionType,
	WorldUiConfig,
} from "@/scenes/WorldSceneConfig";

import assetSquare from "@/assets/square.png";

import assetSavanna from "@/assets/colors/savanna.png";
import assetDesert from "@/assets/colors/desert.png";
import assetForest from "@/assets/colors/forest.png";
import assetMountain from "@/assets/colors/mountain.png";
import assetOcean from "@/assets/colors/ocean.png";
import assetTaiga from "@/assets/colors/taiga.png";
import assetSnow from "@/assets/colors/snow.png";

import assetAiSavanna from "@/assets/ai/savanna.jpg";
import assetAiDesert from "@/assets/ai/desert.jpg";
import assetAiForest from "@/assets/ai/forest.jpg";
import assetAiMountain from "@/assets/ai/mountain.jpg";
import assetAiOcean from "@/assets/ai/ocean.jpg";
import assetAiTaiga from "@/assets/ai/taiga.jpg";
import assetAiSnow from "@/assets/ai/snow.jpg";

export type TextureSetKey = "icon" | "ai";

export const Tiles = {
	None: {
		texture: { icon: assetSquare, ai: assetSquare },
		color: new THREE.Color(0xffffff),
		emoji: "",
	},
	Snow: {
		texture: { icon: assetSnow, ai: assetAiSnow },
		color: new THREE.Color(0xe1f2fe),
		emoji: "❄️",
	},
	Ocean: {
		texture: { icon: assetOcean, ai: assetAiOcean },
		color: new THREE.Color(0x3346e4),
		emoji: "🌊",
	},
	Taiga: {
		texture: { icon: assetTaiga, ai: assetAiTaiga },
		color: new THREE.Color(0x077955),
		emoji: "🌲",
	},
	Forest: {
		texture: { icon: assetForest, ai: assetAiForest },
		color: new THREE.Color(0x0ca440),
		emoji: "🌳",
	},
	Savanna: {
		texture: { icon: assetSavanna, ai: assetAiSavanna },
		color: new THREE.Color(0xa8bf18),
		emoji: "🌾",
	},
	Desert: {
		texture: { icon: assetDesert, ai: assetAiDesert },
		color: new THREE.Color(0xfad33e),
		emoji: "☀️",
	},
	Mountain: {
		texture: { icon: assetMountain, ai: assetAiMountain },
		color: new THREE.Color(0x93a1b8),
		emoji: "⛰️",
	},
} as const;

export type Tile = keyof typeof Tiles;

export const Tile = Object.fromEntries(
	Object.keys(Tiles).map((key) => [key, key]),
) as { [K in Tile]: K };

class TileManager {
	public worldConfig: WorldUiConfig;
	public textureSets: Record<TextureSetKey, Record<Tile, THREE.Texture>>;
	public distributionMode: DistributionType = "planet-like";

	private noise1: NoiseFunction3D;
	private noise2: NoiseFunction3D;
	private noise3: NoiseFunction3D;
	private noise4: NoiseFunction3D;
	private noise5: NoiseFunction3D;

	constructor() {
		this.textureSets = {
			icon: this.loadTileTextures("icon"),
			ai: this.loadTileTextures("ai"),
		};

		this.refreshNoiseSeed();
	}

	private loadTileTextures(set: TextureSetKey): Record<Tile, THREE.Texture> {
		const loader = new THREE.TextureLoader();
		return Object.values(Tile).reduce(
			(obj, tile) => {
				const texture = this.loadTileTexture(tile, set, loader);
				obj[tile] = texture;
				return obj;
			},
			{} as Record<Tile, THREE.Texture>,
		);
	}

	private loadTileTexture(
		tile: Tile,
		set: TextureSetKey,
		loader: THREE.TextureLoader,
	): THREE.Texture {
		const asset = Tiles[tile].texture[set];
		const texture = loader.load(asset);
		texture.wrapS = THREE.ClampToEdgeWrapping;
		texture.wrapT = THREE.ClampToEdgeWrapping;
		texture.colorSpace = THREE.SRGBColorSpace;
		return texture;
	}

	get currentTextureSetKey(): TextureSetKey {
		switch (this.worldConfig.tileTexture) {
			case "invisible tiles":
			case "colored tiles":
			case "symbol tiles":
				return "icon";
			case "realistic tiles":
				return "ai";
		}
	}

	getTexture(tile: Tile) {
		return this.textureSets[this.currentTextureSetKey][tile];
	}

	refreshNoiseSeed() {
		this.noise1 = createNoise3D();
		this.noise2 = createNoise3D();
		this.noise3 = createNoise3D();
		this.noise4 = createNoise3D();
		this.noise5 = createNoise3D();
	}

	getClimate(position: THREE.Vector3) {
		const { x, y, z } = position;

		const pitch = getPitchFromVector(position) / Math.PI;

		let temperature = 1 - Math.abs(2 * pitch);
		temperature += 0.3 * this.noise1(2.0 * x, 2.0 * y, 2.0 * z);

		let height =
			0.8 * this.noise2(0.6 * x, 0.6 * y, 0.6 * z) +
			0.2 * this.noise3(2.0 * x, 2.0 * y, 2.0 * z);

		let tectonic =
			1 * this.noise4(1.0 * x, 1.0 * y, 1.0 * z) +
			0 * this.noise5(2.0 * x, 2.0 * y, 2.0 * z);

		return { temperature, height, tectonic };
	}

	gaussian(x: number, mean: number, sigma: number) {
		const d = (x - mean) / sigma;
		return Math.exp(-d * d);
	}

	getBiomeScore(tile: Tile, temp: number, height: number, tectonic: number) {
		switch (tile) {
			case Tile.Snow:
				return 1000 * this.gaussian(temp, -1, 1);

			case Tile.Ocean:
				return (
					50 * this.gaussian(height, -1, 1) + 5 * this.gaussian(temp, -1, 1)
				);

			case Tile.Mountain:
				return (
					10 * this.gaussian(tectonic, 0, 0.3) * this.gaussian(height, 0.5, 1)
				);

			case Tile.Desert:
				return (
					10 *
					(this.gaussian(temp, 0.6, 0.6) + 2 * this.gaussian(height, 1, 0.5))
				);

			case Tile.Savanna:
				return (
					2 * this.gaussian(temp, 0.6, 0.6) + this.gaussian(height, 1, 0.7)
				);

			case Tile.Taiga:
				return 5 * this.gaussian(temp, -1, 0.5) + this.gaussian(height, 0, 0.5);

			case Tile.Forest:
				return 2 * this.gaussian(temp, 1, 1) + 0 * this.gaussian(height, 0, 0.5);

			default:
				return 0.1;
		}
	}

	populateTiles(positions: THREE.Vector3[], biomes: BiomeCount): Tile[] {
		type Candidate = {
			posIndex: number;
			tile: Tile;
			score: number;
		};
		const candidates: Candidate[] = [];

		const remaining: Record<Tile, number> = {} as any;
		for (const tile of Object.values(Tile)) {
			remaining[tile] = biomes[tile];
		}

		positions.forEach((pos, i) => {
			const { temperature, height, tectonic } = this.getClimate(pos);

			for (const tile of Object.values(Tile)) {
				if (remaining[tile] <= 0) continue;

				const score = this.getBiomeScore(tile, temperature, height, tectonic);

				candidates.push({
					posIndex: i,
					tile,
					score,
				});
			}
		});

		candidates.sort((a, b) => b.score - a.score);

		const result: Tile[] = new Array(positions.length);
		const usedPositions = new Set<number>();

		for (const c of candidates) {
			if (usedPositions.has(c.posIndex)) continue;
			if (remaining[c.tile] <= 0) continue;

			result[c.posIndex] = c.tile;
			usedPositions.add(c.posIndex);
			remaining[c.tile]--;
		}

		for (let i = 0; i < result.length; i++) {
			if (!result[i]) {
				for (const tile of Object.values(Tile)) {
					if (remaining[tile] > 0) {
						result[i] = tile;
						remaining[tile]--;
						break;
					}
				}
			}
		}

		return result;
	}

	// private getRandomTile(): Tile {
	// 	const tiles = Object.values(Tile).filter((tile) => this.enabledTiles[tile]);
	// 	if (tiles.length > 0) {
	// 		return tiles[Math.floor(Math.random() * tiles.length)];
	// 	}
	// 	return Tile.Ocean;
	// }

	private tileCycle = Object.keys(Tiles) as Tile[];

	getNextTile(tile: Tile) {
		const startIndex = this.tileCycle.indexOf(tile);

		for (let i = 1; i <= this.tileCycle.length; i++) {
			const next = this.tileCycle[(startIndex + i) % this.tileCycle.length];
			const isEnabled = this.worldConfig.biomes[next] > 0;

			if (isEnabled) {
				return next;
			}
		}

		return tile;
	}

	tileToEmoji(tile: Tile): string {
		return Tiles[tile].emoji;
	}

	tileToColor(tile: Tile): THREE.Color {
		return Tiles[tile].color;
	}
}

const tileManager = new TileManager();
export { tileManager };
