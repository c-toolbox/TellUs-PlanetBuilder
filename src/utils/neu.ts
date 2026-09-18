import * as Neutralino from "@neutralinojs/lib";

export const isNeutralino = typeof window.NL_MODE !== "undefined";
const TUIO_EXTENSION_ID = "se.visualiseringscenter.tuio";
const TUIO_SHUTDOWN_EVENT = "tuioShutdown";
const SHUTDOWN_TIMEOUT_MS = 250;

if (isNeutralino) {
  Neutralino.init();
  Neutralino.window.center();
  Neutralino.events.on("windowClose", async () => {
    try {
      await Promise.race([
        Neutralino.extensions.dispatch(TUIO_EXTENSION_ID, TUIO_SHUTDOWN_EVENT),
        new Promise((resolve) => setTimeout(resolve, SHUTDOWN_TIMEOUT_MS)),
      ]);
    } finally {
      await Neutralino.app.exit();
    }
  });
}
