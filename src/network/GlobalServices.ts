import { TouchHandler } from "./TouchHandler";
import { SocketUi } from "./socket_ui/SocketUi";
import { SceneManager } from "@/scenes/SceneManager";
import { scenes } from "@/scenes/scenes";
import { Renderer } from "@/rendering/Renderer";

class GlobalServices {
	readonly touchHandler = new TouchHandler();
	readonly uiSocket = new SocketUi();
	private rendererInstance?: Renderer;
	private sceneManagerInstance?: SceneManager;

	get renderer(): Renderer {
		return this.rendererInstance ??= new Renderer();
	}

	get sceneManager(): SceneManager {
		return this.sceneManagerInstance ??= new SceneManager(scenes, this.renderer);
	}

	connectAll() {
		this.touchHandler.connect();
		this.uiSocket.connect();
	}
}

export const globalServices = new GlobalServices();
