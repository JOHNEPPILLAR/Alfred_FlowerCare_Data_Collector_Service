/**
 * Import external libraries
 */
require('dotenv').config();

const restify = require('restify');
const fs = require('fs');
const UUID = require('pure-uuid');
const { Pool } = require('pg');

/**
 * Import helper libraries
 */
const serviceHelper = require('./helper.js');
const devices = require('../collectors/controller.js');

global.instanceTraceID = new UUID(4);
global.callTraceID = null;

// Data base connection pool
global.devicesDataClient = new Pool({
  host: process.env.DataStore,
  database: 'devices',
  user: process.env.DataStoreUser,
  password: process.env.DataStoreUserPassword,
  port: 5432,
});

// Restify server Init
const server = restify.createServer({
  name: process.env.ServiceName,
  version: process.env.Version,
  key: fs.readFileSync('./certs/server.key'),
  certificate: fs.readFileSync('./certs/server.crt'),
});

/**
 * Setup API middleware
 */
server.use(restify.plugins.jsonBodyParser({ mapParams: true }));
server.use(restify.plugins.acceptParser(server.acceptable));
server.use(restify.plugins.queryParser({ mapParams: true }));
server.use(restify.plugins.fullResponse());
server.use((req, res, next) => {
  serviceHelper.log('trace', req.url);
  next();
});
server.use((req, res, next) => {
  // Check for a trace id
  if (typeof req.headers['trace-id'] === 'undefined') { global.callTraceID = new UUID(4); } // Generate new trace id

  // Check for valid auth key
  if (req.headers['client-access-key'] !== process.env.ClientAccessKey) {
    serviceHelper.log('warn', null, `Invaid client access key: ${req.headers.ClientAccessKey}`);
    serviceHelper.sendResponse(res, 401, 'There was a problem authenticating you.');
    return;
  }
  next();
});

server.on('NotFound', (req, res, err) => {
  serviceHelper.log('error', `${err.message}`);
  serviceHelper.sendResponse(res, 404, err.message);
});
server.on('uncaughtException', (req, res, route, err) => {
  serviceHelper.log('error', `${route}: ${err.message}`);
  serviceHelper.sendResponse(res, null, err.message);
});

/**
 * Configure API end points
 */
require('../api/root/root.js').applyRoutes(server);
require('../api/display/display.js').applyRoutes(server, '/display');

/**
 * Stop server if process close event is issued
 */
async function cleanExit() {
  serviceHelper.log('warn', 'Service stopping');
  serviceHelper.log('trace', 'Closing the data store pools');
  try {
    await global.devicesDataClient.end();
  } catch (err) {
    serviceHelper.log('trace', 'Failed to close the data store connection');
  }
  serviceHelper.log('trace', 'Finished collecting purecool data');
  serviceHelper.log('warn', 'Close rest server');
  server.close(() => { // Ensure rest server is stopped
    process.exit(); // Exit app
  });
}
process.on('SIGINT', () => { cleanExit(); });
process.on('SIGTERM', () => { cleanExit(); });
process.on('SIGUSR2', () => { cleanExit(); });
process.on('uncaughtException', (err) => {
  if (err) serviceHelper.log('error', err.message); // log the error
  cleanExit();
});

setTimeout(() => { devices.collectData(); }, 5000);

// Start service and listen to requests
server.listen(process.env.Port, () => {
  serviceHelper.log('info', `${process.env.ServiceName} has started and is listening on port ${process.env.Port}`);
});
