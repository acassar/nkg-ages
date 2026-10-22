import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './ui/App.vue'
import './ui/styles/theme.css'

createApp(App).use(createPinia()).mount('#app')
