import { OmniSocket } from "@/network/OmniSocket";
import { TouchHandler } from "@/network/TouchHandler";
import { UiSocket } from "./UiSocket";

class GlobalServices {
	omniSocket: OmniSocket;
	touchHandler: TouchHandler;
	uiSocket: UiSocket;

	constructor() {
		this.omniSocket = new OmniSocket();
		this.touchHandler = new TouchHandler();
		this.uiSocket = new UiSocket();
	}

	connectAll() {
		this.omniSocket.connect();
		this.touchHandler.connect();
		this.uiSocket.connect();
	}
}

// Export a singleton instance
export const globalServices = new GlobalServices();
