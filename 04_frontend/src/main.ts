import App from '@/App.vue';
import {registerPlugins} from '@/plugins';
import router from '@/router';
import {createPinia} from 'pinia';
import {createApp} from 'vue';

const app = createApp(App);

registerPlugins(app);

app.use(createPinia());
app.use(router).mount('#app');
