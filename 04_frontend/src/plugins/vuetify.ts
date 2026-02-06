/**
 * plugins/vuetify.ts
 *
 * Framework documentation: https://vuetifyjs.com`
 */

// Styles
import '@mdi/font/css/materialdesignicons.css';
import 'vuetify/styles';

// Composables
import {createVuetify} from 'vuetify';

// https://vuetifyjs.com/en/introduction/why-vuetify/#feature-guides
export default createVuetify({
    theme: {
        defaultTheme: 'dark',
        themes: {
            light: {
                dark: false,
                colors: {
                    primary: '#1B3A5C', // Dark blue
                    secondary: '#D48E00', // Warm amber
                    accent: '#00897B', // Teal
                    error: '#D32F2F',
                    warning: '#F9A825',
                    info: '#0288D1',
                    success: '#2E7D32',
                    surface: '#FFFFFF',
                    background: '#F0F4F8', // Cool grey-blue
                    'on-primary': '#FFFFFF',
                    'on-secondary': '#FFFFFF',
                    'on-background': '#1A1A1A',
                    'on-surface': '#1A1A1A',
                },
            },
            dark: {
                dark: true,
                colors: {
                    primary: '#1B3A5C', // Dark blue
                    secondary: '#F5A623', // Warm amber
                    accent: '#00BFA5', // Teal
                    error: '#FF5252',
                    warning: '#FFC107',
                    info: '#29B6F6', // Sky blue
                    success: '#4CAF50',
                    surface: '#0D2137', // Deep navy
                    background: '#071525', // Darkest navy
                    'on-primary': '#FFFFFF',
                    'on-secondary': '#000000',
                    'on-background': '#FFFFFF',
                    'on-surface': '#FFFFFF',
                },
            },
        },
    },
});
