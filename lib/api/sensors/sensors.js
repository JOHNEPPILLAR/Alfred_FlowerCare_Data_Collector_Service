/**
 * Import external libraries
 */
const noble = require('@abandonware/noble');
const moment = require('moment');

/**
 * @type get
 * @path /sensors/scan
 */
async function _scanDevices(req, res, next) {
  this.logger.debug(`${this._traceStack()} - Scan for BLE devices API called`);

  await noble.startScanningAsync(['fe95'], false);
  if (typeof res !== 'undefined' && res !== null) {
    this._sendResponse(res, next, 200, { status: 'Scan started' });
  }
}

/**
 * @type get
 * @path /sensors/:gardenSensorAddress
 */
async function _sensors(req, res, next) {
  this.logger.debug(
    `${this._traceStack()} - Display garden sensor data API called`,
  );

  let dbConnection;
  let aggregate;
  let timeBucket;

  const { gardenSensorAddress } = req.params;
  let { duration } = req.params;

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

  if (typeof duration === 'undefined' || duration === null || duration === '')
    duration = 'hour';

  try {
    switch (duration.toLowerCase()) {
      case 'year':
        timeBucket = moment().utc().subtract(1, 'year').toDate();
        aggregate = [
          {
            $addFields: {
              Month: { $month: '$time' },
            },
          },
          {
            $match: {
              time: { $gt: timeBucket },
              device: gardenSensorAddress,
            },
          },
          {
            $group: {
              _id: '$Month',
              time: { $last: '$time' },
              device: { $last: '$device' },
              location: { $last: '$location' },
              plant: { $last: '$plant' },
              zone: { $last: '$zone' },
              battery: { $avg: '$battery' },
              temperature: { $avg: '$temperature' },
              lux: { $avg: '$lux' },
              moisture: { $avg: '$moisture' },
              fertility: { $avg: '$fertility' },
            },
          },
          { $sort: { _id: 1 } },
        ];
        break;
      case 'month':
        timeBucket = moment().utc().subtract(1, 'month').toDate();
        aggregate = [
          {
            $addFields: {
              Day: { $dayOfMonth: '$time' },
            },
          },
          {
            $match: {
              time: { $gt: timeBucket },
              device: gardenSensorAddress,
            },
          },
          {
            $group: {
              _id: '$Day',
              time: { $last: '$time' },
              device: { $last: '$device' },
              location: { $last: '$location' },
              plant: { $last: '$plant' },
              zone: { $last: '$zone' },
              battery: { $avg: '$battery' },
              temperature: { $avg: '$temperature' },
              lux: { $avg: '$lux' },
              moisture: { $avg: '$moisture' },
              fertility: { $avg: '$fertility' },
            },
          },
          { $sort: { _id: 1 } },
        ];
        break;
      case 'week':
        timeBucket = moment().utc().subtract(1, 'week').toDate();
        aggregate = [
          {
            $addFields: {
              Day: { $dayOfMonth: '$time' },
              Hour: { $hour: '$time' },
            },
          },
          {
            $match: {
              time: { $gt: timeBucket },
              device: gardenSensorAddress,
            },
          },
          {
            $group: {
              _id: { Day: '$Day', Hour: '$Hour' },
              time: { $last: '$time' },
              device: { $last: '$device' },
              location: { $last: '$location' },
              plant: { $last: '$plant' },
              zone: { $last: '$zone' },
              battery: { $avg: '$battery' },
              temperature: { $avg: '$temperature' },
              lux: { $avg: '$lux' },
              moisture: { $avg: '$moisture' },
              fertility: { $avg: '$fertility' },
            },
          },
          { $sort: { _id: 1 } },
        ];
        break;
      case 'day':
        timeBucket = moment().utc().subtract(1, 'day').toDate();
        aggregate = [
          {
            $match: {
              time: { $gt: timeBucket },
              device: gardenSensorAddress,
            },
          },
          { $sort: { _id: 1 } },
        ];
        break;
      default:
        // Hour
        timeBucket = moment().utc().subtract(1, 'hour').toDate();
        aggregate = [
          {
            $match: {
              time: { $gt: timeBucket },
              device: gardenSensorAddress,
            },
          },
          { $sort: { time: 1 } },
        ];
        break;
    }

    this.logger.trace(`${this._traceStack()} - Connect to db`);
    dbConnection = await this._connectToDB();
    this.logger.trace(`${this._traceStack()} - Execute query`);
    const results = await dbConnection
      .db(this.namespace)
      .collection(this.namespace)
      .aggregate(aggregate)
      .toArray();

    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 200, results);
    } else {
      return results;
    }
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 500, err);
    }
  } finally {
    this.logger.trace(`${this._traceStack()} - Close DB connection`);
    await dbConnection.close();
  }
  return true;
}

/**
 * @type get
 * @path /sensors/zones
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
  zone = zone.split`,`.map((x) => +x);

  let dbConnection;

  try {
    this.logger.trace(`${this._traceStack()} - Connect to db`);
    dbConnection = await this._connectToDB();
    this.logger.trace(`${this._traceStack()} - Execute query`);
    const query = { zone: { $in: zone } };
    const results = await dbConnection
      .db(this.namespace)
      .collection('devices')
      .find(query)
      .toArray();

    if (results.count === 0) {
      // Exit function as no data to process
      if (typeof res !== 'undefined' && res !== null) {
        this._sendResponse(res, next, 200, []);
      } else {
        return [];
      }
    }

    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 200, results);
    } else {
      return results;
    }
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 500, err);
    }
  } finally {
    this.logger.trace(`${this._traceStack()} - Close DB connection`);
    await dbConnection.close();
  }
  return true;
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

  this.logger.trace(`${this._traceStack()} - Get zones`);
  try {
    let zoneData = await _zones.call(this, { params: req.params }, null, null);
    if (zoneData instanceof Error) {
      this.logger.error(`${this._traceStack()} - ${zoneData.message}`);
      return zoneData;
    }

    this.logger.trace(`${this._traceStack()} - Remove non active devices`);
    zoneData = zoneData.filter((d) => d.active);

    let returnData = [];
    this.logger.trace(
      `${this._traceStack()} - Get readings for each device in the zone`,
    );
    await Promise.all(
      zoneData.map(async (info) => {
        const tmpJSON = info;
        const tmpResult = await _sensors.call(
          this,
          {
            params: {
              gardenSensorAddress: info.device,
              duration: req.params.duration,
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

    this.logger.trace(`${this._traceStack()} - Sort by plant name`);
    returnData = returnData.sort((a, b) => (a.plant < b.plant ? -1 : 1));

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

  let dbConnection;

  try {
    this.logger.trace(`${this._traceStack()} - Connect to db`);
    dbConnection = await this._connectToDB();
    this.logger.trace(`${this._traceStack()} - Execute query`);
    const lastHour = moment().utc().subtract(1, 'hour').toDate();
    const results = await dbConnection
      .db(this.namespace)
      .collection(this.namespace)
      .aggregate([
        { $match: { time: { $gt: lastHour } } },
        {
          $group: {
            _id: '$device',
            time: { $last: '$time' },
            device: { $last: '$device' },
            location: { $last: '$location' },
            plant: { $last: '$plant' },
            zone: { $last: '$zone' },
            battery: { $last: '$battery' },
            temperature: { $last: '$temperature' },
            lux: { $last: '$lux' },
            moisture: { $last: '$moisture' },
            fertility: { $last: '$fertility' },
          },
        },
      ])
      .toArray();

    if (results.count === 0) {
      // Exit function as no data to process
      if (typeof res !== 'undefined' && res !== null) {
        this._sendResponse(res, next, 200, []);
      } else {
        return [];
      }
    }

    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 200, results);
    } else {
      return results;
    }
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 500, err);
    }
  } finally {
    this.logger.trace(`${this._traceStack()} - Close DB connection`);
    await dbConnection.close();
  }
  return true;
}

/**
 * @type get
 * @path /needswater
 */
async function _needsWater(req, res, next) {
  this.logger.debug(`${this._traceStack()} - Needs watering API called`);

  let dbConnection;

  try {
    this.logger.trace(`${this._traceStack()} - Connect to db`);
    dbConnection = await this._connectToDB();
    this.logger.trace(`${this._traceStack()} - Execute query`);
    const lastHour = moment().utc().subtract(1, 'hour').toDate();
    const results = await dbConnection
      .db(this.namespace)
      .collection(this.namespace)
      .aggregate([
        {
          $match: {
            time: { $gt: lastHour },
            $expr: { $lt: ['$moisture', '$thresholdMoisture'] },
          },
        },
        {
          $group: {
            _id: '$device',
            time: { $last: '$time' },
            device: { $last: '$device' },
            location: { $last: '$location' },
            plant: { $last: '$plant' },
            zone: { $last: '$zone' },
            battery: { $last: '$battery' },
            temperature: { $last: '$temperature' },
            lux: { $last: '$lux' },
            moisture: { $last: '$moisture' },
            fertility: { $last: '$fertility' },
            thresholdMoisture: { $last: '$thresholdMoisture' },
          },
        },
      ])
      .toArray();

    if (results.count === 0) {
      // Exit function as no data to process
      if (typeof res !== 'undefined' && res !== null) {
        this._sendResponse(res, next, 200, []);
      } else {
        return [];
      }
    }

    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 200, results);
    } else {
      return results;
    }
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 500, err);
    }
  } finally {
    this.logger.trace(`${this._traceStack()} - Close DB connection`);
    await dbConnection.close();
  }
  return true;
}

module.exports = {
  _scanDevices,
  _sensors,
  _zones,
  _sensorsZone,
  _current,
  _needsWater,
};
