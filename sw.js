const CACHE_NAME = 'shusseuo-v1';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './game.js',
    './constants.js',
    './audio.js',
    'https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js',
    // Fish Assets
    './assets/fish/01.png', './assets/fish/02.png', './assets/fish/03.png',
    './assets/fish/04.png', './assets/fish/05.png', './assets/fish/06.png',
    './assets/fish/07.png', './assets/fish/08.png', './assets/fish/09.png',
    './assets/fish/10.png', './assets/fish/11.png',
    // Fruit Assets
    './assets/fruit/01.png', './assets/fruit/02.png', './assets/fruit/03.png',
    './assets/fruit/04.png', './assets/fruit/05.png', './assets/fruit/06.png',
    './assets/fruit/07.png', './assets/fruit/08.png', './assets/fruit/09.png',
    './assets/fruit/10.png', './assets/fruit/11.png'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then((response) => {
            return response || fetch(e.request);
        })
    );
});
