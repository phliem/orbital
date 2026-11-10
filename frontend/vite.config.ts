import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react()],
	server: {
		port: 5173,
		host: "0.0.0.0",
		proxy: {
			"/api": {
				target: process.env.API_PROXY_TARGET ?? "http://backend:8000",
				changeOrigin: true,
			},
		},
	},
});
