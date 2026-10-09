import * as THREE from "three";
import {
	Font,
	FontLoader,
} from "three/examples/jsm/loaders/FontLoader.js";
import latoBlackFontUrl from "@/assets/fonts/Lato/Bold.json?url";

let fontPromise: Promise<Font> | undefined;

function loadFont() {
	fontPromise ??= new Promise<Font>((resolve, reject) => {
		new FontLoader().load(
			latoBlackFontUrl,
			resolve,
			undefined,
			reject,
		);
	});
	return fontPromise;
}

export default class TextLabel extends THREE.Mesh<
	THREE.ShapeGeometry,
	THREE.MeshBasicMaterial
> {
	private readonly size: number;
	private readonly maxWidth: number;
	private text: string;
	private font?: Font;
	private disposed = false;

	constructor(text: string, size: number, maxWidth: number) {
		super(
			new THREE.ShapeGeometry(),
			new THREE.MeshBasicMaterial({
				color: 0xffffff,
				side: THREE.DoubleSide,
				depthWrite: false,
			}),
		);

		this.size = size;
		this.maxWidth = maxWidth;
		this.text = text;
		this.raycast = () => {};
		loadFont().then(
			(font) => {
				if (this.disposed) return;
				this.font = font;
				this.updateGeometry();
			},
			(error) => console.error("Failed to load text font", error),
		);
	}

	setText(text: string) {
		this.text = text;
		if (this.font) this.updateGeometry();
	}

	private updateGeometry() {
		if (!this.font || this.disposed) return;

		this.geometry.dispose();
		this.geometry = new THREE.ShapeGeometry(
			this.font.generateShapes(this.text, this.size),
		);
		this.geometry.computeBoundingBox();
		const bounds = this.geometry.boundingBox;
		if (!bounds) return;

		const width = bounds.max.x - bounds.min.x;
		const height = bounds.max.y - bounds.min.y;
		this.geometry.translate(
			-(bounds.min.x + width / 2),
			-(bounds.min.y + height / 2),
			0,
		);
		this.scale.setScalar(width > this.maxWidth ? this.maxWidth / width : 1);
	}

	dispose() {
		this.disposed = true;
		this.geometry.dispose();
		this.material.dispose();
	}
}