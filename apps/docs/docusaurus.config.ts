import type * as Preset from '@docusaurus/preset-classic';
import type {Config} from '@docusaurus/types';
import {themes as prismThemes} from 'prism-react-renderer';
import replaceAppUrl from './src/remark/replaceAppUrl';

const appUrl = process.env.VITE_HOST_URL?.replace(/\/$/, '');
const docsDomain = process.env.DOCS_DOMAIN;

const config: Config = {
    title: 'GitGazer',
    tagline: 'GitHub Workflow Monitoring & Notifications',
    favicon: 'img/logo.svg',

    future: {
        v4: true,
        faster: true,
    },

    url: docsDomain ? `https://${docsDomain}` : 'http://localhost:3000',
    baseUrl: '/',

    organizationName: 'Mi3-14159',
    projectName: 'GitGazer',

    onBrokenLinks: 'throw',

    i18n: {
        defaultLocale: 'en',
        locales: ['en'],
    },

    markdown: {
        mermaid: true,
    },

    themes: [
        '@docusaurus/theme-mermaid',
        [
            '@easyops-cn/docusaurus-search-local',
            {
                hashed: true,
                docsRouteBasePath: '/',
                indexBlog: false,
            },
        ],
    ],

    presets: [
        [
            'classic',
            {
                docs: {
                    sidebarPath: './sidebars.ts',
                    routeBasePath: '/',
                    editUrl: 'https://github.com/Mi3-14159/GitGazer/tree/main/apps/docs/',
                    remarkPlugins: [[replaceAppUrl, {appUrl}]],
                },
                blog: false,
                theme: {
                    customCss: './src/css/custom.css',
                },
            } satisfies Preset.Options,
        ],
    ],

    themeConfig: {
        colorMode: {
            respectPrefersColorScheme: true,
        },
        navbar: {
            title: 'GitGazer',
            items: [
                {
                    type: 'docSidebar',
                    sidebarId: 'docsSidebar',
                    position: 'left',
                    label: 'Docs',
                },
                ...(appUrl ? [{href: appUrl, label: 'App', position: 'right' as const}] : []),
                {
                    href: 'https://github.com/Mi3-14159/GitGazer',
                    label: 'GitHub',
                    position: 'right',
                },
            ],
        },
        footer: {
            style: 'dark',
            links: [
                {
                    title: 'Documentation',
                    items: [
                        {
                            label: 'Getting Started',
                            to: '/',
                        },
                    ],
                },
                {
                    title: 'Links',
                    items: [
                        ...(appUrl ? [{label: 'GitGazer App', href: appUrl}] : []),
                        {
                            label: 'GitHub',
                            href: 'https://github.com/Mi3-14159/GitGazer',
                        },
                    ],
                },
            ],
            copyright: `Copyright © ${new Date().getFullYear()} GitGazer. Built with Docusaurus.`,
        },
        prism: {
            theme: prismThemes.github,
            darkTheme: prismThemes.dracula,
        },
    } satisfies Preset.ThemeConfig,
};

export default config;
