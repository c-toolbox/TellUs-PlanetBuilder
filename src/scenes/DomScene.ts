import * as THREE from "three";
import BaseScene from "./BaseScene";
import { CSS3DRenderer } from "three/examples/jsm/renderers/CSS3DRenderer";
import { TouchId } from "@/network/tuioProtocol";
import { Element } from "@/components/Element";
import { Renderer } from "./Renderer";
import { UiConfigEvent } from "@/network/uiProtocol";

export default class DomScene extends BaseScene {
	private cssRenderer: CSS3DRenderer;
	private domGroup: THREE.Group;

	constructor() {
		super();

		// --- CSS3D Renderer (for HTML elements) ---
		this.cssRenderer = new CSS3DRenderer();
		this.cssRenderer.setSize(window.innerWidth, window.innerHeight);
		Object.assign(this.cssRenderer.domElement.style, {
			position: "absolute",
			left: "0",
			top: "0",
		});

		// --- Add CSS3D elements ---
		this.domGroup = new THREE.Group();
		this.domGroup.add(new Element("SJOz3qjfQXU", 0, 0, 300, 0));
		this.domGroup.add(new Element("Y2-xZ-1HE-Q", 300, 0, 0, Math.PI / 2));
		this.domGroup.add(new Element("IrydklNpcFI", 0, 0, -300, Math.PI));
		this.domGroup.add(new Element("9ubytEsCaS0", -300, 0, 0, -Math.PI / 2));
		this.add(this.domGroup);
	}

	onWindowResize(): void {
		this.cssRenderer.setSize(window.innerWidth, window.innerHeight);
	}

	render(renderer: Renderer): void {
		this.cssRenderer.render(this, renderer.debugCamera);
		renderer.projectionScene.cubeCamera.update(renderer, this);
	}

	protected handleRaycast(
		touchId: TouchId,
		vector: THREE.Vector3,
		type: "touch" | "click"
	): void {
		// const raycaster = new THREE.Raycaster(ORIGIN, vector);
		// const intersects = raycaster.intersectObjects(this.domGroup.children, true);
		// if (intersects.length > 0) {
		// 	const point = intersects[0].point.clone();
		// 	const projected = point.clone().project(camera);
		// 	const x = (projected.x * 0.5 + 0.5) * window.innerWidth;
		// 	const y = (-projected.y * 0.5 + 0.5) * window.innerHeight;
		// 	const element = document.elementFromPoint(x, y);
		// 	if (element) {
		// 		element.dispatchEvent(
		// 			new PointerEvent("pointerdown", {
		// 				pointerId: 0,
		// 				bubbles: true,
		// 				cancelable: true,
		// 				clientX: x,
		// 				clientY: y,
		// 			})
		// 		);
		// 	}
		// } else {
		// 	console.log("No results");
		// }
	}

	setSize(size: number): void {
		this.cssRenderer.setSize(size, size);
	}

	get uiConfig(): UiConfigEvent {
		return {
			type: "config",
			title: "Dom",
			elements: [],
		};
	}
}
