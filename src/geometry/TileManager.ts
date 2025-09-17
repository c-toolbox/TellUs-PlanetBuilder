import * as THREE from "three";
import { createNoise3D, NoiseFunction3D } from "simplex-noise";
import { getPitchFromVector } from "@/utils/functions";
import {
	DEFAULT_BIOME,
	GENERATE_BIOMES,
	SIMPLIFY_BIOMES,
	USE_AI_TEXTURES,
} from "@/constants";

export enum Tile {
	None = "",
	Beach = "Beach",
	Desert = "Desert",
	Forest = "Forest",
	Mountain = "Mountain",
	Ocean = "Ocean",
	Spruce = "Spruce",
	Sea = "Sea",
	Snow = "Snow",
}

import assetSquare from "@/assets/square.png";

import assetBeach from "@/assets/colors/beach.png";
import assetDesert from "@/assets/colors/desert.png";
import assetForest from "@/assets/colors/forest.png";
import assetMountain from "@/assets/colors/mountain.png";
import assetOcean from "@/assets/colors/ocean.png";
import assetSpruce from "@/assets/colors/spruce.png";
import assetSea from "@/assets/colors/sea.png";
import assetSnow from "@/assets/colors/snow.png";

import assetAiBeach from "@/assets/ai/beach.png";
import assetAiDesert from "@/assets/ai/desert.jpg";
import assetAiForest from "@/assets/ai/forest.jpg";
import assetAiMountain from "@/assets/ai/mountain.jpg";
import assetAiOcean from "@/assets/ai/ocean.jpg";
import assetAiSpruce from "@/assets/ai/spruce.jpg";
import assetAiSea from "@/assets/ai/sea.png";
import assetAiSnow from "@/assets/ai/snow.jpg";

const tileAssets = {
	[Tile.None]: assetSquare,
	[Tile.Beach]: USE_AI_TEXTURES ? assetAiBeach : assetBeach,
	[Tile.Desert]: USE_AI_TEXTURES ? assetAiDesert : assetDesert,
	[Tile.Forest]: USE_AI_TEXTURES ? assetAiForest : assetForest,
	[Tile.Mountain]: USE_AI_TEXTURES ? assetAiMountain : assetMountain,
	[Tile.Ocean]: USE_AI_TEXTURES ? assetAiOcean : assetOcean,
	[Tile.Spruce]: USE_AI_TEXTURES ? assetAiSpruce : assetSpruce,
	[Tile.Sea]: USE_AI_TEXTURES ? assetAiSea : assetSea,
	[Tile.Snow]: USE_AI_TEXTURES ? assetAiSnow : assetSnow,
};

class TileManager {
	public textures: Record<Tile, THREE.Texture>;
	private noise1: NoiseFunction3D;
	private noise2: NoiseFunction3D;
	private noise3: NoiseFunction3D;

	constructor() {
		this.loadTileTextures();
		this.noise1 = createNoise3D();
		this.noise2 = createNoise3D();
		this.noise3 = createNoise3D();
	}

	private loadTileTextures() {
		const loader = new THREE.TextureLoader();
		this.textures = Object.values(Tile).reduce((obj, tile) => {
			const asset = tileAssets[tile];
			const texture = loader.load(asset);
			texture.wrapS = THREE.ClampToEdgeWrapping;
			texture.wrapT = THREE.ClampToEdgeWrapping;
			obj[tile] = texture;
			return obj;
		}, {} as Record<Tile, THREE.Texture>);
	}

	getTexture(tile: Tile) {
		return this.textures[tile];
	}

	getTileAt(position: THREE.Vector3): Tile {
		function get(temperature: number, height: number) {
			if (GENERATE_BIOMES) {
				if (SIMPLIFY_BIOMES) {
					if (temperature < -0.4) return Tile.Snow;
					if (temperature < -0.0) return Tile.Ocean;

					if (height < -0.1) return Tile.Ocean;

					if (height > 0.1 && temperature > 0.8) return Tile.Desert;

					return Tile.Forest;
				} else {
					if (temperature < -0.4) return Tile.Snow;
					if (temperature < -0.0) return Tile.Ocean;

					if (height < -0.3) return Tile.Ocean;
					if (height < -0.1) return Tile.Ocean; // Sea

					if (height > 0.6) return Tile.Mountain;
					if (height > 0.1 && height < 0.5 && temperature > 0.85)
						return Tile.Desert;

					if (temperature < 0.4) return Tile.Spruce;
					return Tile.Forest;
				}
			}

			return Tile[DEFAULT_BIOME];
		}

		const k1 = 2.0;
		const k2 = 0.8;
		const k3 = 2.0;

		const { x, y, z } = position;
		const pitch = getPitchFromVector(position) / Math.PI;
		let temperature = 1 - Math.abs(2 * pitch);
		temperature += 0.4 * this.noise1(k1 * x, k1 * y, k1 * z);

		let height =
			0.8 * this.noise2(k2 * x, k2 * y, k2 * z) +
			0.2 * this.noise3(k3 * x, k3 * y, k3 * z);

		return get(temperature, height);
	}

	getNextTile(tile: Tile) {
		if (SIMPLIFY_BIOMES) {
			switch (tile) {
				case Tile.None:
				case Tile.Snow:
					return Tile.Ocean;
				case Tile.Ocean:
					return Tile.Forest;
				case Tile.Forest:
					return Tile.Desert;
				case Tile.Desert:
					return Tile.Snow;

				default:
					return tile;
			}
		} else {
			switch (tile) {
				case Tile.None:
					return Tile.Snow;
				case Tile.Snow:
					return Tile.Ocean;
				case Tile.Ocean:
					return Tile.Sea;
				case Tile.Sea:
					return Tile.Spruce;
				case Tile.Spruce:
					return Tile.Forest;
				case Tile.Forest:
					return Tile.Desert;
				case Tile.Desert:
					return Tile.Snow;

				default:
					return tile;
			}
		}
	}
}

const tileManager = new TileManager();
export { tileManager };
