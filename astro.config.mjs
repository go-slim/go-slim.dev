// @ts-check
import { defineConfig } from 'astro/config';
import alpinejs from '@astrojs/alpinejs';
import mdx from '@astrojs/mdx';
import { unified } from '@astrojs/markdown-remark';
import tailwindcss from '@tailwindcss/vite';
import icon from 'astro-icon';
import rehypeSlug from 'rehype-slug';
import pagefind from 'astro-pagefind';
import { remarkRemoveArticleHeader } from './src/plugins/remark-remove-article-header.ts';

// https://astro.build/config
export default defineConfig({
  site: 'https://go-slim.dev',
  output: 'static',
  trailingSlash: 'never',
  i18n: {
    locales: ['en-US', 'zh-Hans'],
    defaultLocale: 'en-US',
    routing: { prefixDefaultLocale: false },
  },
  markdown: {
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
    },
    processor: unified({
      remarkPlugins: [remarkRemoveArticleHeader],
      rehypePlugins: [rehypeSlug],
    }),
  },
  integrations: [
    pagefind(),
    alpinejs({ entrypoint: './src/entrypoint.ts' }),
    mdx(),
    icon({
      iconDir: "./src/assets/icons",
      svgoOptions: {
        plugins: [
          {
            name: "preset-default",
            params: {
              overrides: {
                convertPathData: false,
              },
            },
          },
        ],
      },
    }),
  ],

  vite: {
    resolve: { tsconfigPaths: true },
    plugins: [tailwindcss()],
    server: {
      proxy: {
        '/api/ai': 'http://127.0.0.1:8787',
      },
    },
    worker: { format: 'es' },
  }
});
