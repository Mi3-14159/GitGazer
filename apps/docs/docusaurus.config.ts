import type * as Preset from '@docusaurus/preset-classic';
import type {Config} from '@docusaurus/types';
import {themes as prismThemes} from 'prism-react-renderer';

const config: Config = {
    title: 'GitGazer',
    tagline: 'GitHub Workflow Monitoring & Notifications',
    favicon: 'img/favicon.ico',

    future: {
        v4: true,
    },

    url: 'https://docs.gitgazer.com',
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

    themes: ['@docusaurus/theme-mermaid'],

    presets: [
        [
            'classic',
            {
                docs: {
                    sidebarPath: './sidebars.ts',
                    routeBasePath: '/',
                    editUrl: 'https://github.com/Mi3-14159/GitGazer/tree/main/apps/docs/',
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
                {
                    href: 'https://app.gitgazer.com',
                    label: 'App',
                    position: 'right',
                },
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
                        {
                            label: 'GitGazer App',
                            href: 'https://app.gitgazer.com',
                        },
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
