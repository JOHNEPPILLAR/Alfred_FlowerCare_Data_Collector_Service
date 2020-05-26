/**
 * Import external libraries
 */
const scheduler = require('node-schedule');
const dateformat = require('dateformat');
const serviceHelper = require('alfred-helper');

async function checkGardenWater() {
  serviceHelper.log(
    'trace',
    'Checking water levels',
  );

  let gardenWatering = false;
  let houseWatering = false;

  try {
    const toWaterSQL = 'SELECT * FROM vw_water_plants';
    serviceHelper.log(
      'trace',
      'Connect to data store connection pool',
    );
    const dbConnection = await serviceHelper.connectToDB('flowercare');
    serviceHelper.log(
      'trace',
      'Getting garden sensors that need watering',
    );
    const needsWatering = await dbConnection.query(toWaterSQL);
    serviceHelper.log(
      'trace',
      'Release the data store connection back to the pool',
    );
    await dbConnection.end(); // Close data store connection

    if (needsWatering.rowCount === 0) {
      serviceHelper.log(
        'info',
        'Nothing needs watering',
      );
      return;
    } // Exit function as no data to process

    // Zone 1 data
    const zone1 = needsWatering.rows.filter(
      (z) => z.zone === 1,
    );
    // Zone 2 data
    const zone2 = needsWatering.rows.filter(
      (z) => z.zone === 2,
    );
    // Zone 3 data
    const zone3 = needsWatering.rows.filter(
      (z) => z.zone === 3,
    );

    if (zone3.length > 0) houseWatering = true; // House zone need watering
    if (zone1.length > 0 || zone2.length > 0) { // Garden zones
      gardenWatering = true;
      serviceHelper.log(
        'trace',
        'Checking if it will rain',
      );
      const willItRain = await serviceHelper.callAlfredServiceGet(
        `${process.env.ALFRED_WEATHER_SERVICE}/willitrain?forcastDuration=5`,
      );

      if (!(willItRain instanceof Error)) {
        if (
          willItRain.precipProbability > 0.5
          && willItRain.precipIntensity > 0.5
        ) {
          serviceHelper.log(
            'info',
            'Chance of moderate rain is high, so will not activate water system',
          );
          return;
        }
      }

      // Connect to Link-tap controller
      const url = 'https://www.link-tap.com/api/activateInstantMode';
      const LinkTapUser = await serviceHelper.vaultSecret(
        process.env.ENVIRONMENT,
        'LinkTapUser',
      );
      const LinkTapKey = await serviceHelper.vaultSecret(
        process.env.ENVIRONMENT,
        'LinkTapKey',
      );
      const LinkTapGatewayID = await serviceHelper.vaultSecret(
        process.env.ENVIRONMENT,
        'LinkTapGatewayID',
      );

      let LinkTapLinkerID;
      const body = {
        username: LinkTapUser,
        apiKey: LinkTapKey,
        gatewayId: LinkTapGatewayID,
        action: true,
        eco: false,
      };

      // Zone 1
      if (zone1.length > 0) {
        LinkTapLinkerID = await serviceHelper.vaultSecret(
          process.env.ENVIRONMENT,
          'LinkTapZone1ID',
        );
        body.taplinkerId = LinkTapLinkerID;
        body.duration = 5;

        serviceHelper.log(
          'info',
          'Turning on zone 1 watering system',
        );
        const returnData = await serviceHelper.callAPIServicePut(
          url,
          body,
        );
        if (returnData instanceof Error) {
          serviceHelper.log(
            'error',
            returnData.message,
          );
        }
      }

      // Zone 2
      if (zone2.length > 0) {
        LinkTapLinkerID = await serviceHelper.vaultSecret(
          process.env.ENVIRONMENT,
          'LinkTapZone2ID',
        );
        body.taplinkerId = LinkTapLinkerID;
        body.duration = 5;

        serviceHelper.log(
          'info',
          'Turning on zone 2 watering system',
        );
        const returnData = await serviceHelper.callAPIServicePut(
          url,
          body,
        );
        if (returnData instanceof Error) {
          serviceHelper.log(
            'error',
            returnData.message,
          );
        }
      }
    }

    const notificationText = `${gardenWatering ? 'Automatic garden 💦started' : ''}${gardenWatering && houseWatering ? ' and ' : ''}${gardenWatering ? 'h' : 'H'}${houseWatering ? 'ouse 🌻need 💦' : ''}`;
    serviceHelper.sendPushNotification(notificationText);
  } catch (err) {
    serviceHelper.log(
      'error',
      err.message,
    );
  }
}

async function setupSchedule(data) {
  serviceHelper.log(
    'trace',
    `Create water garden timer(s) from ${data.name} schedule data`,
  );

  if (data.hour === null || data.minute === null) {
    serviceHelper.log(
      'error',
      'Schedule values were null',
    );
    return false;
  }
  const date = new Date();
  date.setHours(data.hour);
  date.setMinutes(data.minute);
  const schedule = scheduler.scheduleJob(date, () => checkGardenWater()); // Set the schedule
  global.schedules.push(schedule);
  serviceHelper.log(
    'info',
    `Water garden schedule will run on ${dateformat(date, 'dd-mm-yyyy @ HH:MM')}`,
  );
  return true;
}

/**
 * Set up garden need watering notifications
 */
exports.setup = async () => {
  try {
    // Get data from data store
    const SQL = 'SELECT name, hour, minute, ai_override FROM garden_schedules WHERE type = 0 and active';
    serviceHelper.log(
      'trace',
      'Connect to data store connection pool',
    );
    const dbConnection = await serviceHelper.connectToDB('flowercare');
    serviceHelper.log(
      'trace',
      'Get timer settings',
    );
    const results = await dbConnection.query(SQL);
    serviceHelper.log(
      'trace',
      'Release the data store connection back to the pool',
    );
    await dbConnection.end(); // Close data store connection

    if (results.rowCount === 0) {
      // Exit function as no data to process
      serviceHelper.log(
        'info',
        'No Water Garden timers are active',
      );
      return false;
    }

    // Setup timers
    results.rows.map(async (info) => {
      await setupSchedule(info);
    });
  } catch (err) {
    serviceHelper.log(
      'error',
      err.message,
    );
  }
  return true;
};
