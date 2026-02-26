const serverless = require('serverless-http');
const path = require('path');

// path.resolve finds server.js reliably regardless of where
// Netlify runs this function from during bundling
const app = require(path.resolve(__dirname, '..', '..', 'server'));

module.exports.handler = serverless(app);
