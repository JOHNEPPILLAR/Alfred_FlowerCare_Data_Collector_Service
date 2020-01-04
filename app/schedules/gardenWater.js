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

  try {
    const toWaterSQL = 'SELECT * FROM vw_water_plants';
    serviceHelper.log('trace', 'Connect to data store connection pool');
    let dbConnection = await serviceHelper.connectToDB('flowercare');
    let dbClient = await dbConnection.connect(); // Connect to data store
    serviceHelper.log('trace', 'Getting garden sensors that need watering');
    const needsWatering = await dbClient.query(toWaterSQL);
    serviceHelper.log(
      'trace',
      'Release the data store connection back to the pool',
    );
    await dbClient.release(); // Return data store connection back to pool
    await dbClient.end(); // Close data store connection

    if (needsWatering.rowCount === 0) {
      serviceHelper.log('info', 'Garden does not need watering');
      return;
    } // Exit function as no data to process

    /*
    serviceHelper.log('trace', 'Checking if it will rain');
    const AlfredControllerService = await serviceHelper.vaultSecret(process.env.ENVIRONMENT, 'AlfredControllerService');
    const HomeLat = await serviceHelper.vaultSecret(process.env.ENVIRONMENT, 'HomeLat');
    const HomeLong = await serviceHelper.vaultSecret(process.env.ENVIRONMENT, 'HomeLong');
    const willItRain = await serviceHelper.callAlfredServiceGet(
      `${AlfredControllerService}/weather/willitrain/${HomeLat}/${HomeLong}?forcastDuration=5`,
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
    */

    // Turn on garden hose
    const url = 'https://www.link-tap.com/api/activateInstantMode';
    const LinkTapUser = await serviceHelper.vaultSecret(process.env.ENVIRONMENT, 'LinkTapUser');
    const LinkTapKey = await serviceHelper.vaultSecret(process.env.ENVIRONMENT, 'LinkTapKey');
    const LinkTapGatewayID = await serviceHelper.vaultSecret(process.env.ENVIRONMENT, 'LinkTapGatewayID');
    const LinkTapLinkerID = await serviceHelper.vaultSecret(process.env.ENVIRONMENT, 'LinkTapLinkerID');

    const body = {
      username: LinkTapUser,
      apiKey: LinkTapKey,
      gatewayId: LinkTapGatewayID,
      taplinkerId: LinkTapLinkerID,
      action: true,
      duration: wateringDuration,
      eco: false,
    };

    serviceHelper.log('info', 'Turning on the garden watering system');
    const returnData = await serviceHelper.callAPIServicePut(url, body);

    if (returnData instanceof Error) {
      serviceHelper.log('error', returnData.message);
      return;
    }

    const pushSQL = 'SELECT last(device_token, time) as device_token FROM ios_devices';
    serviceHelper.log('trace', 'Connect to data store connection pool');
    dbConnection = await serviceHelper.connectToDB('devices');
    dbClient = await dbConnection.connect(); // Connect to data store
    serviceHelper.log('trace', 'Getting IOS devices');
    const devicesToNotify = await dbClient.query(pushSQL);
    serviceHelper.log(
      'trace',
      'Release the data store connection back to the pool',
    );
    await dbClient.release(); // Return data store connection back to pool
    await dbClient.end(); // Close data store connection
    if (devicesToNotify.rowCount === 0) {
      serviceHelper.log('trace', 'No devices to notify');
      return;
    } // Exit function as no devices to process

    // Send iOS notifications what watering has started
    serviceHelper.log(
      'trace',
      'Build list of devices to send push notification to',
    );
    devicesToNotify.rows.map((device) => deviceTokens.push(device.device_token));

    // Connect to apples push notification service and send notifications
    const IOSNotificationKeyID = await serviceHelper.vaultSecret(process.env.ENVIRONMENT, 'IOSNotificationKeyID');
    const IOSNotificationTeamID = await serviceHelper.vaultSecret(process.env.ENVIRONMENT, 'IOSNotificationTeamID');
    const IOSPushKey = await serviceHelper.vaultSecret(process.env.ENVIRONMENT, 'IOSPushKey');
    if (IOSNotificationKeyID instanceof Error
      || IOSNotificationTeamID instanceof Error
      || IOSPushKey instanceof Error) {
      serviceHelper.log('error', 'Not able to get secret (CERTS) from vault');
      return;
    }
    const apnProvider = new apn.Provider({
      token: {
        key: IOSPushKey,
        keyId: IOSNotificationKeyID,
        teamId: IOSNotificationTeamID,
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
  try {
    // Get data from data store
    const SQL = 'SELECT name, hour, minute, ai_override FROM garden_schedules WHERE type = 0 and active';
    serviceHelper.log('trace', 'Connect to data store connection pool');
    const dbConnection = await serviceHelper.connectToDB('flowercare');
    const dbClient = await dbConnection.connect(); // Connect to data store
    serviceHelper.log('trace', 'Get timer settings');
    const results = await dbClient.query(SQL);
    serviceHelper.log(
      'trace',
      'Release the data store connection back to the pool',
    );
    await dbClient.release(); // Return data store connection back to pool
    await dbClient.end(); // Close data store connection

    if (results.rowCount === 0) {
      // Exit function as no data to process
      serviceHelper.log('info', 'No Water Garden timers are active');
      return false;
    }

    // Setup timers
    results.rows.map(async (info) => {
      await setupSchedule(info);
    });
  } catch (err) {
    serviceHelper.log('error', err.message);
  }
  return true;
};
