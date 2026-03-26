import * as THREE from "three";
import BaseScene from "../BaseScene";
import { Renderer } from "../Renderer";

import { Fish } from "./Fish";
import { Color, GoogleColor } from "@/utils/colors";
import { TouchPoint } from "@/network/TouchPoint";
import { UiConfigEvent } from "@/network/uiProtocol";
import { SceneKey } from "../SceneManager";
import backgroundAsset from "@/assets/square.png";

const FISH_COLORS = [
	GoogleColor["Red 600"],
	GoogleColor["Pink 600"],
	GoogleColor["Purple 500"],
	GoogleColor["Deep Purple 500"],
	GoogleColor["Indigo 500"],
	GoogleColor["Blue 500"],
	GoogleColor["Light Blue 600"],
	GoogleColor["Cyan 600"],
	GoogleColor["Teal 600"],
	GoogleColor["Green 700"],
	GoogleColor["Light Green 700"],
	GoogleColor["Lime 700"],
	GoogleColor["Yellow 600"],
	GoogleColor["Amber 600"],
	GoogleColor["Orange 600"],
	GoogleColor["Deep Orange 600"],
];

export interface BoidsUiConfig {
	fishCount: number;
	colorAffinity: boolean;
	sightRadius: number;
	neighborRadius: number;
	separationRadius: number;
	fearRadius: number;
	cohesionWeight: number;
	alignmentWeight: number;
	separationWeight: number;
	fearWeight: number;
	baseTurn: number;
	panicTurn: number;
	calmSpeed: number;
	panicSpeed: number;
}
type BoidsConfigKey = keyof BoidsUiConfig;

export default class BoidsScene extends BaseScene {
	protected fishGroup: THREE.Group;
	private fishes: Fish[];

	private boidsConfig: BoidsUiConfig = {
		fishCount: 250,
		colorAffinity: false,
		sightRadius: 0.35,
		neighborRadius: 0.16,
		separationRadius: 0.09,
		fearRadius: 0.3,
		cohesionWeight: 0.25,
		alignmentWeight: 0.07,
		separationWeight: 0.35,
		fearWeight: 1.5,
		baseTurn: 0.06,
		panicTurn: 0.15,
		calmSpeed: 0.0025,
		panicSpeed: 0.02,
	};

	constructor() {
		super();

		this.addBackground(backgroundAsset, Color.Slate900);

		this.fishGroup = new THREE.Group();
		this.add(this.fishGroup);
		this.fishes = [];

		for (let i = 0; i < this.boidsConfig.fishCount; i++) {
			this.addFish();
		}

		this.add(this.touchHandler.touchGroup);
	}

	public setRendererSettings(renderer: Renderer): void {
		renderer.setClearColor(Color.Slate950);
	}

	override onEnter(renderer: Renderer) {
		console.info("BoidsScene.onEnter");

		this.initializeUi();
		this.sendUiConfig();
	}

	override onExit(renderer: Renderer) {
		console.info("BoidsScene.onExit");

		this.uiSocket.removeAllListeners();
	}

	update(delta: number) {
		// Check if config.fishCount has changed and add/remove fish
		this.syncFishCount();

		const touchPoints = this.touchHandler.touchGroup.children as TouchPoint[];

		this.fishes.forEach((fish) => fish.applyBoids(this.fishes, touchPoints));
		this.fishes.forEach((fish) => fish.update());
	}

	/* Fish */

	private addFish() {
		const index = this.fishes.length;

		// Create a set of colors that this fish likes to be near
		const friendlyColors = [
			FISH_COLORS[(index + 0) % FISH_COLORS.length],
			FISH_COLORS[(index + 1) % FISH_COLORS.length],
			FISH_COLORS[(index + 2) % FISH_COLORS.length],
			FISH_COLORS[(index + 3) % FISH_COLORS.length],
			FISH_COLORS[(index + 4) % FISH_COLORS.length],
		];
		const myColor = friendlyColors[2];
		const distanceFromCenter = 1.0;

		const fish = new Fish(
			this.boidsConfig,
			distanceFromCenter,
			myColor,
			friendlyColors,
		);

		this.fishes.push(fish);
		this.fishGroup.add(fish);
	}

	private removeFish() {
		const fish = this.fishes.pop();
		if (fish) {
			this.fishGroup.remove(fish);
			fish.geometry.dispose();
			fish.material.dispose();
		}
	}

	private syncFishCount() {
		const target = this.boidsConfig.fishCount;
		const current = this.fishes.length;

		// Add fish
		if (target > current) {
			for (let i = current; i < target; i++) {
				this.addFish();
			}
		}

		// Remove fish
		if (target < current) {
			const removeCount = current - target;

			for (let i = 0; i < removeCount; i++) {
				this.removeFish();
			}
		}
	}

	/* Socket UI */

	initializeUi() {
		super.initializeUi();

		const configKeys: BoidsConfigKey[] = [
			"fishCount",
			"colorAffinity",
			"sightRadius",
			"neighborRadius",
			"separationRadius",
			"fearRadius",
			"cohesionWeight",
			"alignmentWeight",
			"separationWeight",
			"fearWeight",
			"baseTurn",
			"panicTurn",
			"calmSpeed",
			"panicSpeed",
		];

		configKeys.forEach((key) => this.bindUiConfigKey(this.boidsConfig, key));
	}

	sendUiConfig() {
		this.uiSocket.send(this.uiConfig);
	}

	get uiConfig(): UiConfigEvent {
		return {
			type: "config",
			title: "Boids",
			elements: [
				{
					type: "dropdown",
					id: "scene",
					hint_title: "Scene",
					hint_text: "Switch to a different scene",
					value: SceneKey.Boids,
					options: Object.values(SceneKey),
				},

				{
					type: "hr",
					hint_title: "Boids settings",
				},
				{
					type: "slider",
					id: "fishCount",
					hint_title: "Fish count",
					hint_text: "The number of fish in the globe",
					value: this.boidsConfig.fishCount,
					min: 1,
					max: 500,
					step: 1,
				},
				{
					type: "switch",
					id: "colorAffinity",
					hint_title: "Color affinity",
					hint_text: "Fish prefer to flock with others of similar color.",
					value: this.boidsConfig.colorAffinity,
				},

				{
					type: "hr",
					hint_title: "Behavior",
				},
				{
					type: "grid",
					columns: 2,
					elements: [
						{
							type: "slider",
							id: "sightRadius",
							hint_title: "Sight radius",
							hint_text: "How far a fish can see and react to others.",
							value: this.boidsConfig.sightRadius,
							min: 0.05,
							max: 1,
							step: 0.01,
						},
						{
							type: "slider",
							id: "neighborRadius",
							hint_title: "Neighbor radius",
							hint_text: "Range for cohesion and alignment.",
							value: this.boidsConfig.neighborRadius,
							min: 0.05,
							max: 0.5,
							step: 0.01,
						},
						{
							type: "slider",
							id: "separationRadius",
							hint_title: "Separation radius",
							hint_text: "Minimum distance fish try to keep from each other.",
							value: this.boidsConfig.separationRadius,
							min: 0.01,
							max: 0.2,
							step: 0.005,
						},
						{
							type: "slider",
							id: "fearRadius",
							hint_title: "Fear radius",
							hint_text: "How close a touch must be to scare nearby fish.",
							value: this.boidsConfig.fearRadius,
							min: 0.05,
							max: 0.6,
							step: 0.01,
						},
					],
				},

				{
					type: "hr",
					hint_title: "Forces",
				},
				{
					type: "grid",
					columns: 2,
					elements: [
						{
							type: "slider",
							id: "cohesionWeight",
							hint_title: "Cohesion",
							hint_text: "How strongly fish are drawn toward nearby groups.",
							value: this.boidsConfig.cohesionWeight,
							min: 0,
							max: 1,
							step: 0.01,
						},
						{
							type: "slider",
							id: "alignmentWeight",
							hint_title: "Alignment",
							hint_text:
								"How strongly fish match the direction of nearby fish.",
							value: this.boidsConfig.alignmentWeight,
							min: 0,
							max: 0.5,
							step: 0.01,
						},
						{
							type: "slider",
							id: "separationWeight",
							hint_title: "Separation",
							hint_text: "How strongly fish avoid crowding each other.",
							value: this.boidsConfig.separationWeight,
							min: 0,
							max: 1,
							step: 0.01,
						},
						{
							type: "slider",
							id: "fearWeight",
							hint_title: "Fear",
							hint_text: "How strongly fish flee from touches.",
							value: this.boidsConfig.fearWeight,
							min: 0,
							max: 3,
							step: 0.05,
						},
					],
				},

				{
					type: "hr",
					hint_title: "Movement",
				},
				{
					type: "grid",
					columns: 2,
					elements: [
						{
							type: "slider",
							id: "baseTurn",
							hint_title: "Base turn",
							hint_text: "How quickly fish turn when calm.",
							value: this.boidsConfig.baseTurn,
							min: 0.01,
							max: 0.2,
							step: 0.005,
						},
						{
							type: "slider",
							id: "panicTurn",
							hint_title: "Panic turn",
							hint_text: "How sharply fish turn when scared.",
							value: this.boidsConfig.panicTurn,
							min: 0.05,
							max: 0.4,
							step: 0.005,
						},
						{
							type: "slider",
							id: "calmSpeed",
							hint_title: "Calm speed",
							hint_text: "Normal cruising speed of fish.",
							value: this.boidsConfig.calmSpeed,
							min: 0.0005,
							max: 0.01,
							step: 0.0001,
						},
						{
							type: "slider",
							id: "panicSpeed",
							hint_title: "Panic speed",
							hint_text: "Maximum speed when fleeing.",
							value: this.boidsConfig.panicSpeed,
							min: 0.005,
							max: 0.05,
							step: 0.001,
						},
					],
				},
			],
		};
	}
}
