import BaseScene from "../BaseScene";
import { Renderer } from "../Renderer";

import backgroundAsset from "@/assets/square.png";
import { Fish, Shark } from "./Fish";
import { Color, GoogleColor } from "@/utils/colors";
import { getRandomColor } from "@/utils/functions";
import { PLAYER_DISTANCE } from "@/constants";

export default class BoidsScene extends BaseScene {
	// private fishes: Fish[][];
	private fishes: Fish[];
	private sharks: Shark[];

	constructor() {
		super();

		this.addBackground(backgroundAsset, Color.Slate900);

		this.fishes = [];
		this.sharks = [];

		// for (let g = 0; g < 3; g++) {
		// 	const radius = PLAYER_DISTANCE - 0.1 * g;
		// 	const group = [];
		// 	for (let i = 0; i < 100; i++) {
		// 		const fish = new Fish(radius, getRandomColor());
		// 		group.push(fish);
		// 		this.playerGroup.add(fish);
		// 	}
		// 	this.fishes.push(group);
		// }

		const radius = PLAYER_DISTANCE;
		for (let i = 0; i < 300; i++) {
			const fish = new Fish(radius, getRandomColor());
			this.fishes.push(fish);
			this.playerGroup.add(fish);
		}

		for (let i = 0; i < 1; i++) {
			const shark = new Shark(radius, Color.White);
			this.sharks.push(shark);
			this.playerGroup.add(shark);
		}
	}

	public setRendererSettings(renderer: Renderer): void {
		renderer.setClearColor(Color.Slate950);
	}

	// On entering scene
	override onEnter(renderer: Renderer) {
		console.log("BoidsScene active");
	}

	// On exiting scene
	override onExit(renderer: Renderer) {
		console.log("BoidsScene exiting");
	}

	update(delta: number) {
		// this.fishes.forEach((group) => {
		// 	group.forEach((fish) => fish.applyBoids(group));
		// 	group.forEach((fish) => fish.update());
		// });

		this.fishes.forEach((fish) => fish.applyBoids(this.fishes, this.sharks));

		this.sharks.forEach((shark) => shark.applyBoids(this.sharks, this.fishes));

		this.fishes.forEach((fish) => fish.update());
		this.sharks.forEach((shark) => shark.update());
	}
}
