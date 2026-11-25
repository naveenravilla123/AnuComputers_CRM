import type { Config } from "tailwindcss";
import colors from "tailwindcss/colors";
export default { content:["./src/**/*.{js,ts,jsx,tsx}"], theme:{extend:{fontFamily:{sans:["Inter","Arial","sans-serif"]},colors:{navy:"#111b2d",indigo:{ ...colors.indigo, DEFAULT:"#6157d9" }}}}, plugins:[] } satisfies Config;
