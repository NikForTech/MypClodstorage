const serverless = require('serverless-http');
const app = require('../../server');

// Wrap Express app as a Netlify serverless function
const handler = serverless(app, {
  basePath: '/.netlify/functions/api',
  request: (request, event, context) => {
    // Strip the function base path so Express sees clean routes
    // e.g. /.netlify/functions/api/upload → /upload
    request.url = request.url.replace(/^\/.netlify\/functions\/api/, '') || '/';
  },
});

module.exports = { handler };
