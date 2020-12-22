/**
 * Import external libraries
 */
const debug = require('debug')('Flower:Schedules');

async function checkGardenWater() {
  debug(`Checking water levels`);

  try {
    const results = await this._needsWater.call(this, null, null, null);
    if (results instanceof Error) {
      this.logger.error(`${this._traceStack()} - ${results.message}`);
      return;
    }

    if (results.length === 0) {
      this.logger.info('Nothing needs watering');
      return;
    } // Exit function as no data to process

    // Zone data
    const zone1 = results.filter((s) => s.zone === 1);
    const zone2 = results.filter((s) => s.zone === 2);
    const zone3 = results.filter((s) => s.zone === 3);
    const zone4 = results.filter((s) => s.zone === 4);
    const zone5 = results.filter((s) => s.zone === 5);

    // House zones
    if (zone3.length > 0 || zone4.length > 0 || zone5.length > 0)
      this._sendPushNotification.call(this, 'House plants needs 💦');
    else
      debug(`House plants do not need watering`);

    // Garden zones
    if (zone1.length > 0 || zone2.length > 0) {
      debug(`Garden needs watering`);
      debug(`Checking if it will rain`);
      const willItRain = await this._callAlfredServiceGet.call(
        this,
        `${process.env.ALFRED_WEATHER_SERVICE}/willitrain?forcastDuration=5`,
      );

      if (!(willItRain instanceof Error)) {
        if (
          willItRain.precipProbability > 0.5 &&
          willItRain.precipIntensity > 0.5
        ) {
          debug(`Chance of moderate rain is high, so will not activate water system`);
          return;
        }
      }

      debug(`It's not going to rain`);

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

        debug(`Turning on zone 1 watering system`);
        const returnData = await this._callAPIServicePut.call(this, url, body);
        if (returnData instanceof Error)
          this.logger.error(`${this._traceStack()} - ${returnData.message}`);
        else 
          this._sendPushNotification.call(this, '💦 garden zone 1');
      }

      // Zone 2
      if (zone2.length > 0) {
        LinkTapLinkerID = await this._getVaultSecret.call(
          this,
          'LinkTapZone2ID',
        );
        body.taplinkerId = LinkTapLinkerID;
        body.duration = 3;

        debug(`Turning on zone 2 watering system`);
        const returnData = await this._callAPIServicePut.call(this, url, body);
        if (returnData instanceof Error)
          this.logger.error(`${this._traceStack()} - ${returnData.message}`);
        else
          this._sendPushNotification.call(this, '💦 garden zone 2');
      }
    }
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
  }
}

async function setupSchedule(data) {
  debug(`Create water garden timer(s) from ${data.name} schedule`);

  if (data.hour === null || data.minute === null) {
    this.logger.error(`${this._traceStack()} - Schedule values were null`);
    return false;
  }

  debug(`Register plant water check schedule`);
  this.schedules.push({
    hour: data.hour,
    minute: data.minute,
    description: data.name,
    functionToCall: checkGardenWater,
  });
  return true;
}

/**
 * Set up garden need watering notifications
 */
async function setupSchedules() {
  debug(`Setting up Schedules`);

  try {
    let results = await this._listSchedules.call(this, null, null, null);
    if (results instanceof Error) {
      this.logger.error(`${this._traceStack()} - ${results.message}`);
    }
    // Filter for only active schedules
    results = results.filter((schedule) => schedule.active);

    // Setup schedules
    await Promise.all(
      results.map(async (schedule) => {
        await setupSchedule.call(this, schedule);
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
