import * as THREE from "three";
import BaseScene from "./BaseScene";

import { SceneKey, sceneManager, scenes } from "./SceneManager";
import { TileMesh } from "@/geometry/TileMesh";
import { TouchId } from "@/network/tuioProtocol";
import { Tile, tileManager } from "@/geometry/TileManager";
import { UiConfigEvent } from "@/network/uiProtocol";
import { Renderer } from "./Renderer";
import { Polyhedra } from "@/geometry/Polyhedra";
import {
	DistributionType,
	DistributionTypes,
	GraphicType,
	GraphicTypes,
	ModelName,
	ModelNames,
	PolyhedraModels,
	WorldUiConfig,
} from "./WorldSceneConfig";
import { ORIGIN, SHOW_EDGES, SHOW_FACES, SHOW_VERTICES } from "@/constants";

import backgroundAsset from "@/assets/backgrounds/globe/truecolor.png";

export default class WorldScene extends BaseScene {
	private globe: Polyhedra;

	private uiConfig: WorldUiConfig = {
		model: "△ 60",
		graphics: "realistic",
		distribution: "planet-like",
		biomes: {
			[Tile.None]: {
				value: 0,
				color: "#000000",
			},
			[Tile.Snow]: {
				value: 5,
				color: "#e1f2fe",
			},
			[Tile.Ocean]: {
				value: 60,
				color: "#3346e4",
			},
			[Tile.Sea]: {
				value: 0,
				color: "#497dff",
			},
			[Tile.Spruce]: {
				value: 10,
				color: "#077955",
			},
			[Tile.Forest]: {
				value: 20,
				color: "#0ca440",
			},
			[Tile.Beach]: {
				value: 0,
				color: "#f7c900",
			},
			[Tile.Desert]: {
				value: 5,
				color: "#fad33e",
			},
			[Tile.Mountain]: {
				value: 0,
				color: "#93a1b8",
			},
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
		// Update tileManager random seed
		tileManager.refreshNoiseSeed();

		// Find model from config
		const model = PolyhedraModels.find(
			({ name }) => name == this.uiConfig.model,
		);
		if (!model) {
			return console.error(`Could not find model: '${this.uiConfig.model}'`);
		}

		// Remove existing globe
		this.clickable = [];
		if (this.globe) {
			this.remove(this.globe.vertexGroup);
			this.remove(this.globe.edgeGroup);
			this.remove(this.globe.faceGroup);
		}

		// Create new globe
		this.globe = new Polyhedra(model.model);

		// Add Polyhedra groups to scene
		if (SHOW_VERTICES) this.add(this.globe.vertexGroup);
		if (SHOW_EDGES) this.add(this.globe.edgeGroup);
		if (SHOW_FACES) this.add(this.globe.faceGroup);
		this.makeClickable(this.globe.faceGroup);
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

		this.uiSocket.on("apply", () => {
			this.applyTileManagerSettings();

			// Update textures of all tiles
			for (const mesh of this.clickable) {
				const tileMesh = mesh as TileMesh;
				tileMesh.setTile(tileMesh.tile);
			}

			this.refreshConfig();
		});

		this.uiSocket.on("new_planet", () => {
			this.applyTileManagerSettings();
			this.createPlanet();
			this.refreshConfig();
		});

		this.uiSocket.on("graphics", (value: GraphicType) => {
			this.uiConfig.graphics = value;
			this.refreshConfig();
		});

		this.uiSocket.on("model", (value: ModelName) => {
			this.uiConfig.model = value;
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
		this.uiSocket.on(Tile.Sea, (value: boolean) =>
			this.toggleBiome(Tile.Sea, value),
		);
		this.uiSocket.on(Tile.Spruce, (value: boolean) =>
			this.toggleBiome(Tile.Spruce, value),
		);
		this.uiSocket.on(Tile.Forest, (value: boolean) =>
			this.toggleBiome(Tile.Forest, value),
		);
		this.uiSocket.on(Tile.Desert, (value: boolean) =>
			this.toggleBiome(Tile.Desert, value),
		);
		this.uiSocket.on(Tile.Mountain, (value: boolean) =>
			this.toggleBiome(Tile.Mountain, value),
		);

		this.uiSocket.on("distribution", (value: DistributionType) => {
			this.uiConfig.distribution = value;
			this.refreshConfig();
		});

		this.uiSocket.on("biome_distribution", (values: number[]) => {
			const activeBiomes = Object.entries(this.uiConfig.biomes).filter(
				([_, biome]) => biome.value > 0,
			);

			console.assert(
				activeBiomes.length === values.length,
				"Biome slider value count mismatch",
				{ activeBiomes: activeBiomes.length, values: values.length },
			);

			activeBiomes.forEach(([key], i) => {
				this.uiConfig.biomes[key as Tile].value = values[i];
			});
			// this.redistributeBiomes();
			// this.createPlanet();

			this.refreshConfig();
		});
	}

	applyTileManagerSettings() {
		tileManager.textureSet = this.uiConfig.graphics;

		tileManager.distributionMode = this.uiConfig.distribution;

		Object.entries(this.uiConfig.biomes).forEach(([tile, { value }]) => {
			tileManager.enabledTiles[tile as Tile] = value > 0;
		});
	}

	get hasTileManagerChanges(): boolean {
		if (tileManager.textureSet !== this.uiConfig.graphics) {
			return true;
		}

		for (const [tile, { value }] of Object.entries(this.uiConfig.biomes)) {
			const isEnabled = value > 0;
			if (tileManager.enabledTiles[tile as Tile] !== isEnabled) {
				return true;
			}
		}

		return false;
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
					id: "graphics",
					hint_title: "Graphics",
					hint_text: "Texture style used for the tiles",
					value: this.uiConfig.graphics,
					options: GraphicTypes,
				},
				{
					type: "grid",
					id: "biome_grid",
					columns: 2,
					elements: [
						{
							type: "switch",
							id: Tile.Snow,
							hint_title: `${tileManager.tileToEmoji(Tile.Snow)} ${Tile.Snow}`,
							// hint_title: tileManager.tileToEmoji(Tile.Snow),
							// hint_text: Tile.Snow,
							value: this.uiConfig.biomes[Tile.Snow].value > 0,
						},
						{
							type: "switch",
							id: Tile.Ocean,
							hint_title: `${tileManager.tileToEmoji(Tile.Ocean)} ${Tile.Ocean}`,
							// hint_title: tileManager.tileToEmoji(Tile.Ocean),
							// hint_text: Tile.Ocean,
							value: this.uiConfig.biomes[Tile.Ocean].value > 0,
						},
						{
							type: "switch",
							id: Tile.Sea,
							hint_title: `${tileManager.tileToEmoji(Tile.Sea)} ${Tile.Sea}`,
							// hint_title: tileManager.tileToEmoji(Tile.Sea),
							// hint_text: Tile.Sea,
							value: this.uiConfig.biomes[Tile.Sea].value > 0,
						},
						{
							type: "switch",
							id: Tile.Spruce,
							hint_title: `${tileManager.tileToEmoji(Tile.Spruce)} ${Tile.Spruce}`,
							// hint_title: tileManager.tileToEmoji(Tile.Spruce),
							// hint_text: Tile.Spruce,
							value: this.uiConfig.biomes[Tile.Spruce].value > 0,
						},
						{
							type: "switch",
							id: Tile.Forest,
							hint_title: `${tileManager.tileToEmoji(Tile.Forest)} ${Tile.Forest}`,
							// hint_title: tileManager.tileToEmoji(Tile.Forest),
							// hint_text: Tile.Forest,
							value: this.uiConfig.biomes[Tile.Forest].value > 0,
						},
						{
							type: "switch",
							id: Tile.Desert,
							hint_title: `${tileManager.tileToEmoji(Tile.Desert)} ${Tile.Desert}`,
							// hint_title: tileManager.tileToEmoji(Tile.Desert),
							// hint_text: Tile.Desert,
							value: this.uiConfig.biomes[Tile.Desert].value > 0,
						},
						{
							type: "switch",
							id: Tile.Mountain,
							hint_title: `${tileManager.tileToEmoji(Tile.Mountain)} ${Tile.Mountain}`,
							// hint_title: tileManager.tileToEmoji(Tile.Mountain),
							// hint_text: Tile.Mountain,
							value: this.uiConfig.biomes[Tile.Mountain].value > 0,
						},
					],
				},
				{
					type: "button",
					id: "apply",
					text: "Apply",
					hint_title: "Apply changes",
					hint_text: "Updates the graphics and available biomes",
					color: this.hasTileManagerChanges ? "#c70036" : "#77777777",
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
					value: this.uiConfig.model,
					options: ModelNames,
				},
				{
					type: "ratio_slider",
					id: "biome_distribution",
					hint_title: "Biome distribution",
					hint_text: "Specify the amount of tiles for each biome",
					values: Object.entries(this.uiConfig.biomes)
						.filter(([tile, { value, color }]) => value > 0)
						.map(([tile, { value, color }]) => ({
							name: tileManager.tileToEmoji(tile as Tile),
							value,
							color,
						})),
				},
				{
					type: "dropdown",
					id: "distribution",
					hint_title: "Distribution",
					hint_text: "How tiles should be positioned",
					value: this.uiConfig.distribution,
					options: DistributionTypes,
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
			({ name }) => name == this.uiConfig.model,
		)!.count;

		const biomeEntries = Object.entries(this.uiConfig.biomes);

		const active = biomeEntries.filter(([, biome]) => biome.value > 0);
		if (active.length === 0) return;

		// If there are more biomes than tiles, clamp
		const minTiles = Math.min(active.length, totalTiles);
		const remainingTiles = totalTiles - minTiles;

		const currentTotal = active.reduce(
			(sum, [, biome]) => sum + biome.value,
			0,
		);

		// Step 1: scale remaining proportionally
		const scaled = active.map(([tile, { value, color }]) => {
			const weight = value / currentTotal;
			const exact = weight * remainingTiles;

			return {
				tile,
				color,
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
			this.uiConfig.biomes[b.tile as Tile].value = b.base + b.value;
		}

		// Step 5: clear inactive ones
		for (const [tile, biome] of biomeEntries) {
			if (biome.value > 0 && !scaled.find((b) => b.tile === tile)) {
				biome.value = 0;
			}
		}
	}

	toggleBiome(biome: Tile, enabled: boolean) {
		this.uiConfig.biomes[biome].value = enabled ? 10 : 0;
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
