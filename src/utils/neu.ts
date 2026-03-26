import * as Neutralino from "@neutralinojs/lib";

export const isNeutralino = !!window.NL_TOKEN;

if (isNeutralino) {
  Neutralino.init();
  Neutralino.window.center();
}
