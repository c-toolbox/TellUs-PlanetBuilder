import { TileBrush } from "./TileBrush";
import { TouchInteraction } from "@/network/TouchInteraction";
import BackgroundSphere from "@/components/BackgroundSphere";
import * as THREE from "three";
import BaseScene from "@/scenes/BaseScene";
import { SceneId, scenes } from "@/scenes/scenes";
import { Renderer } from "@/rendering/Renderer";

import { TileMesh } from "@/scenes/world/TileMesh";
import { TouchId } from "@/network/tuioProtocol";
import { Tile, tileManager, Tiles } from "@/scenes/world/TileManager";
import { UiConfigEvent } from "@/network/socket_ui/protocol";
import { Polyhedra } from "@/scenes/world/Polyhedra";
import { ORIGIN } from "@/constants";
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

interface SaveState {
	id: string;
	description: string;
	config: WorldUiConfig;
	tiles: Tile[];
}

import backgroundAsset from "@/assets/backgrounds/globe/truecolor.png";

export default class WorldScene extends BaseScene {
	private globe: Polyhedra | null = null;
	private activePolyhedraModel: ModelName | null = null;

	private saveCount: number = 0;
	private saveStates: SaveState[] = [];
	private saveStateListeners = new Map<string, (...args: any[]) => void>();
	private planetDirty: boolean = true;
	private readonly raycaster = new THREE.Raycaster();
	private tileMeshes: TileMesh[] = [];
	private tileInteraction?: TouchInteraction;
	private readonly tileBrushes = new Map<TouchId, TileBrush>();
	private readonly previousDirections = new Map<TouchId, THREE.Vector3>();
	private targetCameraQuaternion: THREE.Quaternion = new THREE.Quaternion();
	private cameraRotationSmoothing: number = 0.12;

	private worldConfig: WorldUiConfig = {
		model: "△ 60",
		// model: "⭔ 1002",
		tileEdge: "show borders",
		tileTexture: "realistic tiles",
		distribution: DistributionTypes[0],
		autoGenerate: false,
		enabledBiomes: {
			[Tile.None]: false,
			[Tile.Snow]: true,
			[Tile.Ocean]: true,
			[Tile.Taiga]: true,
			[Tile.Forest]: true,
			[Tile.Savanna]: false,
			[Tile.Desert]: true,
			[Tile.Mountain]: false,
		},
		biomeCount: {
			[Tile.None]: 0,
			[Tile.Snow]: 6,
			[Tile.Ocean]: 70,
			[Tile.Taiga]: 10,
			[Tile.Forest]: 20,
			[Tile.Savanna]: 0,
			[Tile.Desert]: 4,
			[Tile.Mountain]: 0,
		},
		rotationMode: false,
		edgeWidth: 0.005,
		edgeColor: "#000000",
	};

	constructor() {
		super();

		// Lighting
		const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 0.9);
		this.add(hemi);
		const dir = new THREE.DirectionalLight(0xffffff, 0.6);
		dir.position.set(5, 10, 7);
		this.add(dir);
	}

	public applyRendererSettings(renderer: Renderer): void {
		super.applyRendererSettings(renderer);
		renderer.outputColorSpace = THREE.SRGBColorSpace;
		renderer.toneMapping = THREE.NoToneMapping;
	}

	createPlanet() {
		tileManager.refreshNoiseSeed();

		// Find model from config
		const polyhedra = PolyhedraModels.find(
			({ name }) => name == this.worldConfig.model,
		);
		if (!polyhedra) {
			return console.error(`Could not find model: '${this.worldConfig.model}'`);
		}

		this.activePolyhedraModel = polyhedra.name;

		// Remove existing globe
		this.tileMeshes = [];
		if (this.globe) {
			this.remove(this.globe.vertexGroup);
			this.remove(this.globe.edgeGroup);
			this.remove(this.globe.faceGroup);
		}

		// Create new globe
		this.globe = new Polyhedra({
			...polyhedra.model,
			edgeSize: this.worldConfig.edgeWidth,
			edgeColor: this.worldConfig.edgeColor,
		});

		// Add Polyhedra groups to scene
		this.add(this.globe.vertexGroup);
		this.add(this.globe.edgeGroup);
		this.add(this.globe.faceGroup);
		this.tileMeshes = this.globe.tileMeshes;
		if (this.tileInteraction) this.unregisterTouchInteraction(this.tileInteraction);
		this.tileInteraction = this.registerTouchInteraction(new TouchInteraction(this.globe.faceGroup, {
			enabled: () => !this.worldConfig.rotationMode,
		})).on("click", ({ touchId, direction }) => this.handleRaycast(touchId, direction, "click"));

		// Handle invisible tiles
		if (this.worldConfig.tileTexture === "invisible tiles") {
			this.remove(this.globe.faceGroup);
		}

		this.populatePlanetTiles();
	}

	populatePlanetTiles() {
		if (!this.globe) return;

		const tilePositions = this.globe.faceGroup.children.map(
			(mesh) => mesh.position,
		);

		const tiles = tileManager.populateTiles(
			tilePositions,
			this.worldConfig.biomeCount,
		);
		this.globe.tileMeshes.forEach((tileMesh, index) => {
			tileMesh.setTile(tiles[index]);
		});

		this.updateEdgeVisibility();

		this.markDirty();
	}

	clearPlanetTiles() {
		if (!this.globe) return;
		this.globe.tileMeshes.forEach((tileMesh, index) => {
			tileMesh.setTile(Tile.None);
		});

		this.updateEdgeVisibility();

		this.markDirty();
	}

	updateEdgeVisibility() {
		if (!this.globe) return;
		this.globe.tileMeshes.forEach((tileMesh) => {
			tileMesh.neighbors.forEach(({ mesh, edgeIndex }) => {
				this.toggleEdge(
					edgeIndex,
					tileMesh.tile == mesh.tile && mesh.tile != Tile.None,
				);
			});
		});
	}

	toggleEdge(edgeIndex: number, sameEdge: boolean) {
		if (!this.globe) return;
		switch (this.worldConfig.tileEdge) {
			case "hide all":
				return this.globe.setEdgeVisible(edgeIndex, false);
			case "show all":
				return this.globe.setEdgeVisible(edgeIndex, true);
			case "show borders":
				return this.globe.setEdgeVisible(edgeIndex, !sameEdge);
		}
	}

	// On entering scene
	override onSceneEnter(renderer: Renderer) {
		this.renderer = renderer;
		this.targetCameraQuaternion.copy(renderer.projectionCamera.quaternion);
		this.previousDirections.clear();
		super.onSceneEnter(renderer);

		this.add(new BackgroundSphere(backgroundAsset, 2));

		// Set tileManager variables
		tileManager.worldConfig = this.worldConfig;

		this.redistributeBiomes();
		this.createPlanet();
	}

	// On exiting scene
	override onSceneExit(renderer: Renderer) {
		super.onSceneExit(renderer);
		this.tileBrushes.forEach((brush) => brush.dispose());
		this.tileBrushes.clear();
		this.previousDirections.clear();
		if (this.tileInteraction) this.unregisterTouchInteraction(this.tileInteraction);
		this.tileInteraction = undefined;

		this.clear();
		this.globe = null;
		this.activePolyhedraModel = null;
		this.tileMeshes = [];
	}

	protected override onTouch(touchId: TouchId, vector: THREE.Vector3) {
		if (this.worldConfig.rotationMode) {
			this.handleCameraMovement(touchId);
			return;
		}
		this.handleRaycast(touchId, vector, "touch");
	}

	protected override onRemove(touchId: TouchId) {
		this.tileBrushes.get(touchId)?.dispose();
		this.tileBrushes.delete(touchId);
		this.previousDirections.delete(touchId);
	}

	handleRaycast(
		touchId: TouchId,
		vector: THREE.Vector3,
		type: "touch" | "click",
	) {
		this.raycaster.set(ORIGIN, vector);

		const touchPoint = this.touchHandler.getTouchPoint(touchId);
		if (!touchPoint || this.worldConfig.rotationMode) return;
		let brush = this.tileBrushes.get(touchId);
		if (!brush) {
			brush = new TileBrush(touchPoint);
			this.tileBrushes.set(touchId, brush);
		}

		const intersects = this.raycaster.intersectObjects(this.tileMeshes, true);
		if (intersects.length > 0) {
			const tileMesh = intersects[0].object as TileMesh;
			if (tileMesh) {
				if (type == "touch" && brush.tile == Tile.None) {
					brush.setTile(tileMesh.tile);
				} else if (type == "click") {
					brush.setTile(tileManager.getNextTile(tileMesh.tile));
				}

				if (tileMesh.tile != brush.tile) {
					tileMesh.setTile(brush.tile);
					this.markDirty();
					this.sendSocketUiConfig();
				}

				if (this.worldConfig.tileEdge == "show borders") {
					tileMesh.neighbors.forEach(({ mesh, edgeIndex }) => {
						this.toggleEdge(
							edgeIndex,
							tileMesh.tile == mesh.tile && mesh.tile != Tile.None,
						);
					});
				}

				if (this.worldConfig.autoGenerate) {
					const counts = this.getTileCount();
					Object.entries(counts).forEach(([tile, count]) => {
						this.worldConfig.biomeCount[tile as Tile] = count;
					});
				}
			}
		}
	}

	private handleCameraMovement(touchId: TouchId) {
		const current = this.touchHandler.getCameraLocalDirection(touchId);
		if (!current || !this.renderer) return;
		const previous = this.previousDirections.get(touchId);
		if (previous) {
			const rotation = new THREE.Quaternion().setFromUnitVectors(previous, current).invert();
			this.targetCameraQuaternion.multiply(rotation).normalize();
		}
		this.previousDirections.set(touchId, current);
	}

	update(delta: number) {

		// Smooth camera rotation towards target using quaternion slerp
		if (this.renderer && this.worldConfig.rotationMode) {
			this.renderer.projectionCamera.quaternion.slerp(
				this.targetCameraQuaternion,
				this.cameraRotationSmoothing,
			);
		}

		// const time = ((this as any).time ?? 0) + (delta / 1000) * 5;
		// (this as any).time = time;

		// this.tileMeshes.slice(0,1).forEach((mesh) => {
		// 	const tileMesh = mesh as TileMesh;
		// 	const scale = 1 + Math.sin((this as any).time) * 0.5;
		// 	tileMesh.position.copy(tileMesh.center.clone().multiplyScalar(scale));
		// 	// tileMesh.scale.set(scale, scale, scale);
		// });
	}

	/* Socket UI */

	registerSocketUiListeners() {
		super.registerSocketUiListeners();
		this.uiSocket.on("scene", (id: SceneId) => {
			this.sceneManager.setScene(id);
		});

		this.uiSocket.on("rotation_mode", (value: boolean) => {
			this.worldConfig.rotationMode = value;
			this.previousDirections.clear();
			if (this.renderer) this.targetCameraQuaternion.copy(this.renderer.projectionCamera.quaternion);
			this.sendSocketUiConfig();
		});

		this.uiSocket.on("auto_generate", (value: boolean) => {
			this.worldConfig.autoGenerate = value;
			if (value) {
				this.createPlanet();
			}
			this.sendSocketUiConfig();
		});

		this.uiSocket.on("new_planet", () => {
			this.createPlanet();
			this.sendSocketUiConfig();
		});

		this.uiSocket.on("clear_planet", () => {
			this.worldConfig.autoGenerate = false;
			this.clearPlanetTiles();
			this.sendSocketUiConfig();
		});

		this.uiSocket.on("tile_edges", (value: TileEdge) => {
			this.worldConfig.tileEdge = value;
			this.updateEdgeVisibility();
			this.markDirty();
			this.sendSocketUiConfig();
		});

		this.uiSocket.on("tile_texture", (value: TileTexture) => {
			if (!this.globe) return;
			this.worldConfig.tileTexture = value;
			this.markDirty();
			this.sendSocketUiConfig();

			// Update textures
			this.globe.tileMeshes.forEach((tileMesh) =>
				tileMesh.setTile(tileMesh.tile),
			);

			// Handle invisible tiles
			if (value === "invisible tiles") {
				this.remove(this.globe.faceGroup);
			} else {
				if (!this.children.includes(this.globe.faceGroup)) {
					this.add(this.globe.faceGroup);
				}
			}
		});

		this.uiSocket.on("model", (value: ModelName) => {
			this.worldConfig.model = value;
			this.redistributeBiomes();
			this.sendSocketUiConfig();
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
			this.redistributeBiomes();
			this.sendSocketUiConfig();
		});

		this.uiSocket.on("biome_distribution", (values: number[]) => {
			const activeBiomes = Object.entries(
				this.worldConfig.enabledBiomes,
			).filter(([tile, enabled]) => enabled);

			console.assert(
				activeBiomes.length === values.length,
				"Biome slider value count mismatch",
				{ activeBiomes: activeBiomes.length, values: values.length },
			);

			activeBiomes.forEach(([key], i) => {
				this.worldConfig.biomeCount[key as Tile] = values[i];
			});

			if (this.worldConfig.autoGenerate) {
				// this.createPlanet();
				this.populatePlanetTiles();
			}

			this.sendSocketUiConfig();
		});

		this.uiSocket.on("edge_width", (value: number) => {
			this.worldConfig.edgeWidth = value;
			if (this.globe) this.globe.setEdgeSize(value);
			this.markDirty();
			this.sendSocketUiConfig();
		});

		this.uiSocket.on("edge_color", (color: string) => {
			this.worldConfig.edgeColor = color;
			if (this.globe) this.globe.setEdgeColor(color);
			this.markDirty();
			this.sendSocketUiConfig();
		});

		this.uiSocket.on("save_planet", () => {
			if (this.planetDirty) {
				this.savePlanet();
				this.sendSocketUiConfig();
			}
		});
	}


	private clearSaveStateListeners() {
		this.saveStateListeners.forEach((handler, id) => {
			this.uiSocket.off(id, handler);
		});
		this.saveStateListeners.clear();
	}

	private markDirty() {
		this.planetDirty = true;
	}

	private markClean() {
		this.planetDirty = false;
	}

	private registerSaveStateListeners() {
		this.clearSaveStateListeners();

		this.saveStates.forEach((state, index) => {
			const loadId = `load_planet_${index}`;
			const saveId = `save_planet_${index}`;
			const deleteId = `delete_planet_${index}`;

			const loadHandler = () => {
				this.loadPlanet(state);
				this.sendSocketUiConfig();
			};

			const saveHandler = () => {
				if (this.planetDirty) {
					this.savePlanet(index);
					this.sendSocketUiConfig();
				}
			};

			const deleteHandler = () => {
				this.deletePlanet(index);
				this.sendSocketUiConfig();
			};

			this.uiSocket.on(loadId, loadHandler);
			this.uiSocket.on(saveId, saveHandler);
			this.uiSocket.on(deleteId, deleteHandler);

			this.saveStateListeners.set(loadId, loadHandler);
			this.saveStateListeners.set(saveId, saveHandler);
			this.saveStateListeners.set(deleteId, deleteHandler);
		});
	}

	private savePlanet(index?: number) {
		if (!this.globe || !this.activePolyhedraModel) return;
		// Copy worldConfig
		const config = JSON.parse(
			JSON.stringify(this.worldConfig),
		) as WorldUiConfig;

		// Insert settings that may have been changed with autoGenerate off
		config.model = this.activePolyhedraModel;
		const tiles = this.globe.tileMeshes.map((tileMesh) => tileMesh.tile);
		const counts = this.getTileCount();
		Object.entries(counts).forEach(([tile, count]) => {
			config.biomeCount[tile as Tile] = count;
		});

		// Make a description
		const biomeCount = Object.values(counts).filter((value) => value).length;
		const tileCount = Object.values(counts)
			.filter((count) => count > 0)
			.join("/");
		const description = `${config.model}, ${biomeCount} biomes (${tileCount})`;

		// Save into array
		if (index == null) {
			const id = `Planet ${++this.saveCount}`;
			const state: SaveState = { id, config, tiles, description };
			this.saveStates.push(state);
		} else {
			const state = this.saveStates[index];
			if (!state) return;
			state.config = config;
			state.tiles = tiles;
			state.description = description;
		}

		this.markClean();
		this.registerSaveStateListeners();
	}

	private loadPlanet(state: SaveState) {
		// Load config from savestate
		this.worldConfig = JSON.parse(
			JSON.stringify(state.config),
		) as WorldUiConfig;
		tileManager.worldConfig = this.worldConfig;

		// Populate planet tiles
		this.createPlanet();
		if (!this.globe) return;
		this.globe.tileMeshes.forEach((tileMesh, index) => {
			tileMesh.setTile(state.tiles[index]);
		});

		// Update graphics after loading tiles
		this.updateEdgeVisibility();

		this.markClean();
	}

	private deletePlanet(index: number) {
		if (index < 0 || index >= this.saveStates.length) return;
		this.saveStates.splice(index, 1);
		this.registerSaveStateListeners();
	}

	get socketUiConfig(): UiConfigEvent {
		return {
			type: "config",
			title: "Planet builder",
			elements: [
				{
					type: "dropdown",
					id: "scene",
					hint_title: "Scene",
					hint_text: "Switch to a different scene",
					value: SceneId.Planet,
					options: scenes.map((scene) => scene.id),
				},
				{
					type: "switch",
					id: "rotation_mode",
					hint_title: "Rotation mode",
					hint_text: "Disable building and use touch to rotate the globe",
					value: this.worldConfig.rotationMode,
				},

				{
					type: "hr",
					hint_title: "Planet status",
				},
				{
					type: "text",
					hint_title: `Tiles (${this.tileMeshes.length} total)`,
					hint_text: this.tileCountString,
				},

				{
					type: "hr",
					hint_title: "Graphics",
				},
				{
					type: "dropdown",
					id: "tile_edges",
					hint_title: "Tile edges",
					hint_text: "How edges between tiles are displayed",
					value: this.worldConfig.tileEdge,
					options: TileEdges,
				},
				{
					type: "dropdown",
					id: "tile_texture",
					hint_title: "Tile texture",
					hint_text: "Texture used for tiles",
					value: this.worldConfig.tileTexture,
					options: TileTextures,
				},
				{
					type: "grid",
					columns: 2,
					elements: [
						{
							type: "slider",
							id: "edge_width",
							hint_title: "Edge width",
							value: this.worldConfig.edgeWidth,
							min: 0.001,
							max: 0.025,
							step: 0.001,
						},
						{
							type: "color",
							id: "edge_color",
							hint_title: "Edge color",
							value: this.worldConfig.edgeColor,
						},
					],
				},

				{
					type: "hr",
					hint_title: "Planet creation",
				},
				{
					type: "grid",
					columns: 3,
					elements: [
						{
							type: "switch",
							id: Tile.Snow,
							hint_title: `${tileManager.tileToEmoji(Tile.Snow)} ${Tile.Snow}`,
							value: this.worldConfig.enabledBiomes[Tile.Snow],
						},
						{
							type: "switch",
							id: Tile.Ocean,
							hint_title: `${tileManager.tileToEmoji(Tile.Ocean)} ${Tile.Ocean}`,
							value: this.worldConfig.enabledBiomes[Tile.Ocean],
						},
						{
							type: "switch",
							id: Tile.Taiga,
							hint_title: `${tileManager.tileToEmoji(Tile.Taiga)} ${Tile.Taiga}`,
							value: this.worldConfig.enabledBiomes[Tile.Taiga],
						},
						{
							type: "switch",
							id: Tile.Forest,
							hint_title: `${tileManager.tileToEmoji(Tile.Forest)} ${Tile.Forest}`,
							value: this.worldConfig.enabledBiomes[Tile.Forest],
						},
						{
							type: "switch",
							id: Tile.Savanna,
							hint_title: `${tileManager.tileToEmoji(Tile.Savanna)} ${Tile.Savanna}`,
							value: this.worldConfig.enabledBiomes[Tile.Savanna],
						},
						{
							type: "switch",
							id: Tile.Desert,
							hint_title: `${tileManager.tileToEmoji(Tile.Desert)} ${Tile.Desert}`,
							value: this.worldConfig.enabledBiomes[Tile.Desert],
						},
						{
							type: "switch",
							id: Tile.Mountain,
							hint_title: `${tileManager.tileToEmoji(Tile.Mountain)} ${Tile.Mountain}`,
							value: this.worldConfig.enabledBiomes[Tile.Mountain],
						},
					],
				},
				{
					type: "ratio_slider",
					id: "biome_distribution",
					hint_title: "Biome distribution",
					hint_text: "Adjust how many tiles each biome occupies",
					values: Object.entries(this.worldConfig.biomeCount)
						.filter(
							([tile, count]) => this.worldConfig.enabledBiomes[tile as Tile],
						)
						.map(([tile, count]) => ({
							name: Tiles[tile as Tile].emoji,
							value: count,
							color: "#" + Tiles[tile as Tile].color.getHexString(),
						})),
				},
				{
					type: "dropdown",
					id: "model",
					hint_title: "Planet model",
					hint_text: "Defines the planet's shape and number of tiles",
					value: this.worldConfig.model,
					options: ModelNames,
				},
				{
					type: "dropdown",
					id: "distribution",
					hint_title: "Distribution",
					hint_text: "How tiles are arranged across the planet",
					value: this.worldConfig.distribution,
					options: DistributionTypes,
				},
				{
					type: "switch",
					id: "auto_generate",
					hint_title: "Auto-generate planet",
					hint_text: "Automatically creates a new planet when settings change",
					value: this.worldConfig.autoGenerate,
					color: "#c70036",
				},
				{
					type: "button",
					id: "new_planet",
					text: "Generate",
					hint_title: "Generate planet",
					hint_text: "Create a new planet with the current settings",
					color: "#c70036",
				},
				{
					type: "button",
					id: "clear_planet",
					text: "Clear planet",
					hint_title: "Empty planet",
					hint_text: "Create a blank planet with empty tiles",
					color: "#c70036",
				},

				{
					type: "hr",
					hint_title: "Saved planets",
				},
				{
					type: "button",
					id: "save_planet",
					text: "Save",
					hint_title: "Save planet",
					hint_text: "Save the current planet and its layout",
					color: this.planetDirty ? undefined : "#77777777",
				},
				...this.saveStates.map((state, index) => ({
					type: "multi_button" as const,
					buttons: [
						{
							id: `load_planet_${index}`,
							text: "Load",
						},
						{
							id: `save_planet_${index}`,
							text: "Save",
							color: this.planetDirty ? undefined : "#77777777",
						},
						{
							id: `delete_planet_${index}`,
							text: "Delete",
							color: "#c70036",
						},
					],
					hint_title: state.id,
					hint_text: state.description,
				})),
			],
		};
	}

	redistributeBiomes() {
		const totalTiles = PolyhedraModels.find(
			({ name }) => name == this.worldConfig.model,
		)!.count;

		// Only consider active biomes (value > 0)
		const active = Object.entries(this.worldConfig.biomeCount).filter(
			([tile, value]) => this.worldConfig.enabledBiomes[tile as Tile],
		);
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
			this.worldConfig.biomeCount[b.tile as Tile] = b.base + b.value;
		}

		// Step 5: clear inactive ones
		for (const [tile, value] of Object.entries(this.worldConfig.biomeCount)) {
			if (value > 0 && !scaled.find((b) => b.tile === tile)) {
				this.worldConfig.biomeCount[tile as Tile] = 0;
			}
		}

		if (this.worldConfig.autoGenerate) {
			this.createPlanet();
		}
	}

	toggleBiome(biome: Tile, enabled: boolean) {
		const totalTiles = PolyhedraModels.find(
			({ name }) => name == this.worldConfig.model,
		)!.count;

		// const startingAmount = Math.max(1, Math.floor(0.2 * totalTiles));
		this.worldConfig.enabledBiomes[biome] = enabled;
		// this.worldConfig.biomeCount[biome] = enabled ? startingAmount : 0;
		this.worldConfig.biomeCount[biome] = 0;

		// Ensure at least one biome exists
		const allZero = Object.values(this.worldConfig.biomeCount).every(
			(value) => value === 0,
		);
		if (allZero) {
			const candidates = Object.keys(this.worldConfig.biomeCount).filter(
				(tile) => tile !== biome && tile !== Tile.None,
			);
			const fallback =
				candidates[Math.floor(Math.random() * candidates.length)];
			if (fallback !== undefined) {
				this.worldConfig.biomeCount[fallback as Tile] = totalTiles;
			}
		}

		this.redistributeBiomes();
		this.sendSocketUiConfig();
	}

	getTileCount(): Record<Tile, number> {
		const counts = {} as Record<Tile, number>;
		for (const tile of Object.values(Tile)) {
			counts[tile] = 0;
		}

		for (const mesh of this.tileMeshes) {
			const tileMesh = mesh as TileMesh;
			counts[tileMesh.tile]++;
		}

		return counts;
	}

	get tileCountString(): string {
		const counts = this.getTileCount();

		const total = this.tileMeshes.length;

		return Object.entries(counts)
			.filter(([, count]) => count > 0)
			.map(([tile, count]) => {
				const pct = Math.round((count / total) * 100);
				return `- ${tile || "None"}: ${count} (${pct}%)`;
			})
			.join("\n");
	}
}
