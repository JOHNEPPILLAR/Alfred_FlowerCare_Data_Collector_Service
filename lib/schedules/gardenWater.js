async function checkGardenWater() {
  this.logger.trace(`${this._traceStack()} - Checking water levels`);

  let gardenWatering = false;
  let houseWatering = false;

  try {
    const toWaterSQL = 'SELECT * FROM vw_water_plants';
    this.logger.trace(
      `${this._traceStack()} - Connect to data store connection pool`,
    );
    const dbConnection = await this._connectToDB.call(this, 'flowercare');
    this.logger.trace(
      `${this._traceStack()} - Getting garden sensors that need watering`,
    );
    const needsWatering = await dbConnection.query(toWaterSQL);
    this.logger.trace(
      `${this._traceStack()} - Release the data store connection back to the pool`,
    );
    await dbConnection.end(); // Close data store connection

    if (needsWatering.rowCount === 0) {
      this.logger.info('Nothing needs watering');
      return;
    } // Exit function as no data to process

    // Zone data
    const zone1 = needsWatering.rows.filter((z) => z.zone === 1);
    const zone2 = needsWatering.rows.filter((z) => z.zone === 2);
    const zone3 = needsWatering.rows.filter((z) => z.zone === 3);
    const zone4 = needsWatering.rows.filter((z) => z.zone === 4);
    const zone5 = needsWatering.rows.filter((z) => z.zone === 5);

    if (zone3.length > 0 || zone4.length > 0 || zone5.length > 0)
      houseWatering = true; // House zone need watering
    if (zone1.length > 0 || zone2.length > 0) {
      // Garden zones
      gardenWatering = true;
      this.logger.trace(`${this._traceStack()} - Checking if it will rain`);
      const willItRain = await this._callAlfredServiceGet.call(
        this,
        `${process.env.ALFRED_WEATHER_SERVICE}/willitrain?forcastDuration=5`,
      );

      if (!(willItRain instanceof Error)) {
        if (
          willItRain.precipProbability > 0.5 &&
          willItRain.precipIntensity > 0.5
        ) {
          this.logger.trace(
            `${this._traceStack()} - Chance of moderate rain is high, so will not activate water system`,
          );
          return;
        }
      }

      // Connect to Link-tap controller
      const url = 'https://www.link-tap.com/api/activateInstantMode';
      const LinkTapUser = await this._getVaultSecret.call(this, 'LinkTapUser');
      const LinkTapKey = await this._getVaultSecret.call(this, 'LinkTapKey');
      const LinkTapGatewayID = await this._getVaultSecret.call(
        this,
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
        LinkTapLinkerID = await this._getVaultSecret.call(
          this,
          'LinkTapZone1ID',
        );
        body.taplinkerId = LinkTapLinkerID;
        body.duration = 3;

        this.logger.trace(
          `${this._traceStack()} - Turning on zone 1 watering system`,
        );
        const returnData = await this._callAPIServicePut.call(this, url, body);
        if (returnData instanceof Error) {
          this.logger.error(`${this._traceStack()} - ${returnData.message}`);
        }
      }

      // Zone 2
      if (zone2.length > 0) {
        LinkTapLinkerID = await this._getVaultSecret.call(
          this,
          'LinkTapZone2ID',
        );
        body.taplinkerId = LinkTapLinkerID;
        body.duration = 3;

        this.logger.trace(
          `${this._traceStack()} - Turning on zone 2 watering system`,
        );
        const returnData = await this._callAPIServicePut.call(this, url, body);
        if (returnData instanceof Error) {
          this.logger.error(`${this._traceStack()} - ${returnData.message}`);
        }
      }
    }

    let notificationText;
    if (gardenWatering) {
      notificationText = 'Automatic garden 💦started';
    }
    if (houseWatering) {
      notificationText = 'House 🌻need 💦';
    }
    this._sendPushNotification.call(this, notificationText);
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
  }
}

async function setupSchedule(data) {
  this.logger.trace(
    `${this._traceStack()} - Create water garden timer(s) from ${
      data.name
    } schedule data`,
  );

  if (data.hour === null || data.minute === null) {
    this.logger.error(`${this._traceStack()} - Schedule values were null`);
    return false;
  }

  this.logger.trace(
    `${this._traceStack()} - Register plant water check schedule`,
  );
  this.schedules.push({
    hour: data.hour,
    minute: data.minute,
    description: 'Plant water check',
    functionToCall: checkGardenWater,
  });
  return true;
}

/**
 * Set up garden need watering notifications
 */
async function setupSchedules() {
  try {
    // Setup water check schedules
    this.logger.trace(`${this._traceStack()} - Setting up Schedules`);

    const sql =
      'SELECT name, hour, minute, ai_override FROM garden_schedules WHERE type = 0 and active';
    this.logger.trace(`${this._traceStack()} - Connect to data store`);
    const dbConnection = await this._connectToDB.call(this, 'flowercare');
    this.logger.trace(`${this._traceStack()} - Get commute schedule settings`);
    const results = await dbConnection.query(sql);
    this.logger.trace(
      `${this._traceStack()} - Release the data store and close the connection`,
    );
    await dbConnection.end(); // Close data store connection

    if (results.rowCount === 0) {
      // Exit function as no data to process
      this.logger.trace(
        `${this._traceStack()} - No Water Garden timers are active`,
      );
      return false;
    }

    // Setup schedules
    await Promise.all(
      results.rows.map(async (info) => {
        await setupSchedule.call(this, info);
      }),
    );
    return true;
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
  }
  return true;
}

module.exports = {
  setupSchedules,
};
