/**
 * Import external libraries
 */
const serviceHelper = require('alfred-helper');

/**
 * Import helper libraries
 */
const { version } = require('../../package.json');
const serviceName = require('../../package.json').description;
const virtualHost = require('../../package.json').name;
const devices = require('../collectors/controller.js');
const schedules = require('../schedules/controller.js');
const APIroot = require('../api/root/root.js');
const APIsensors = require('../api/sensors/sensors.js');
const APIschedules = require('../api/schedules/schedules.js');

global.APITraceID = '';
global.schedules = [];

async function setupAndRun() {
  // Create restify server
  const server = await serviceHelper.setupRestifyServer(virtualHost, version);

  // Setup API middleware
  await serviceHelper.setupRestifyMiddleware(server, virtualHost);

  // Configure API end points
  APIroot.applyRoutes(server);
  APIsensors.applyRoutes(server);
  APIschedules.applyRoutes(server);

  // Capture and process API errors
  await serviceHelper.captureRestifyServerErrors(server);

  // Start service and listen to requests
  server.listen(process.env.PORT, async () => {
    serviceHelper.log(
      'info',
      `${serviceName} has started`,
    );
    if (process.env.MOCK === 'true') {
      serviceHelper.log(
        'info',
        'Mocking enabled, will not setup monitors or schedules',
      );
    } else {
      devices.processFlowerCareDevices();
      if (process.env.NO_SCHEDULE === 'true') {
        serviceHelper.log(
          'info',
          'Collect data only and do not set any schedules',
        );
      } else {
        schedules.setSchedule(true); // Setup garden schedules
      }
    }
  });
}

setupAndRun();
