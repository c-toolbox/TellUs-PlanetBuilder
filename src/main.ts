import "@/utils/neu";
import "@/utils/storage";
import { setupHtmlDebugControls } from "@/utils/HtmlDebugControls";
import { globalServices } from "@/network/GlobalServices";
import { SceneId } from "./scenes/scenes";

const { renderer, sceneManager } = globalServices;

setupHtmlDebugControls(renderer, sceneManager);

sceneManager.setScene(SceneId.Planet);

globalServices.connectAll();
