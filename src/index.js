import api from './api.js';

window.sato = window.sato ?? {};

for (const k in api) {
    window.sato[k] = api[k];
}
