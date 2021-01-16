/**
 * Import external libraries
 */
const { Service } = require('alfred-base');

// Setup service options
const { version } = require('../../package.json');
const serviceName = require('../../package.json').description;
const namespace = require('../../package.json').name;

const options = {
  serviceName,
  namespace,
  serviceVersion: version,
};

// Bind data collector functions to base class
Object.assign(
  Service.prototype,
  require('../collectors/flowercare/flowercare'),
);

// Create base service
const service = new Service(options);

async function setupServer() {
  // Setup service
  await service.createRestifyServer();

  // Collect device data
  service._processDevices();

  // Listen for api requests
  service.listen();
}
setupServer();
