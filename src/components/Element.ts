import * as THREE from "three";
import { CSS3DObject } from "three/examples/jsm/renderers/CSS3DRenderer";
import html from "./element.html?raw";

export class Element extends CSS3DObject {
	constructor(id: string, x: number, y: number, z: number, ry: number) {
		// Parse HTML template into a DOM node
		const template = document.createElement("template");
		template.innerHTML = html.trim();
		const element = template.content.firstElementChild as HTMLElement;
		element.style.width = "480px";
		element.style.height = "360px";

		// Call parent constructor with DOM node
		super(element);

		// Optional: position/rotation logic
		this.position.set(x, y, z);
		this.rotation.y = ry;

		// You can attach listeners directly
		const button = element.querySelector("button");
		button?.addEventListener("click", () => {
			console.log("Button clicked!");
			const p = element.querySelector("p");
			if (p && p.textContent?.includes("Hello world!")) {
				p.style.color = `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0")}`;
			}
		});

		// const iframe = document.createElement("iframe");
		// iframe.style.width = "480px";
		// iframe.style.height = "360px";
		// iframe.style.border = "white solid 10px";
		// iframe.src = `https://www.youtube.com/embed/${id}?rel=0`;
		// div.appendChild(iframe);

		/* Test */

		const geometry = new THREE.PlaneGeometry(480, 360);
		const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, opacity: 0.1, transparent: true });
		const mesh = new THREE.Mesh(geometry, material);
		this.add(mesh);
	}
}
