import * as THREE from "three";
import BaseScene from "./BaseScene";
import { TouchId } from "@/network/tuioProtocol";
import { PEN_SIZE } from "@/constants";
import { Color } from "@/utils/colors";
import { Renderer } from "./Renderer";

const colorCycle = [
	Color.Red400,
	Color.Orange400,
	Color.Amber400,
	Color.Yellow300,
	Color.Lime400,
	Color.Green400,
	Color.Emerald400,
	Color.Teal400,
	Color.Cyan400,
	Color.Sky400,
	Color.Blue400,
	Color.Indigo400,
	Color.Violet400,
	Color.Purple400,
	Color.Fuchsia400,
	Color.Pink400,
	Color.Rose400,
];
let currentColorIndex = 0;
export function getNextColor() {
	const color = colorCycle[currentColorIndex % colorCycle.length];
	currentColorIndex++;
	return color;
}

interface TouchState {
	sphereNow: THREE.Mesh;
	spherePrev: THREE.Mesh;
	lastPosition: THREE.Vector3 | null;
}

export class PaintScene extends BaseScene {
	private touchStates: Map<number, TouchState>;
	private touchSphereGeo: THREE.SphereGeometry;
	private touchSphereMat: THREE.MeshBasicMaterial;
	private lineGeo: THREE.CylinderGeometry;
	private lineMeshes: THREE.Mesh[] = [];
	private touchColors: { [touchId: number]: number } = {};

	constructor() {
		super();

		this.init();

		[
			[1, 0, 0],
			[-1, 0, 0],
			[0, 1, 0],
			[0, -1, 0],
			[0, 0, 1],
			[0, 0, -1],
		].forEach((position) =>
			this.addText({
				text: "Touch to draw!",
				color: 0x444444,
				position: new THREE.Vector3(...position),
			})
		);

		this.touchHandler.on("touch", (touchId: TouchId, vector: THREE.Vector3) => {
			this.updateTouchSphere(touchId, vector);
		});
		this.touchHandler.on("remove", (touchId: TouchId) => {
			this.removeTouchSphere(touchId);
			// this.clearLines();
		});
	}

	public setRendererSettings(renderer: Renderer): void {
		// renderer.setClearColor(new THREE.Color(255, 0, 0));
		// renderer.clearColor();
		renderer.outputColorSpace = THREE.SRGBColorSpace;
		renderer.toneMapping = THREE.NoToneMapping;
		renderer.autoClear = false;
	}

	init() {
		this.touchStates = new Map<number, TouchState>();
		this.touchSphereGeo = new THREE.SphereGeometry(PEN_SIZE, 12, 10);
		this.touchSphereMat = new THREE.MeshBasicMaterial({
			color: 0xffffff,
			depthTest: false,
			depthWrite: false,
		});
		this.lineGeo = new THREE.CylinderGeometry(PEN_SIZE, PEN_SIZE, 1, 8, 1);
		this.lineGeo.rotateX(Math.PI / 2); // Make cylinder align with Z axis
		const lineMeshes: THREE.Mesh[] = [];
	}

	updateTouchSphere(id: number, vector: THREE.Vector3) {
		if (!(id in this.touchColors)) {
			this.touchColors[id] = getNextColor();
		}
		this.touchSphereMat.color.setHex(this.touchColors[id]);

		let state = this.touchStates.get(id);
		if (!state) {
			const sphereNow = new THREE.Mesh(
				this.touchSphereGeo,
				this.touchSphereMat.clone()
			);
			this.add(sphereNow);
			const spherePrev = new THREE.Mesh(
				this.touchSphereGeo,
				this.touchSphereMat.clone()
			);
			this.add(spherePrev);

			state = { sphereNow, spherePrev, lastPosition: null };
			this.touchStates.set(id, state);
		}

		// Convert pitch/yaw to direction and get new position
		const newPosition = vector.multiplyScalar(5);
		state.sphereNow.position.copy(newPosition);

		// If we have a previous position, create a line between them
		if (state.lastPosition) {
			state.spherePrev.position.copy(state.lastPosition);

			const line = this.createLine(state.lastPosition, newPosition);
			this.add(line);
			console.log("Add", line.position);
			this.lineMeshes.push(line);
		}

		// Update last position
		state.lastPosition = newPosition.clone();
	}

	removeTouchSphere(id: number) {
		const state = this.touchStates.get(id);
		if (state) {
			this.remove(state.sphereNow);
			this.remove(state.spherePrev);
			this.touchStates.delete(id);
		}
	}

	clearLines() {
		// Clear all lines
		this.lineMeshes.forEach((line) => this.remove(line));
		this.lineMeshes.length = 0;
	}

	createLine(start: THREE.Vector3, end: THREE.Vector3): THREE.Mesh {
		const line = new THREE.Mesh(this.lineGeo, this.touchSphereMat.clone());
		const direction = end.clone().sub(start);
		const length = direction.length();

		// Position at midpoint
		line.position.copy(start).add(end).multiplyScalar(0.5);

		// Orient to point from start to end
		line.lookAt(end);
		line.scale.set(1, 1, length);

		return line;
	}

	postRender() {
		this.clearLines();
	}
}
