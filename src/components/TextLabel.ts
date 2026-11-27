import * as THREE from "three";
import {
	Font,
	FontLoader,
} from "three/examples/jsm/loaders/FontLoader.js";
import blackFontUrl from "@/assets/fonts/Lato/Black.json?url";
import boldFontUrl from "@/assets/fonts/Lato/Bold.json?url";
import lightFontUrl from "@/assets/fonts/Lato/Light.json?url";
import regularFontUrl from "@/assets/fonts/Lato/Regular.json?url";
import thinFontUrl from "@/assets/fonts/Lato/Thin.json?url";

export type FontWeight = "Thin" | "Light" | "Regular" | "Bold" | "Black";

const fontUrls: Record<FontWeight, string> = {
	Thin: thinFontUrl,
	Light: lightFontUrl,
	Regular: regularFontUrl,
	Bold: boldFontUrl,
	Black: blackFontUrl,
};
const fontPromises = new Map<FontWeight, Promise<Font>>();

function loadFont(weight: FontWeight) {
	let promise = fontPromises.get(weight);
	if (!promise) {
		promise = new Promise<Font>((resolve, reject) => {
			new FontLoader().load(fontUrls[weight], resolve, undefined, reject);
		});
		fontPromises.set(weight, promise);
	}
	return promise;
}

export default class TextLabel extends THREE.Mesh<
	THREE.ShapeGeometry,
	THREE.MeshBasicMaterial
> {
	private readonly size: number;
	private text: string;
	private font?: Font;
	private disposed = false;
	/** Half width and height of the text after scaling, in parent units. */
	readonly halfExtents = new THREE.Vector2();
	onLayout?: () => void;

	constructor(
		text: string,
		size: number,
		private readonly alignment: "center" | "left" = "center",
		private readonly maxWidth = Infinity,
		/** "baseline" keeps the text's baseline at y=0 so glyphs with descenders don't shift it. */
		private readonly verticalAnchor: "center" | "baseline" = "center",
		weight: FontWeight = "Bold",
	) {
		super(
			new THREE.ShapeGeometry([]),
			new THREE.MeshBasicMaterial({
				color: 0xffffff,
				side: THREE.FrontSide,
			}),
		);

		this.size = size;
		this.text = text;
		this.raycast = () => {};
		loadFont(weight).then(
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
			this.verticalAnchor === "center" ? -(bounds.min.y + height / 2) : 0,
			0,
		);
		this.scale.setScalar(width > this.maxWidth ? this.maxWidth / width : 1);
		this.halfExtents.set(width, height).multiplyScalar(this.scale.x / 2);
		this.onLayout?.();
	}

	dispose() {
		this.disposed = true;
		this.geometry.dispose();
		this.material.dispose();
	}
}
