import { OmniSocket } from "@/network/OmniSocket";
import { TouchHandler } from "@/network/TouchHandler";

class GlobalServices {
	omniSocket: OmniSocket;
	touchHandler: TouchHandler;

	constructor() {
		this.omniSocket = new OmniSocket();
		this.touchHandler = new TouchHandler();
	}

	connectAll() {
		this.omniSocket.connect();
		this.touchHandler.connect();
	}
}

// Export a singleton instance
export const globalServices = new GlobalServices();
