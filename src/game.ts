import Phaser from "phaser";
import { PreloadScene } from "@/scenes/PreloadScene";
import { GameScene } from "@/scenes/GameScene";

export async function Game() {
	const contextCreationConfig = {
		alpha: false,
		depth: false,
		antialias: true,
		premultipliedAlpha: true,
		stencil: true,
		preserveDrawingBuffer: false,
		failIfMajorPerformanceCaveat: false,
		powerPreference: "default",
	};

	const myCustomCanvas = document.createElement("canvas");
	const myCustomContext = myCustomCanvas.getContext(
		"webgl2",
		contextCreationConfig
	);

	myCustomCanvas.id = "myCustomCanvas";
	myCustomCanvas.style = "border: 8px solid green";

	document.body.appendChild(myCustomCanvas);

	const config: Phaser.Types.Core.GameConfig = {
		type: Phaser.WEBGL,
		// width: 3840,
		// height: 2400,
		width: 1920,
		height: 1080,
		mipmapFilter: "LINEAR_MIPMAP_LINEAR",
		roundPixels: false,
		scale: {
			mode: Phaser.Scale.FIT,
		},
		scene: [PreloadScene, GameScene],
		canvas: myCustomCanvas,
		context: myCustomContext as any,
	};

	const game = new Phaser.Game(config);
}
