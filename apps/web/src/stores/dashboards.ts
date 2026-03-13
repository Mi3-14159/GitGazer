import {defineStore} from 'pinia';
import {computed, ref, watch} from 'vue';

export interface Dashboard {
    id: string;
    title: string;
    description?: string;
    icon: string;
    type: 'system' | 'user';
}

const STORAGE_KEY = 'gitgazer:dashboards';

const SYSTEM_DASHBOARDS: Dashboard[] = [
    {
        id: 'system-dora',
        title: 'DORA Metrics',
        description:
            'DORA framework metrics for your engineering organization — Deployment Frequency, Lead Time, Change Failure Rate, and Mean Time to Recovery.',
        icon: 'mdi-rocket-launch',
        type: 'system',
    },
    {
        id: 'system-space',
        title: 'SPACE Framework',
        description: 'SPACE framework metrics — Satisfaction, Performance, Activity, Communication, and Efficiency indicators for engineering teams.',
        icon: 'mdi-account-group',
        type: 'system',
    },
];

function loadUserDashboards(): Dashboard[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveUserDashboards(dashboards: Dashboard[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dashboards));
}

export const useDashboardsStore = defineStore('dashboards', () => {
    const userDashboards = ref<Dashboard[]>(loadUserDashboards());

    watch(userDashboards, (val) => saveUserDashboards(val), {deep: true});

    const systemDashboards = computed(() => SYSTEM_DASHBOARDS);

    const allDashboards = computed(() => [...SYSTEM_DASHBOARDS, ...userDashboards.value]);

    function getDashboard(id: string): Dashboard | undefined {
        return allDashboards.value.find((d) => d.id === id);
    }

    function createDashboard(params: {title: string; description?: string; icon: string}): Dashboard {
        const dashboard: Dashboard = {
            id: crypto.randomUUID(),
            title: params.title,
            description: params.description,
            icon: params.icon,
            type: 'user',
        };
        userDashboards.value.push(dashboard);
        return dashboard;
    }

    function updateDashboard(id: string, updates: Partial<Pick<Dashboard, 'title' | 'description' | 'icon'>>) {
        const index = userDashboards.value.findIndex((d) => d.id === id);
        if (index !== -1) {
            userDashboards.value[index] = {...userDashboards.value[index], ...updates};
        }
    }

    function deleteDashboard(id: string) {
        userDashboards.value = userDashboards.value.filter((d) => d.id !== id);
    }

    return {
        systemDashboards,
        userDashboards,
        allDashboards,
        getDashboard,
        createDashboard,
        updateDashboard,
        deleteDashboard,
    };
});
