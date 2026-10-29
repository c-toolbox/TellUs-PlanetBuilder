import * as THREE from "three";
import {
	Font,
	FontLoader,
} from "three/examples/jsm/loaders/FontLoader.js";
import latoBoldFontUrl from "@/assets/fonts/Lato/Bold.json?url";

let fontPromise: Promise<Font> | undefined;

function loadFont() {
	fontPromise ??= new Promise<Font>((resolve, reject) => {
		new FontLoader().load(
			latoBoldFontUrl,
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
	private text: string;
	private font?: Font;
	private disposed = false;

	constructor(
		text: string,
		size: number,
		private readonly alignment: "center" | "left" = "center",
		private readonly maxWidth = Infinity,
	) {
		super(
			new THREE.ShapeGeometry(),
			new THREE.MeshBasicMaterial({
				color: 0xffffff,
				side: THREE.FrontSide,
			}),
		);

		this.size = size;
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
			-(bounds.min.x + (this.alignment === "center" ? width / 2 : 0)),
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
