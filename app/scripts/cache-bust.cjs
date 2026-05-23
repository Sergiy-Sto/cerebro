const fs = require('fs');
const t = Date.now();
let h = fs.readFileSync('dist/index.html', 'utf8');
h = h.replace(/index\.js(\?v=\S+)?/, 'index.js?v=' + t);
h = h.replace(/index\.css(\?v=\S+)?/, 'index.css?v=' + t);
fs.writeFileSync('dist/index.html', h);
console.log('Cache bust: v=' + t);
