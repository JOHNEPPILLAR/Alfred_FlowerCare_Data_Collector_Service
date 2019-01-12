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
  if (process.env.Debug === 'true') serviceHelper.log('trace', null, req.url);
  res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  res.header('Expires', '-1');
  res.header('Pragma', 'no-cache');
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
  serviceHelper.log('error', 'server', `${err.message}`);
  serviceHelper.sendResponse(res, 404, err);
});
server.on('uncaughtException', (req, res, route, err) => {
  serviceHelper.log('error', 'server', `${route}: ${err.message}`);
  serviceHelper.sendResponse(res, null, err);
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
  serviceHelper.log('warn', 'cleanExit', 'Service stopping');
  serviceHelper.log('trace', 'cleanExit', 'Closing the data store pools');
  try {
    await global.devicesDataClient.end();
  } catch (err) {
    serviceHelper.log('trace', 'cleanExit', 'Failed to close the data store connection');
  }
  serviceHelper.log('trace', 'cleanExit', 'Finished collecting purecool data');
  serviceHelper.log('warn', 'cleanExit', 'Close rest server');
  server.close(() => { // Ensure rest server is stopped
    process.exit(); // Exit app
  });
}
process.on('exit', () => { cleanExit(); });
process.on('SIGINT', () => { cleanExit(); });
process.on('SIGTERM', () => { cleanExit(); });
process.on('uncaughtException', (err) => {
  if (err) serviceHelper.log('error', 'server', err.message); // log the error
});

// Register service
const registerService = serviceHelper.registerService();
if (registerService instanceof Error) {
  serviceHelper.log('error', 'server', 'Unable to register service');
  cleanExit();
}

setTimeout(() => { devices.collectData(); }, 5000);

// Start service and listen to requests
server.listen(process.env.Port, () => {
  serviceHelper.log('info', 'server', `${process.env.ServiceName} has started and is listening on port ${process.env.Port}`);
});
