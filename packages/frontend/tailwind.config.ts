import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'aws-orange': '#FF9900',
        'aws-dark': '#232F3E',
        'aws-light': '#F2F3F3',
      },
    },
  },
  plugins: [],
};

export default config;
