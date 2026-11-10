/** @type {import('tailwindcss').Config} */
const withAlpha = (channels) => `oklch(${channels} / <alpha-value>)`;

export default {
	content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
	theme: {
		extend: {
			fontFamily: {
				sans: ["Geist", "ui-sans-serif", "system-ui", "sans-serif"],
				serif: ['"Source Serif 4"', "Georgia", "serif"],
				mono: ['"IBM Plex Mono"', "monospace"],
			},
			colors: {
				background: withAlpha("0.985 0.002 90"),
				foreground: withAlpha("0.129 0.042 264.695"),
				card: withAlpha("1 0 0"),
				"card-foreground": withAlpha("0.129 0.042 264.695"),
				primary: withAlpha("0.208 0.042 265.755"),
				"primary-foreground": withAlpha("0.984 0.003 247.858"),
				secondary: withAlpha("0.968 0.007 247.896"),
				"secondary-foreground": withAlpha("0.208 0.042 265.755"),
				muted: withAlpha("0.968 0.007 247.896"),
				"muted-foreground": withAlpha("0.554 0.046 257.417"),
				border: withAlpha("0.929 0.013 255.508"),
				ring: withAlpha("0.704 0.04 256.788"),
				destructive: withAlpha("0.577 0.245 27.325"),
				"destructive-foreground": withAlpha("0.984 0.003 247.858"),
				brand: withAlpha("0.728 0.1847 50.123"),
				high: withAlpha("0.55 0.2 25"),
				"high-soft": withAlpha("0.96 0.03 20"),
				evidence: withAlpha("0.6 0.13 70"),
				"evidence-soft": withAlpha("0.97 0.04 90"),
				low: withAlpha("0.55 0.11 165"),
				"low-soft": withAlpha("0.96 0.03 165"),
				paper: withAlpha("0.995 0.005 90"),
				mark: withAlpha("0.93 0.15 100"),
			},
			borderRadius: {
				lg: "0.625rem",
				xl: "0.875rem",
			},
		},
	},
	plugins: [],
};
