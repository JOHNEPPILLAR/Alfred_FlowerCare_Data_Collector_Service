/**
 * Import external libraries
 */
const scheduler = require('node-schedule');
const apn = require('apn');
const serviceHelper = require('alfred-helper');

async function checkGardenWater() {
  serviceHelper.log('trace', 'Checking water levels');

  const deviceTokens = [];
  const wateringDuration = 5; // in minute(s)

  let dbClient;

  try {
    const toWaterSQL = 'SELECT * FROM vw_water_plants';
    serviceHelper.log('trace', 'Connect to data store connection pool');
    dbClient = await global.devicesDataClient.connect(); // Connect to data store
    serviceHelper.log('trace', 'Getting garden sensors that need watering');
    const needsWatering = await dbClient.query(toWaterSQL);
    serviceHelper.log(
      'trace',
      'Release the data store connection back to the pool',
    );
    await dbClient.release(); // Return data store connection back to pool

    if (needsWatering.rowCount === 0) {
      serviceHelper.log('trace', 'Garden does not need watering');
      return;
    } // Exit function as no data to process

    let body = {
      lat: process.env.lat,
      long: process.env.long,
      forcastDuration: 5,
    };
    const willItRain = await serviceHelper.callAlfredServiceGet(
      `${process.env.AlfredControllerService}/weather/willitrain?lat=${process.env.lat}&long=${process.env.long}`,
      false,
      body,
    );

    if (!(willItRain instanceof Error)) {
      if (
        willItRain.data.precipProbability > 0.5
        && willItRain.data.precipIntensity > 0.5
      ) {
        serviceHelper.log(
          'info',
          'Chance of miderate rain is high, so will not activate water system',
        );
        return;
      }
    }

    // Turn on garden hose
    const url = 'https://www.link-tap.com/api/activateInstantMode';
    body = {
      username: process.env.LinkTapUser,
      apiKey: process.env.LinkTapKey,
      gatewayId: process.env.LinkTapGatewayID,
      taplinkerId: process.env.LinkTapLinkerID,
      action: true,
      duration: wateringDuration,
      eco: false,
    };

    serviceHelper.log('info', 'Turning on the garden watering system');
    serviceHelper.log('trace', `${JSON.stringify(body)}`);
    const returnData = await serviceHelper.callAPIServicePut(url, body);

    if (returnData instanceof Error) {
      serviceHelper.log('error', returnData.message);
      return;
    }

    const pushSQL = 'SELECT last(device_token, time) as device_token, app_user FROM ios_devices WHERE app_user is not null GROUP BY app_user';
    serviceHelper.log('trace', 'Connect to data store connection pool');
    dbClient = await global.devicesDataClient.connect(); // Connect to data store
    serviceHelper.log('trace', 'Getting IOS devices');
    const devicesToNotify = await dbClient.query(pushSQL);
    serviceHelper.log(
      'trace',
      'Release the data store connection back to the pool',
    );
    await dbClient.release(); // Return data store connection back to pool
    if (devicesToNotify.rowCount === 0) {
      serviceHelper.log('trace', 'No devices to notify');
      return;
    } // Exit function as no devices to process

    // Send iOS notifications what watering has started
    serviceHelper.log(
      'trace',
      'Build list of devices to send push notification to',
    );
    devicesToNotify.rows.forEach((device) => {
      deviceTokens.push(device.device_token);
    });

    // Connect to apples push notification service and send notifications
    const apnProvider = new apn.Provider({
      token: {
        key: 'certs/Push.p8',
        keyId: process.env.keyID,
        teamId: process.env.teamID,
      },
      production: true,
    });

    serviceHelper.log('trace', 'Send push notification(s)');
    const notification = new apn.Notification();
    notification.topic = 'JP.Alfred-IOS';
    notification.expiry = Math.floor(Date.now() / 1000) + 600; // Expires 10 minutes from now.
    notification.alert = 'Garden 🌻need 💦. Now starting watering sequence';
    const result = await apnProvider.send(notification, deviceTokens);

    if (result.sent.length > 0) {
      serviceHelper.log('info', 'Water garden push notification sent');
    } else {
      serviceHelper.log(
        'error',
        'Water garden push notification faild to be sent',
      );
    }
    serviceHelper.log(
      'trace',
      'Close down connection to push notification service',
    );
    await apnProvider.shutdown(); // Close the connection with apn
  } catch (err) {
    serviceHelper.log('error', err.message);
  }
}

async function setupSchedule(data) {
  serviceHelper.log(
    'trace',
    `Create water garden timer(s) from ${data.name} schedule data`,
  );

  if (data.hour === null || data.minute === null) {
    serviceHelper.log('error', 'Schedule values were null');
    return false;
  }

  let rule = new scheduler.RecurrenceRule();
  rule.hour = data.hour;
  rule.minute = data.minute;

  const schedule = scheduler.scheduleJob(rule, () => {
    checkGardenWater();
  });
  global.schedules.push(schedule);
  serviceHelper.log(
    'info',
    `${data.name} schedule will run at: ${serviceHelper.zeroFill(
      rule.hour,
      2,
    )}:${serviceHelper.zeroFill(rule.minute, 2)}`,
  );
  rule = null; // Clear schedule values
  return true;
}

/**
 * Set up garden need watering notifications
 */
exports.setup = async () => {
  let dbClient;
  let results;

  try {
    // Get data from data store
    const SQL = 'SELECT name, hour, minute, ai_override FROM garden_schedules WHERE type = 0 and active';
    serviceHelper.log('trace', 'Connect to data store connection pool');
    dbClient = await global.devicesDataClient.connect(); // Connect to data store
    serviceHelper.log('trace', 'Get timer settings');
    results = await dbClient.query(SQL);
    serviceHelper.log(
      'trace',
      'Release the data store connection back to the pool',
    );
    await dbClient.release(); // Return data store connection back to pool

    if (results.rowCount === 0) {
      // Exit function as no data to process
      serviceHelper.log('trace', 'No Water Garden timers are active');
      return false;
    }

    // Setup timers
    results.rows.forEach((info) => {
      setupSchedule(info);
    });
  } catch (err) {
    serviceHelper.log('error', err.message);
  }
  return true;
};
