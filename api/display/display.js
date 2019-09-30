/**
 * Import external libraries
 */
const Skills = require('restify-router').Router;

/**
 * Import helper libraries
 */
const serviceHelper = require('alfred_helper');

const skill = new Skills();

/**
 * @api {get} /all
 * @apiName all
 * @apiGroup Display
 *
 * @apiSuccessExample {json} Success-Response:
 *   HTTPS/1.1 200 OK
 *   {
 *     "data": [
 *       {
 *          "timeofday": "2019-04-28T17:00:00.000Z",
 *          "plant_name": "Strawberry basket by window",
 *          "sunlight": 112.230769230769,
 *          "moisture": 0.307692307692308,
 *          "fertiliser": 0
 *      },
 *      ...
 *     ]
 *   }
 *
 * @apiErrorExample {json} Error-Response:
 *   HTTPS/1.1 400 Bad Request
 *   {
 *     data: Error message
 *   }
 *
 */
async function all(req, res, next) {
  serviceHelper.log('trace', 'Display all garden sensor data API called');

  let durationSpan = null;
  if (typeof req.query !== 'undefined') ({ durationSpan } = req.query);

  const { gardenSensorAddress } = req.query;
  if (typeof gardenSensorAddress === 'undefined' || gardenSensorAddress === null || gardenSensorAddress === '') {
    serviceHelper.log('info', 'Missing param: gardenSensor');
    serviceHelper.sendResponse(res, 400, 'Missing param: gardenSensor');
    next();
    return;
  }

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
      case 'hour':
        SQL = `SELECT time_bucket('1 minute', time) AS timeofday, plant_name, avg(sunlight) as sunlight, avg(moisture) as moisture, avg(fertiliser) as fertiliser, min(battery) as battery FROM garden_sensor INNER JOIN garden_sensor_plant ON garden_sensor.address = garden_sensor_plant.address WHERE garden_sensor.address='${gardenSensorAddress}' and time > NOW() - interval '1 hour' GROUP BY timeofday, plant_name ORDER BY timeofday DESC`;
        durationTitle = 'Last hour';
        break;
      default:
        SQL = `SELECT time_bucket('1 minute', time) AS timeofday, plant_name, avg(sunlight) as sunlight, avg(moisture) as moisture, avg(fertiliser) as fertiliser, min(battery) as battery FROM garden_sensor INNER JOIN garden_sensor_plant ON garden_sensor.address = garden_sensor_plant.address WHERE garden_sensor.address='${gardenSensorAddress}' and time > NOW() - interval '1 hour' GROUP BY timeofday, plant_name ORDER BY timeofday DESC`;
        durationTitle = 'Last hour';
        break;
    }

    serviceHelper.log('trace', 'Connect to data store connection pool');
    const dbClient = await global.devicesDataClient.connect(); // Connect to data store
    serviceHelper.log('trace', 'Get sensor values');
    const results = await dbClient.query(SQL);
    serviceHelper.log('trace', 'Release the data store connection back to the pool');
    await dbClient.release(); // Return data store connection back to pool

    if (results.rowCount === 0) {
      serviceHelper.log('trace', 'No data to return');
      serviceHelper.sendResponse(res, true, 'No data to return');
      return;
    }
    serviceHelper.log('trace', 'Return data back to caller');
    results.DurationTitle = durationTitle;
    results.rows.reverse();
    const returnData = results.rows;
    serviceHelper.sendResponse(res, true, returnData);
    next();
  } catch (err) {
    serviceHelper.log('error', err.message);
    serviceHelper.sendResponse(res, false, err);
    next();
  }
}
skill.get('/all', all);

/**
 * @api {get} /current
 * @apiName current
 * @apiGroup Display
 *
 * @apiSuccessExample {json} Success-Response:
 *   HTTPS/1.1 200 OK
 *   {
 *     "data": {
 *           "time": "2019-05-19T08:01:08.453Z",
 *           "sender": "production",
 *           "address": "c4:7c:8d:66:2a:ea",
 *           "identifier": "MiFloraMonitor",
 *           "battery": 98,
 *           "sunlight": 23825,
 *           "moisture": 15,
 *           "fertiliser": 84
 *     }
 *   }
 *
 * @apiErrorExample {json} Error-Response:
 *   HTTPS/1.1 400 Bad Request
 *   {
 *     data: Error message
 *   }
 *
 */
async function current(req, res, next) {
  serviceHelper.log('trace', 'Display latest garden sensor readings API called');
  try {
    const SQL = 'SELECT address, sensor_label, plant_name, moisture, threshold_moisture, fertiliser, threshold_fertilizer, battery FROM vw_plant_data WHERE time > NOW() - interval \'1 hour\' GROUP BY address, sensor_label, plant_name, moisture, threshold_moisture, fertiliser, threshold_fertilizer ORDER BY sensor_label';
    serviceHelper.log('trace', 'Connect to data store connection pool');
    const dbClient = await global.devicesDataClient.connect(); // Connect to data store
    serviceHelper.log('trace', 'Get sensor values');
    const results = await dbClient.query(SQL);
    serviceHelper.log('trace', 'Release the data store connection back to the pool');
    await dbClient.release(); // Return data store connection back to pool

    if (results.rowCount === 0) {
      serviceHelper.log('trace', 'No data exists in the last hour');
      serviceHelper.sendResponse(res, false, 'No results');
      next();
      return;
    }
    serviceHelper.log('trace', 'Return data back to caller');

    const returnData = results.rows;
    serviceHelper.sendResponse(res, true, returnData);
    next();
  } catch (err) {
    serviceHelper.log('error', err.message);
    serviceHelper.sendResponse(res, false, err);
    next();
  }
}
skill.get('/current', current);

module.exports = skill;
