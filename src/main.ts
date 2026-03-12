// Ensure URL is available in the global scope before other imports
if (typeof globalThis.URL === "undefined") {
	globalThis.URL = URL;
}

import "@/utils/neu";
import "@/utils/storage";
import "./utils/proxy";

import { globalServices } from "@/network/GlobalServices";
import { SceneKey, sceneManager, scenes } from "./scenes/SceneManager";

globalServices.connectAll();
sceneManager.setScene(scenes[SceneKey.World]);
