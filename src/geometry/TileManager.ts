import * as THREE from "three";
import { createNoise3D, NoiseFunction3D } from "simplex-noise";
import { getPitchFromVector } from "@/utils/functions";
import { DEFAULT_BIOME, GENERATE_BIOMES } from "@/constants";

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
import { DistributionType } from "@/scenes/WorldSceneConfig";

const textureSets = {
	simple: {
		[Tile.None]: assetSquare,
		[Tile.Beach]: assetBeach,
		[Tile.Desert]: assetDesert,
		[Tile.Forest]: assetForest,
		[Tile.Mountain]: assetMountain,
		[Tile.Ocean]: assetOcean,
		[Tile.Spruce]: assetSpruce,
		[Tile.Sea]: assetSea,
		[Tile.Snow]: assetSnow,
	},
	realistic: {
		[Tile.None]: assetSquare,
		[Tile.Beach]: assetAiBeach,
		[Tile.Desert]: assetAiDesert,
		[Tile.Forest]: assetAiForest,
		[Tile.Mountain]: assetAiMountain,
		[Tile.Ocean]: assetAiOcean,
		[Tile.Spruce]: assetAiSpruce,
		[Tile.Sea]: assetAiSea,
		[Tile.Snow]: assetAiSnow,
	},
} as const;
type TextureSetKey = keyof typeof textureSets;
type TextureSet = (typeof textureSets)[keyof typeof textureSets];

class TileManager {
	public textureSets: Record<TextureSetKey, Record<Tile, THREE.Texture>>;
	public textureSet: TextureSetKey = "simple";
	public enabledTiles: Record<Tile, boolean>;
	public distributionMode: DistributionType = "planet-like";

	private noise1: NoiseFunction3D;
	private noise2: NoiseFunction3D;
	private noise3: NoiseFunction3D;

	constructor() {
		this.textureSets = {
			simple: this.loadTileTextures(textureSets.simple),
			realistic: this.loadTileTextures(textureSets.realistic),
		};

		this.enabledTiles = {
			[Tile.None]: false,
			[Tile.Beach]: true,
			[Tile.Desert]: true,
			[Tile.Forest]: true,
			[Tile.Mountain]: true,
			[Tile.Ocean]: true,
			[Tile.Spruce]: true,
			[Tile.Sea]: true,
			[Tile.Snow]: true,
		};

		this.refreshNoiseSeed();
	}

	private loadTileTextures(
		textureSet: TextureSet,
	): Record<Tile, THREE.Texture> {
		const loader = new THREE.TextureLoader();
		return Object.values(Tile).reduce(
			(obj, tile) => {
				const asset = textureSet[tile];
				const texture = loader.load(asset);
				texture.wrapS = THREE.ClampToEdgeWrapping;
				texture.wrapT = THREE.ClampToEdgeWrapping;
				obj[tile] = texture;
				return obj;
			},
			{} as Record<Tile, THREE.Texture>,
		);
	}

	getTexture(tile: Tile) {
		return this.textureSets[this.textureSet][tile];
	}

	refreshNoiseSeed() {
		this.noise1 = createNoise3D();
		this.noise2 = createNoise3D();
		this.noise3 = createNoise3D();
	}

	getTileAt(position: THREE.Vector3): Tile {
		switch (this.distributionMode) {
			case "planet-like":
				return this.getPlanetLikeTileAt(position);
			case "random":
				return this.getRandomTile();
		}
	}

	private getPlanetLikeTileAt(position: THREE.Vector3): Tile {
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

		const check = (tile: Tile) => this.enabledTiles[tile];

		function get(temperature: number, height: number) {
			if (GENERATE_BIOMES) {
				if (temperature < -0.4 && check(Tile.Snow)) return Tile.Snow;
				if (temperature < -0.0 && check(Tile.Ocean)) return Tile.Ocean;

				if (height < -0.3 && check(Tile.Ocean)) return Tile.Ocean;
				if (height < -0.1 && check(Tile.Ocean)) return Tile.Ocean; // Sea

				if (height > 0.6 && check(Tile.Mountain)) return Tile.Mountain;
				if (
					height > 0.1 &&
					height < 0.5 &&
					temperature > 0.85 &&
					check(Tile.Desert)
				)
					return Tile.Desert;

				if (temperature < 0.4 && check(Tile.Spruce)) return Tile.Spruce;

				if (check(Tile.Forest)) return Tile.Forest;

				// Mega hack
				for (const tile of Object.values(Tile)) {
					if (check(tile)) return tile;
				}
			}

			return Tile[DEFAULT_BIOME];
		}

		return get(temperature, height);
	}

	private getRandomTile(): Tile {
		const tiles = Object.values(Tile).filter((tile) => this.enabledTiles[tile]);
		if (tiles.length > 0) {
			return tiles[Math.floor(Math.random() * tiles.length)];
		}
		return Tile.Ocean;
	}

	private tileCycle = [
		Tile.Snow,
		Tile.Ocean,
		Tile.Sea,
		Tile.Spruce,
		Tile.Forest,
		Tile.Desert,
		Tile.Mountain,
	];

	getNextTile(tile: Tile) {
		const startIndex = this.tileCycle.indexOf(tile);

		for (let i = 1; i <= this.tileCycle.length; i++) {
			const next = this.tileCycle[(startIndex + i) % this.tileCycle.length];

			if (this.enabledTiles[next]) {
				return next;
			}
		}

		return tile;
	}

	tileToEmoji(tile: Tile) {
		switch (tile) {
			case Tile.Snow:
				return "❄️";
			case Tile.Ocean:
				return "🌊";
			case Tile.Sea:
				return "🐟";
			case Tile.Spruce:
				return "🌲";
			case Tile.Forest:
				return "🌳";
			case Tile.Desert:
				return "☀️";
			case Tile.Mountain:
				return "⛰️";
			default:
				return "";
		}
	}
}

const tileManager = new TileManager();
export { tileManager };
