/**
 * Import external libraries
 */
const miflora = require('miflora');

/**
 * @type get
 * @path /sensors/scan
 */
async function _scanDevices(req, res, next) {
  this.logger.debug(`${this._traceStack()} - Scan for BLE devices API called`);

  const devices = await miflora.discover();
  if (devices instanceof Error) {
    this.logger.error(`${this._traceStack()} - ${devices.message}`);
    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 500, devices);
    }
    return devices;
  }

  this.logger.info(`Discovered ${devices.length} devices`);

  const returnJSON = [];
  devices.map(async (device) => {
    returnJSON.push(device.responseTemplate);
  });

  if (typeof res !== 'undefined' && res !== null) {
    this._sendResponse(res, next, 200, returnJSON);
  }
  return returnJSON;
}

/**
 * @type get
 * @path /sensors/:gardenSensorAddress
 */

async function _sensors(req, res, next) {
  this.logger.debug(
    `${this._traceStack()} - Display garden sensor data API called`,
  );

  const { gardenSensorAddress } = req.params;
  if (
    typeof gardenSensorAddress === 'undefined' ||
    gardenSensorAddress === null ||
    gardenSensorAddress === ''
  ) {
    const err = new Error('Missing param: gardenSensor');
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 400, err);
    }
    return err;
  }

  const { durationSpan } = req.params;

  let durationTitle;
  let timeBucket;
  let interval;

  try {
    switch (durationSpan) {
      case 'year':
        timeBucket = '6 hours';
        interval = '1 year';
        durationTitle = 'Last year';
        break;
      case 'month':
        timeBucket = '3 hours';
        interval = '1 month';
        durationTitle = 'Last month';
        break;
      case 'week':
        timeBucket = '1 hour';
        interval = '1 week';
        durationTitle = 'Last week';
        break;
      case 'day':
        timeBucket = '30 minutes';
        interval = '1 day';
        durationTitle = 'Last 24 hours';
        break;
      default:
        // Hour
        timeBucket = '1 minute';
        interval = '1 hour';
        durationTitle = 'Last hour';
        break;
    }

    const sql = `SELECT time_bucket('${timeBucket}', time) AS timeofday, avg(sunlight) as sunlight, plant_name as plantName, avg(moisture) as moisture, avg(fertiliser) as fertiliser, min(battery) as battery FROM garden_sensor INNER JOIN garden_sensor_plant ON garden_sensor.address = garden_sensor_plant.address WHERE garden_sensor.address='${gardenSensorAddress}' and time > NOW() - interval '${interval}' GROUP BY timeofday, plant_name ORDER BY timeofday DESC`;
    this.logger.trace(
      `${this._traceStack()} - Connect to data store connection pool`,
    );
    const dbConnection = await this._connectToDB.call(this, 'flowercare');
    this.logger.trace(`${this._traceStack()} - Get sensor data`);
    const results = await dbConnection.query(sql);
    this.logger.trace(
      `${this._traceStack()} - Release the data store connection back to the pool`,
    );
    await dbConnection.end(); // Close data store connection

    if (results.rowCount === 0) {
      this.logger.trace(`${this._traceStack()} - No data to return`);
    }
    results.DurationTitle = durationTitle;
    results.rows.reverse();
    const returnData = results.rows;
    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 200, returnData);
    }
    return returnData;
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 500, err);
    }
  }
  return true;
}

/**
 * @type get
 * @path /zones
 */
async function _zones(req, res, next) {
  this.logger.debug(
    `${this._traceStack()} - Display garden sensors for a given zone API called`,
  );

  let { zone } = req.params;
  if (typeof zone === 'undefined' || zone === null || zone === '') {
    const err = new Error('Missing param: zone');
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 400, err);
    }
    return err;
  }

  try {
    zone = zone.replace('-', ',');
    const sql = `SELECT plant_name as plantName, threshold_moisture as thresholdMoisture, address, sensor_label as sensorlabel FROM garden_sensor_plant WHERE zone in (${zone}) ORDER BY zone, sensor_label`;
    this.logger.trace(
      `${this._traceStack()} - Connect to data store connection pool`,
    );
    const dbConnection = await this._connectToDB.call(this, 'flowercare');
    this.logger.trace(`${this._traceStack()} - Get sensor values`);
    const results = await dbConnection.query(sql);
    this.logger.trace(
      `${this._traceStack()} - Release the data store connection back to the pool`,
    );
    await dbConnection.end(); // Close data store connection

    if (results.rowCount === 0) {
      this.logger.trace(`${this._traceStack()} - No data to return`);
    }
    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 200, results.rows);
    }
    return results.rows;
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 500, err);
    }
    return err;
  }
}

/**
 * @type get
 * @path /sensors/zone/:zone
 */
async function _sensorsZone(req, res, next) {
  this.logger.debug(
    `${this._traceStack()} - Display garden sensors for given zone(s) API called`,
  );

  const { zone } = req.params;
  if (typeof zone === 'undefined' || zone === null || zone === '') {
    const err = new Error('Missing param: zone');
    this.logger.error(`${this._traceStack()} - ${err.message}`);

    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 400, err);
    }
    return err;
  }

  try {
    const zoneData = await _zones.call(
      this,
      { params: req.params },
      null,
      null,
    );
    if (zoneData instanceof Error) {
      this.logger.error(`${this._traceStack()} - ${zoneData.message}`);
      return zoneData;
    }

    const returnData = [];
    await Promise.all(
      zoneData.map(async (info) => {
        const tmpJSON = info;
        const tmpResult = await _sensors.call(
          this,
          {
            params: {
              gardenSensorAddress: info.address,
              durationSpan: req.params.durationSpan,
            },
          },
          null,
          null,
        );
        if (tmpResult instanceof Error) {
          this.logger.error(`${this._traceStack()} - ${tmpResult.message}`);
        } else {
          tmpJSON.readings = tmpResult;
        }
        returnData.push(tmpJSON);
      }),
    );

    this.logger.trace(`${this._traceStack()} - Re-order array`);
    returnData.sort((a, b) => (a.sensorlabel < b.sensorlabel ? -1 : 1));

    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 200, returnData);
    }
    return returnData;
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 500, err);
    }
  }
  return true;
}

/**
 * @type get
 * @path /sensors/current
 */
async function _current(req, res, next) {
  this.logger.debug(
    `${this._traceStack()} - Display latest garden sensor data API called`,
  );
  try {
    const sql =
      "SELECT address, sensor_label, plant_name, moisture, threshold_moisture, fertiliser, threshold_fertilizer, battery FROM vw_plant_data WHERE time > NOW() - interval '1 hour' GROUP BY address, sensor_label, plant_name, moisture, threshold_moisture, fertiliser, threshold_fertilizer, battery ORDER BY sensor_label";
    this.logger.trace(
      `${this._traceStack()} - Connect to data store connection pool`,
    );
    const dbConnection = await this._connectToDB.call(this, 'flowercare');
    this.logger.trace(`${this._traceStack()} - Get sensor data`);
    const results = await dbConnection.query(sql);
    this.logger.trace(
      `${this._traceStack()} - Release the data store connection back to the pool`,
    );
    await dbConnection.end(); // Close data store connection

    if (results.rowCount === 0) {
      this.logger.error(
        `${this._traceStack()} - No data exists in the last hour`,
      );
      this._sendResponse(res, next, 200, {});
      return;
    }

    const returnData = results.rows;
    this._sendResponse(res, next, 200, returnData);
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 500, err);
    }
  }
}

/**
 * @type get
 * @path /needswater
 */
async function _needsWater(req, res, next) {
  this.logger.debug(`${this._traceStack()} - Needs watering API called`);
  try {
    const sql =
      'SELECT address, sensor_label, plant_name, moisture, threshold_moisture, zone FROM vw_water_plants';
    this.logger.trace(
      `${this._traceStack()} - Connect to data store connection pool`,
    );
    const dbConnection = await this._connectToDB.call(this, 'flowercare');
    this.logger.trace(`${this._traceStack()} - Get sensor data`);
    const results = await dbConnection.query(sql);
    this.logger.trace(
      `${this._traceStack()} - Release the data store connection back to the pool`,
    );
    await dbConnection.end(); // Close data store connection

    const returnData = results.rows;
    this._sendResponse(res, next, 200, returnData);
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 500, err);
    }
  }
}

module.exports = {
  _scanDevices,
  _sensors,
  _zones,
  _sensorsZone,
  _current,
  _needsWater,
};
