import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'vite-plugin-fontcut',
  description: 'Subset self-hosted webfonts down to only the glyphs your built site actually uses.',
  base: '/vite-plugin-fontcut/',
  cleanUrls: true,

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Options', link: '/guide/options' },
    ],

    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting Started', link: '/guide/getting-started' },
          { text: 'How It Works', link: '/guide/how-it-works' },
          { text: 'Options', link: '/guide/options' },
          { text: 'Splitting by Script', link: '/guide/split-by-script' },
          { text: 'Limitations', link: '/guide/limitations' },
        ],
      },
    ],

    socialLinks: [{ icon: 'github', link: 'https://github.com/fumikun/vite-plugin-subfont' }],

    search: {
      provider: 'local',
    },
  },
});
