import api from './api.js';

window.webaep = window.webaep ?? {};

for (const k in api) {
    window.webaep[k] = api[k];
}
