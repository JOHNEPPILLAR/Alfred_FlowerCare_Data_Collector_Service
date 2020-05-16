/**
 * Import external libraries
 */
const Skills = require('restify-router').Router;

/**
 * Import helper libraries
 */
const serviceHelper = require('alfred-helper');

const skill = new Skills();

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
    serviceHelper.log(
      'info',
      'Missing param: gardenSensor',
    );
    serviceHelper.sendResponse(
      res,
      400,
      'Missing param: gardenSensor',
    );
    next();
    return;
  }

  let durationSpan = null;
  if (typeof req.query !== 'undefined') ({ durationSpan } = req.query);

  let durationTitle;
  let SQL;

  try {
    switch (durationSpan) {
      case 'month':
        SQL = `SELECT time_bucket('6 hours', time) AS timeofday, avg(sunlight) as sunlight, plant_name, avg(moisture) as moisture, avg(fertiliser) as fertiliser, min(battery) as battery FROM garden_sensor INNER JOIN garden_sensor_plant ON garden_sensor.address = garden_sensor_plant.address WHERE garden_sensor.address='${gardenSensorAddress}' and time > NOW() - interval '1 month' GROUP BY timeofday, plant_name ORDER BY timeofday DESC`;
        durationTitle = 'Last month';
        break;
      case 'week':
        SQL = `SELECT time_bucket('3 hours', time) AS timeofday, avg(sunlight) as sunlight, plant_name, avg(moisture) as moisture, avg(fertiliser) as fertiliser, min(battery) as battery FROM garden_sensor INNER JOIN garden_sensor_plant ON garden_sensor.address = garden_sensor_plant.address WHERE garden_sensor.address='${gardenSensorAddress}' and time > NOW() - interval '1 week' GROUP BY timeofday, plant_name ORDER BY timeofday DESC`;
        durationTitle = 'Last weeks';
        break;
      case 'day':
        SQL = `SELECT time_bucket('30 minutes', time) AS timeofday, plant_name, avg(sunlight) as sunlight, avg(moisture) as moisture, avg(fertiliser) as fertiliser, min(battery) as battery FROM garden_sensor INNER JOIN garden_sensor_plant ON garden_sensor.address = garden_sensor_plant.address WHERE garden_sensor.address='${gardenSensorAddress}' and time > NOW() - interval '1 day' GROUP BY timeofday, plant_name ORDER BY timeofday DESC`;
        durationTitle = 'Today';
        break;
      default: // Hour
        SQL = `SELECT time_bucket('1 minute', time) AS timeofday, plant_name, avg(sunlight) as sunlight, avg(moisture) as moisture, avg(fertiliser) as fertiliser, min(battery) as battery FROM garden_sensor INNER JOIN garden_sensor_plant ON garden_sensor.address = garden_sensor_plant.address WHERE garden_sensor.address='${gardenSensorAddress}' and time > NOW() - interval '1 hour' GROUP BY timeofday, plant_name ORDER BY timeofday DESC`;
        durationTitle = 'Last hour';
        break;
    }

    serviceHelper.log(
      'trace',
      'Connect to data store connection pool',
    );
    const dbConnection = await serviceHelper.connectToDB('flowercare');
    serviceHelper.log(
      'trace',
      'Get sensor values',
    );
    const results = await dbConnection.query(SQL);
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
      serviceHelper.sendResponse(
        res,
        200,
        {},
      );
      return;
    }
    serviceHelper.log(
      'trace',
      'Return data back to caller',
    );
    results.DurationTitle = durationTitle;
    results.rows.reverse();
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
  '/sensors/:gardenSensorAddress',
  sensors,
);

/**
 * @type get
 * @path /sensors/:gardenSensorAddress
 */
async function current(req, res, next) {
  serviceHelper.log(
    'trace',
    'Display latest garden sensor readings API called',
  );
  try {
    const SQL = 'SELECT address, sensor_label, plant_name, moisture, threshold_moisture, fertiliser, threshold_fertilizer, battery FROM vw_plant_data WHERE time > NOW() - interval \'1 hour\' GROUP BY address, sensor_label, plant_name, moisture, threshold_moisture, fertiliser, threshold_fertilizer, battery ORDER BY sensor_label';
    serviceHelper.log(
      'trace',
      'Connect to data store connection pool',
    );
    const dbConnection = await serviceHelper.connectToDB('flowercare');
    serviceHelper.log(
      'trace',
      'Get sensor values',
    );
    const results = await dbConnection.query(SQL);
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
