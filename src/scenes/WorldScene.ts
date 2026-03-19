import * as THREE from "three";
import BaseScene from "./BaseScene";

import { SceneKey, sceneManager, scenes } from "./SceneManager";
import { TileMesh } from "@/geometry/TileMesh";
import { TouchId } from "@/network/tuioProtocol";
import { Tile, tileManager, Tiles } from "@/geometry/TileManager";
import { UiConfigEvent } from "@/network/uiProtocol";
import { Renderer } from "./Renderer";
import { Polyhedra } from "@/geometry/Polyhedra";
import {
	DistributionType,
	DistributionTypes,
	TileTexture,
	TileTextures,
	ModelName,
	ModelNames,
	PolyhedraModels,
	WorldUiConfig,
	TileEdges,
	TileEdge,
} from "./WorldSceneConfig";
import { ORIGIN, SHOW_EDGES, SHOW_FACES, SHOW_VERTICES } from "@/constants";

import backgroundAsset from "@/assets/backgrounds/globe/truecolor.png";

export default class WorldScene extends BaseScene {
	private globe: Polyhedra;

	private worldConfig: WorldUiConfig = {
		// model: "△ 60",
		model: "⭔ 1002",
		tileEdge: "show borders",
		tileTexture: "realistic tiles",
		distribution: "planet-like",
		refreshSeed: true,
		biomes: {
			[Tile.None]: 0,
			[Tile.Snow]: 6,
			[Tile.Ocean]: 70,
			[Tile.Taiga]: 10,
			[Tile.Forest]: 20,
			[Tile.Savanna]: 4,
			[Tile.Desert]: 4,
			[Tile.Mountain]: 0,
		},
	};

	constructor() {
		super();

		this.onTouch = this.onTouch.bind(this);
		this.onClick = this.onClick.bind(this);

		this.addBackground(backgroundAsset);

		// Lighting
		const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 0.9);
		this.add(hemi);
		const dir = new THREE.DirectionalLight(0xffffff, 0.6);
		dir.position.set(5, 10, 7);
		this.add(dir);
	}

	createPlanet() {
		// Find model from config
		const polyhedra = PolyhedraModels.find(
			({ name }) => name == this.worldConfig.model,
		);
		if (!polyhedra) {
			return console.error(`Could not find model: '${this.worldConfig.model}'`);
		}

		// Remove existing globe
		this.clickable = [];
		if (this.globe) {
			this.remove(this.globe.vertexGroup);
			this.remove(this.globe.edgeGroup);
			this.remove(this.globe.faceGroup);
		}

		// Create new globe
		this.globe = new Polyhedra(polyhedra.model);

		// Add Polyhedra groups to scene
		if (SHOW_VERTICES) this.add(this.globe.vertexGroup);
		if (SHOW_EDGES) this.add(this.globe.edgeGroup);
		if (SHOW_FACES) this.add(this.globe.faceGroup);
		this.makeClickable(this.globe.faceGroup);

		this.populatePlanetTiles();
	}

	populatePlanetTiles() {
		const tilePositions = this.globe.faceGroup.children.map(
			(mesh) => mesh.position,
		);

		const tiles = tileManager.populateTiles(
			tilePositions,
			this.worldConfig.biomes,
		);
		this.globe.tileMeshes.forEach((tileMesh, index) => {
			tileMesh.setTile(tiles[index]);
		});

		// Check neighbor edges
		this.globe.tileMeshes.forEach((tileMesh) => {
			tileMesh.neighbors.forEach(({ mesh, edgeIndex }) => {
				const same = tileMesh.tile == mesh.tile;
				this.globe.setEdgeVisible(edgeIndex, !same);
			});
		});
	}

	// On entering scene
	override onEnter(renderer: Renderer) {
		console.log("WorldScene active");

		// Set tileManager variables
		this.applyTileManagerSettings();

		// Subscribe to touch events
		this.touchHandler.on("touch", this.onTouch);
		this.touchHandler.on("click", this.onClick);

		// Example: listen for OmniSocket events
		// this.omniSocket.on("playerJoined", this.handlePlayerJoin);

		this.redistributeBiomes();
		this.createPlanet();

		this.add(this.touchHandler.touchGroup);

		// Initialize Socket UI
		this.setupUi();
		this.refreshConfig();
	}

	// On exiting scene
	override onExit(renderer: Renderer) {
		console.log("WorldScene exiting");

		this.clear();

		// Clean up event bindings
		this.touchHandler.off("touch", this.onTouch);
		this.touchHandler.off("click", this.onClick);
		// this.omniSocket.off("playerJoined", this.handlePlayerJoin);
	}

	private onTouch(touchId: TouchId, vector: THREE.Vector3) {
		this.handleRaycast(touchId, vector, "touch");
	}

	private onClick(touchId: TouchId, vector: THREE.Vector3) {
		this.handleRaycast(touchId, vector, "click");
	}

	handleRaycast(
		touchId: TouchId,
		vector: THREE.Vector3,
		type: "touch" | "click",
	) {
		this.raycaster.set(ORIGIN, vector);

		const touchPoint = this.touchHandler.getTouchPoint(touchId);
		if (!touchPoint) return;

		const intersects = this.raycaster.intersectObjects(this.clickable, true);
		if (intersects.length > 0) {
			const tileMesh = intersects[0].object as TileMesh;
			if (tileMesh) {
				if (type == "touch" && touchPoint.tile == Tile.None) {
					touchPoint.setTile(tileMesh.tile);
				} else if (type == "click") {
					touchPoint.setTile(tileManager.getNextTile(tileMesh.tile));
				}

				if (tileMesh.tile != touchPoint.tile) {
					this.refreshConfig();
				}

				tileMesh.setTile(touchPoint.tile);
				tileMesh.neighbors.forEach(({ mesh, edgeIndex }) => {
					const same = tileMesh.tile == mesh.tile;
					this.globe.setEdgeVisible(edgeIndex, !same);
				});
			}
		}
	}

	update(delta: number) {
		this.players.forEach((player) => player.update());
	}

	/* Socket UI */

	setupUi() {
		this.uiSocket.on("request", () => this.refreshConfig());

		this.uiSocket.on("scene", (value: SceneKey) => {
			sceneManager.setScene(scenes[value]);
		});

		this.uiSocket.on("seed", (value: boolean) => {
			this.worldConfig.refreshSeed = value;
		});

		this.uiSocket.on("new_planet", () => {
			this.applyTileManagerSettings();
			if (this.worldConfig.refreshSeed) {
				tileManager.refreshNoiseSeed();
			}
			this.createPlanet();
			this.refreshConfig();
		});

		this.uiSocket.on("tile_edges", (value: TileEdge) => {
			this.worldConfig.tileEdge = value;
			this.refreshConfig();
		});

		this.uiSocket.on("tile_texture", (value: TileTexture) => {
			this.worldConfig.tileTexture = value;
			this.refreshConfig();

			// Update textures
			this.globe.tileMeshes.forEach((tileMesh) =>
				tileMesh.setTile(tileMesh.tile),
			);
		});

		this.uiSocket.on("model", (value: ModelName) => {
			this.worldConfig.model = value;
			this.redistributeBiomes();
			this.refreshConfig();
			// this.createPlanet();
		});

		this.uiSocket.on(Tile.Snow, (value: boolean) =>
			this.toggleBiome(Tile.Snow, value),
		);
		this.uiSocket.on(Tile.Ocean, (value: boolean) =>
			this.toggleBiome(Tile.Ocean, value),
		);
		this.uiSocket.on(Tile.Taiga, (value: boolean) =>
			this.toggleBiome(Tile.Taiga, value),
		);
		this.uiSocket.on(Tile.Forest, (value: boolean) =>
			this.toggleBiome(Tile.Forest, value),
		);
		this.uiSocket.on(Tile.Savanna, (value: boolean) =>
			this.toggleBiome(Tile.Savanna, value),
		);
		this.uiSocket.on(Tile.Desert, (value: boolean) =>
			this.toggleBiome(Tile.Desert, value),
		);
		this.uiSocket.on(Tile.Mountain, (value: boolean) =>
			this.toggleBiome(Tile.Mountain, value),
		);

		this.uiSocket.on("distribution", (value: DistributionType) => {
			this.worldConfig.distribution = value;
			this.refreshConfig();
		});

		this.uiSocket.on("biome_distribution", (values: number[]) => {
			const activeBiomes = Object.entries(this.worldConfig.biomes).filter(
				([tile, count]) => count > 0,
			);

			console.assert(
				activeBiomes.length === values.length,
				"Biome slider value count mismatch",
				{ activeBiomes: activeBiomes.length, values: values.length },
			);

			activeBiomes.forEach(([key], i) => {
				this.worldConfig.biomes[key as Tile] = values[i];
			});
			// this.redistributeBiomes();
			// this.createPlanet();
			this.populatePlanetTiles();

			this.refreshConfig();
		});
	}

	applyTileManagerSettings() {
		tileManager.worldConfig = this.worldConfig;
	}

	refreshConfig() {
		this.uiSocket.send(this.config);
	}

	get config(): UiConfigEvent {
		return {
			type: "config",
			title: "Planet builder",
			elements: [
				{
					type: "dropdown",
					id: "scene",
					hint_title: "Scene",
					hint_text: "Switch to a different scene",
					value: "World",
					options: [SceneKey.World, SceneKey.Paint],
					// options: Object.keys(scenes),
				},
				// {
				// 	type: "switch",
				// 	id: "live",
				// 	hint_title: "Live update",
				// 	hint_text:
				// 		"Allow any change to settings to immediately update the planet",
				// 	value: true,
				// },

				{
					type: "hr",
					id: "planet_settings",
					hint_title: "Planet settings",
				},
				{
					type: "dropdown",
					id: "tile_edges",
					hint_title: "Tile edges",
					hint_text: "How edges between tiles should be displayed",
					value: this.worldConfig.tileEdge,
					options: TileEdges,
				},
				{
					type: "dropdown",
					id: "tile_texture",
					hint_title: "Tile texture",
					hint_text: "Texture used for the tiles",
					value: this.worldConfig.tileTexture,
					options: TileTextures,
				},
				{
					type: "grid",
					columns: 3,
					elements: [
						{
							type: "switch",
							id: Tile.Snow,
							hint_title: `${tileManager.tileToEmoji(Tile.Snow)} ${Tile.Snow}`,
							// hint_title: tileManager.tileToEmoji(Tile.Snow),
							// hint_text: Tile.Snow,
							value: this.worldConfig.biomes[Tile.Snow] > 0,
						},
						{
							type: "switch",
							id: Tile.Ocean,
							hint_title: `${tileManager.tileToEmoji(Tile.Ocean)} ${Tile.Ocean}`,
							// hint_title: tileManager.tileToEmoji(Tile.Ocean),
							// hint_text: Tile.Ocean,
							value: this.worldConfig.biomes[Tile.Ocean] > 0,
						},
						{
							type: "switch",
							id: Tile.Taiga,
							hint_title: `${tileManager.tileToEmoji(Tile.Taiga)} ${Tile.Taiga}`,
							// hint_title: tileManager.tileToEmoji(Tile.Taiga),
							// hint_text: Tile.Taiga,
							value: this.worldConfig.biomes[Tile.Taiga] > 0,
						},
						{
							type: "switch",
							id: Tile.Forest,
							hint_title: `${tileManager.tileToEmoji(Tile.Forest)} ${Tile.Forest}`,
							// hint_title: tileManager.tileToEmoji(Tile.Forest),
							// hint_text: Tile.Forest,
							value: this.worldConfig.biomes[Tile.Forest] > 0,
						},
						{
							type: "switch",
							id: Tile.Savanna,
							hint_title: `${tileManager.tileToEmoji(Tile.Savanna)} ${Tile.Savanna}`,
							// hint_title: tileManager.tileToEmoji(Tile.Savanna),
							// hint_text: Tile.Savanna,
							value: this.worldConfig.biomes[Tile.Savanna] > 0,
						},
						{
							type: "switch",
							id: Tile.Desert,
							hint_title: `${tileManager.tileToEmoji(Tile.Desert)} ${Tile.Desert}`,
							// hint_title: tileManager.tileToEmoji(Tile.Desert),
							// hint_text: Tile.Desert,
							value: this.worldConfig.biomes[Tile.Desert] > 0,
						},
						{
							type: "switch",
							id: Tile.Mountain,
							hint_title: `${tileManager.tileToEmoji(Tile.Mountain)} ${Tile.Mountain}`,
							// hint_title: tileManager.tileToEmoji(Tile.Mountain),
							// hint_text: Tile.Mountain,
							value: this.worldConfig.biomes[Tile.Mountain] > 0,
						},
					],
				},

				{
					type: "hr",
					id: "planet_creation",
					hint_title: "Planet creation",
				},
				{
					type: "dropdown",
					id: "model",
					hint_title: "Planet model",
					hint_text: "The shape and number of planet tiles",
					value: this.worldConfig.model,
					options: ModelNames,
				},
				{
					type: "ratio_slider",
					id: "biome_distribution",
					hint_title: "Biome distribution",
					hint_text: "Specify the amount of tiles for each biome",
					values: Object.entries(this.worldConfig.biomes)
						.filter(([tile, count]) => count > 0)
						.map(([tile, count]) => ({
							name: Tiles[tile as Tile].emoji,
							value: count,
							color: "#" + Tiles[tile as Tile].color.getHexString(),
						})),
				},
				{
					type: "dropdown",
					id: "distribution",
					hint_title: "Distribution",
					hint_text: "How tiles should be positioned",
					value: this.worldConfig.distribution,
					options: DistributionTypes,
				},
				{
					type: "switch",
					id: "seed",
					hint_title: "Random seed",
					hint_text: "Shuffle the random seed to create a new planet",
					value: this.worldConfig.refreshSeed,
				},
				{
					type: "button",
					id: "new_planet",
					text: "Create",
					hint_title: "Create new planet",
					hint_text: "Generates a new planet with the above settings",
					color: "#c70036",
				},

				{
					type: "hr",
					id: "planet_status",
					hint_title: "Planet status",
				},
				{
					type: "grid",
					columns: 3,
					elements: [],
				},
				{
					type: "text",
					id: "tile_count",
					hint_title: "Tile count",
					hint_text: this.tileCount,
				},
				// {
				// 	type: "button",
				// 	id: "save",
				// 	text: "Save",
				// 	hint_title: "Save planet",
				// 	hint_text: "Save the current planet",
				// },
				// {
				// 	type: "button",
				// 	id: "load",
				// 	text: "Load",
				// 	hint_title: "Load planet",
				// 	hint_text: "Load the planet from save",
				// },
			],
		};
	}

	redistributeBiomes() {
		const totalTiles = PolyhedraModels.find(
			({ name }) => name == this.worldConfig.model,
		)!.count;

		const biomeEntries = Object.entries(this.worldConfig.biomes) as [
			Tile,
			number,
		][];

		// Only consider active biomes (value > 0)
		const active = biomeEntries.filter(([, value]) => value > 0);
		if (active.length === 0) return;

		// If there are more biomes than tiles, clamp
		const minTiles = Math.min(active.length, totalTiles);
		const remainingTiles = totalTiles - minTiles;

		const currentTotal = active.reduce((sum, [, value]) => sum + value, 0);

		// Step 1: scale remaining proportionally
		const scaled = active.map(([tile, value]) => {
			const weight = value / currentTotal;
			const exact = weight * remainingTiles;

			return {
				tile,
				base: 1, // guaranteed minimum
				value: Math.floor(exact),
				remainder: exact % 1,
			};
		});

		// Step 2: count assigned
		let assigned = scaled.reduce((sum, b) => sum + b.value, 0);

		let leftover = remainingTiles - assigned;

		// Step 3: distribute leftovers
		scaled
			.sort((a, b) => b.remainder - a.remainder)
			.slice(0, leftover)
			.forEach((b) => b.value++);

		// Step 4: write back
		for (const b of scaled) {
			this.worldConfig.biomes[b.tile as Tile] = b.base + b.value;
		}

		// Step 5: clear inactive ones
		for (const [tile, value] of biomeEntries) {
			if (value > 0 && !scaled.find((b) => b.tile === tile)) {
				this.worldConfig.biomes[tile as Tile] = 0;
			}
		}
	}

	toggleBiome(biome: Tile, enabled: boolean) {
		this.worldConfig.biomes[biome] = enabled ? 10 : 0;
		this.redistributeBiomes();
		this.refreshConfig();
	}

	get tileCount(): string {
		const counts = {} as Record<Tile, number>;
		for (const tile of Object.values(Tile)) {
			counts[tile] = 0;
		}

		for (const mesh of this.clickable) {
			const tileMesh = mesh as TileMesh;
			counts[tileMesh.tile]++;
		}

		const total = this.clickable.length;

		return Object.entries(counts)
			.filter(([, count]) => count > 0)
			.sort((a, b) => b[1] - a[1])
			.map(([tile, count]) => {
				const pct = Math.round((count / total) * 100);
				return `- ${tile || "None"}: ${count} (${pct}%)`;
			})
			.join("\n");
	}
}
