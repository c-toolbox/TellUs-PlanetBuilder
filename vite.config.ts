import { defineConfig } from "vite";
import checker from "vite-plugin-checker";
import tsconfigPaths from "vite-tsconfig-paths";
import neuInject from "./neutralino/neu-inject";
import packageWindows from "./neutralino/package-windows";
import { title, description } from "./neutralino/app-config";

export default defineConfig({
	base: "./",
	root: "src",
	plugins: [
		tsconfigPaths(),
		checker({ typescript: true }),
		{
			name: "app-title",
			transformIndexHtml: (html) => html
				.replaceAll("%APP_TITLE%", () => escapeHtml(title))
				.replaceAll("%APP_DESCRIPTION%", () => escapeHtml(description)),
		},
		neuInject(),
		packageWindows(),
	],
	build: {
		outDir: "../dist/web",
		chunkSizeWarningLimit: 4096,
		assetsInlineLimit: 0,
		target: "ES2022",
	},
	server: {
		host: "localhost",
		port: 5173,
		strictPort: true,
	},
});

function escapeHtml(value: string) {
	return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;")
		.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
