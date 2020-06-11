/**
 * Import external libraries
 */
const Skills = require('restify-router').Router;
const miflora = require('miflora');

/**
 * Import helper libraries
 */
const serviceHelper = require('alfred-helper');

const skill = new Skills();

/**
 * @type get
 * @path /scan
 */
async function scanDevices(req, res, next) {
  serviceHelper.log(
    'trace',
    'Scan for BLE devices',
  );

  const devices = await miflora.discover();
  if (devices instanceof Error) {
    serviceHelper.log(
      'error',
      devices.message,
    );
    serviceHelper.sendResponse(
      res,
      500,
      devices,
    );
    next();
    return devices;
  }

  serviceHelper.log(
    'info',
    `Discovered ${devices.length} devices`,
  );

  const returnJSON = [];
  devices.map(async (device) => {
    returnJSON.push(device.responseTemplate);
  });

  if (typeof res !== 'undefined' && res !== null) {
    serviceHelper.sendResponse(
      res,
      200,
      returnJSON,
    );
    next();
  }
  return returnJSON;
}
skill.get(
  '/scan',
  scanDevices,
);

/**
 * @type get
 * @path /sensors/:gardenSensorAddress
 */
async function sensors(req, res, next) {
  serviceHelper.log(
    'trace',
    'Display garden sensor data API called',
  );

  const { gardenSensorAddress } = req.params;
  if (typeof gardenSensorAddress === 'undefined'
    || gardenSensorAddress === null
    || gardenSensorAddress === '') {
    const err = new Error('Missing param: gardenSensor');
    serviceHelper.log(
      'info',
      err.message,
    );
    if (typeof res !== 'undefined' && res !== null) {
      serviceHelper.sendResponse(
        res,
        400,
        err.message,
      );
      next();
    }
    return err;
  }

  const { durationSpan } = req.params;

  let durationTitle;
  let timeBucket;
  let interval;
  let sql;

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
      default: // Hour
        timeBucket = '1 minute';
        interval = '1 hour';
        durationTitle = 'Last hour';
        break;
    }

    sql = `SELECT time_bucket('${timeBucket}', time) AS timeofday, avg(sunlight) as sunlight, plant_name as plantName, avg(moisture) as moisture, avg(fertiliser) as fertiliser, min(battery) as battery FROM garden_sensor INNER JOIN garden_sensor_plant ON garden_sensor.address = garden_sensor_plant.address WHERE garden_sensor.address='${gardenSensorAddress}' and time > NOW() - interval '${interval}' GROUP BY timeofday, plant_name ORDER BY timeofday DESC`;
    serviceHelper.log(
      'trace',
      'Connect to data store connection pool',
    );
    const dbConnection = await serviceHelper.connectToDB('flowercare');
    serviceHelper.log(
      'trace',
      'Get sensor values',
    );
    const results = await dbConnection.query(sql);
    serviceHelper.log(
      'trace',
      'Release the data store connection back to the pool',
    );
    await dbConnection.end(); // Close data store connection

    if (results.rowCount === 0) {
      serviceHelper.log(
        'trace',
        'No data to return',
      );
    }
    serviceHelper.log(
      'trace',
      'Return data back to caller',
    );
    results.DurationTitle = durationTitle;
    results.rows.reverse();
    const returnData = results.rows;
    if (typeof res !== 'undefined' && res !== null) {
      serviceHelper.sendResponse(
        res,
        200,
        returnData,
      );
      next();
    }
    return returnData;
  } catch (err) {
    serviceHelper.log(
      'error',
      err.message,
    );
    serviceHelper.sendResponse(
      res,
      500,
      err,
    );
    next();
  }
  return true;
}
skill.get(
  '/sensors/:gardenSensorAddress',
  sensors,
);

/**
 * @type get
 * @path /zones
 */
async function zones(req, res, next) {
  serviceHelper.log(
    'trace',
    'Display garden sensors for a given zone API called',
  );

  let { zone } = req.params;
  if (typeof zone === 'undefined'
    || zone === null
    || zone === '') {
    const err = new Error('Missing param: zone');
    serviceHelper.log(
      'info',
      err.message,
    );
    serviceHelper.sendResponse(
      res,
      400,
      err.message,
    );
    next();
    return err;
  }

  try {
    zone = zone.replace('-', ',');
    const sql = `SELECT plant_name as plantName, address, sensor_label as sensorlabel FROM garden_sensor_plant WHERE zone in (${zone}) ORDER BY zone, sensor_label`;
    serviceHelper.log(
      'trace',
      'Connect to data store connection pool',
    );
    const dbConnection = await serviceHelper.connectToDB('flowercare');
    serviceHelper.log(
      'trace',
      'Get sensor values',
    );
    const results = await dbConnection.query(sql);
    serviceHelper.log(
      'trace',
      'Release the data store connection back to the pool',
    );
    await dbConnection.end(); // Close data store connection

    if (results.rowCount === 0) {
      serviceHelper.log(
        'trace',
        'No data to return',
      );
    }
    serviceHelper.log(
      'trace',
      'Return data back to caller',
    );
    if (typeof res !== 'undefined' && res !== null) {
      serviceHelper.sendResponse(
        res,
        200,
        results.rows,
      );
      next();
    }
    return results.rows;
  } catch (err) {
    serviceHelper.log(
      'error',
      err.message,
    );
    if (typeof res !== 'undefined' && res !== null) {
      serviceHelper.sendResponse(
        res,
        500,
        err,
      );
      next();
    }
    return err;
  }
}
skill.get(
  '/zones',
  zones,
);

/**
 * @type get
 * @path /sensors/zone/:zone
 */
async function sensorsZone(req, res, next) {
  serviceHelper.log(
    'trace',
    'Display garden sensors for a given zone API called',
  );

  const { zone } = req.params;
  if (typeof zone === 'undefined'
    || zone === null
    || zone === '') {
    const err = new Error('Missing param: zone');
    serviceHelper.log(
      'info',
      err.message,
    );
    if (typeof res !== 'undefined' && res !== null) {
      serviceHelper.sendResponse(
        res,
        400,
        err.message,
      );
      next();
    }
    return err;
  }

  try {
    const zoneData = await zones({ params: req.params }, null, null);
    if (zoneData instanceof Error) {
      serviceHelper.log(
        'error',
        zoneData.message,
      );
      return zoneData;
    }

    const returnData = [];
    await Promise.all(
      zoneData.map(async (info) => {
        const tmpJSON = info;
        const tmpResult = await sensors({
          params: {
            gardenSensorAddress: info.address,
            durationSpan: req.params.durationSpan,
          },
        },
        null,
        null);
        if (tmpResult instanceof Error) {
          serviceHelper.log(
            'error',
            tmpResult.message,
          );
        } else {
          tmpJSON.readings = tmpResult;
        }
        returnData.push(tmpJSON);
      }),
    );

    serviceHelper.log(
      'trace',
      're-order array',
    );
    returnData.sort((a, b) => ((a.sensorlabel < b.sensorlabel) ? -1 : 1));

    if (typeof res !== 'undefined' && res !== null) {
      serviceHelper.sendResponse(
        res,
        200,
        returnData,
      );
      next();
    }
    return returnData;
  } catch (err) {
    serviceHelper.log(
      'error',
      err.message,
    );
    serviceHelper.sendResponse(
      res,
      500,
      err,
    );
    next();
  }
  return true;
}
skill.get(
  '/sensors/zone/:zone',
  sensorsZone,
);

/**
 * @type get
 * @path /sensors/current
 */
async function current(req, res, next) {
  serviceHelper.log(
    'trace',
    'Display latest garden sensor readings API called',
  );
  try {
    const sql = 'SELECT address, sensor_label, plant_name, moisture, threshold_moisture, fertiliser, threshold_fertilizer, battery FROM vw_plant_data WHERE time > NOW() - interval \'1 hour\' GROUP BY address, sensor_label, plant_name, moisture, threshold_moisture, fertiliser, threshold_fertilizer, battery ORDER BY sensor_label';
    serviceHelper.log(
      'trace',
      'Connect to data store connection pool',
    );
    const dbConnection = await serviceHelper.connectToDB('flowercare');
    serviceHelper.log(
      'trace',
      'Get sensor values',
    );
    const results = await dbConnection.query(sql);
    serviceHelper.log(
      'trace',
      'Release the data store connection back to the pool',
    );
    await dbConnection.end(); // Close data store connection

    if (results.rowCount === 0) {
      serviceHelper.log(
        'trace',
        'No data exists in the last hour',
      );
      serviceHelper.sendResponse(
        res,
        200,
        {},
      );
      next();
      return;
    }
    serviceHelper.log(
      'trace',
      'Return data back to caller',
    );

    const returnData = results.rows;
    serviceHelper.sendResponse(
      res,
      200,
      returnData,
    );
    next();
  } catch (err) {
    serviceHelper.log(
      'error',
      err.message,
    );
    serviceHelper.sendResponse(
      res,
      500,
      err,
    );
    next();
  }
}
skill.get(
  '/sensors/current',
  current,
);

module.exports = skill;
