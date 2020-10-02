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

// Bind api functions to base class
Object.assign(Service.prototype, require('../api/schedules/schedules'));
Object.assign(Service.prototype, require('../api/sensors/sensors'));

// Bind data collector functions to base class
Object.assign(
  Service.prototype,
  require('../collectors/flowercare/flowercare'),
);

// Bind schedule functions to base class
Object.assign(Service.prototype, require('../schedules/gardenWater'));

// Create base service
const service = new Service(options);

async function setupServer() {
  // Setup service
  await service.createRestifyServer();

  // Set device data arrays
  service.devices = {};
  service.devicesFound = {};
  service.missingDevices = {};

  // Apply api routes
  service.restifyServer.get('/schedules', (req, res, next) =>
    service._listSchedules(req, res, next),
  );
  service.logger.trace(`${service._traceStack()} - Added '/sensors' api`);

  service.restifyServer.get('/schedules/:scheduleID', (req, res, next) =>
    service._listSchedule(req, res, next),
  );
  service.logger.trace(
    `${service._traceStack()} - Added '/schedules/:scheduleID' api`,
  );

  service.restifyServer.put('/schedules/:scheduleID', (req, res, next) =>
    service._saveSchedule(req, res, next),
  );
  service.logger.trace(
    `${service._traceStack()} - Added '/schedules/:scheduleID' api`,
  );

  service.restifyServer.get('/sensors/scan', (req, res, next) =>
    service._scanDevices(req, res, next),
  );
  service.logger.trace(`${service._traceStack()} - Added '/sensors/scan' api`);

  service.restifyServer.get('/sensors/:gardenSensorAddress', (req, res, next) =>
    service._sensors(req, res, next),
  );
  service.logger.trace(
    `${service._traceStack()} - Added '/sensors/:gardenSensorAddress' api`,
  );

  service.restifyServer.get('/sensors/current', (req, res, next) =>
    service._current(req, res, next),
  );
  service.logger.trace(
    `${service._traceStack()} - Added '/sensors/current' api`,
  );

  service.restifyServer.get('/zones/:zone', (req, res, next) =>
    service._zones(req, res, next),
  );
  service.logger.trace(`${service._traceStack()} - Added '/zones/:zone' api`);

  service.restifyServer.get('/sensors/zone/:zone', (req, res, next) =>
    service._sensorsZone(req, res, next),
  );
  service.logger.trace(
    `${service._traceStack()} - Added '/sensors/zone/:zone' api`,
  );

  service.restifyServer.get('/needswater', (req, res, next) =>
    service._needsWater(req, res, next),
  );
  service.logger.trace(`${service._traceStack()} - Added '/needsWater' api`);

  if (process.env.MOCK === 'true') {
    service.logger.info(
      'Mocking enabled, will not collect flowercare sensor data',
    );
  } else {
    if (process.env.NO_SCHEDULE === 'true') {
      service.logger.info('Collect data only and do not set any schedules');
    } else {
      // Add schedules
      await service.setupSchedules(true);
      await service.activateSchedules();
    }
    service._getFlowerCareDevices(true); // Collect Flowercare device data
  }

  // Listen for api requests
  service.listen();
}
setupServer();
