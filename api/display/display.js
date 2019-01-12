/**
 * Import external libraries
 */
const Skills = require('restify-router').Router;

/**
 * Import helper libraries
 */
const serviceHelper = require('../../lib/helper.js');
const dynsonHelper = require('../../collectors/dyson/purecool.js');

const skill = new Skills();

/**
 * @api {get} /displaydysonpurecool
 * @apiName displaydysonpurecool
 * @apiGroup Display
 *
 * @apiSuccessExample {json} Success-Response:
 *   HTTPS/1.1 200 OK
 *   {
 *     "data": {
 *       "command": "SELECT",
 *       "rowCount": 2,
 *       "oid": null,
 *       "DurationTitle": "Daily"
 *       "rows": [
 *           {
 *              "time": "2018-10-21T08:50:06.369Z",
 *              "air_quality": 2,
 *              "temperature": 19,
 *              "humidity": 75
 *           },
 *           ...
 *         }
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
async function displayDysonPureCoolData(req, res, next) {
  serviceHelper.log('trace', 'displayDysonPureCoolData', 'Display Dyson PureCool data API called');

  let durationSpan = null;
  if (typeof req.body !== 'undefined') ({ durationSpan } = req.body);

  let durationTitle;
  let SQL;

  try {
    switch (durationSpan) {
      case 'daily':
        SQL = 'SELECT time_bucket(\'1 day\', time) AS daily, avg(air_quality) as air_quality, avg(temperature) as temperature, avg(humidity) as humidity FROM dyson_purecool GROUP BY daily ORDER BY daily DESC LIMIT 7';
        durationTitle = 'Last 7 days';
        break;
      case 'hourly':
        SQL = 'SELECT time_bucket(\'1 hour\', time) AS hourly, avg(air_quality) as air_quality, avg(temperature) as temperature, avg(humidity) as humidity FROM dyson_purecool GROUP BY hourly ORDER BY hourly DESC LIMIT 24';
        durationTitle = 'Last 24 Hours';
        break;
      default:
        SQL = 'SELECT time_bucket(\'15 minutes\', time) AS fifteen_minutes, avg(air_quality) as air_quality, avg(temperature) as temperature, avg(humidity) as humidity FROM dyson_purecool GROUP BY fifteen_minutes ORDER BY fifteen_minutes DESC LIMIT 240'; // 4 hrs view every 15 minutes
        durationTitle = 'Last 4 Hours';
        break;
    }

    serviceHelper.log('trace', 'displayDysonPureCoolData', 'Connect to data store connection pool');
    const dbClient = await global.devicesDataClient.connect(); // Connect to data store
    serviceHelper.log('trace', 'displayDysonPureCoolData', 'Get sensor values');
    const results = await dbClient.query(SQL);
    serviceHelper.log('trace', 'displayDysonPureCoolData', 'Release the data store connection back to the pool');
    await dbClient.release(); // Return data store connection back to pool

    if (results.rowCount === 0) {
      serviceHelper.log('error', 'displayDysonPureCoolData', 'Failed to return any data for the Dyson Pure Cool');
      return;
    }
    serviceHelper.log('trace', 'displayDysonPureCoolData', 'Return data back to caller');
    results.DurationTitle = durationTitle;
    serviceHelper.sendResponse(res, true, results);
    next();
  } catch (err) {
    serviceHelper.log('error', 'displayDysonPureCoolData', err.message);
    serviceHelper.sendResponse(res, false, err);
    next();
  }
}
skill.get('/displaydysonpurecooldata', displayDysonPureCoolData);

/**
 * @api {get} /displaydysonpurecool
 * @apiName displaydysonpurecool
 * @apiGroup Display
 *
 * @apiSuccessExample {json} Success-Response:
 *   HTTPS/1.1 200 OK
 *   {
 *     "data": {
 *       "command": "SELECT",
 *       "rowCount": 2,
 *       "oid": null,
 *       "DurationTitle": "Daily"
 *       "rows": [
 *           {
 *              "time": "2018-10-21T08:50:06.369Z",
 *              "air_quality": 2,
 *              "temperature": 19,
 *              "humidity": 75
 *           },
 *           ...
 *         }
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
async function dysonPureCoolLatest(req, res, next) {
  serviceHelper.log('trace', 'dysonPureCoolLatest', 'Display Dyson PureCool latest readings API called');
  try {
    const results = await dynsonHelper.getPureCoolData(); // Collect Dyson Pure Cool device data
    serviceHelper.sendResponse(res, true, results);
    next();
  } catch (err) {
    serviceHelper.log('error', 'dysonPureCoolLatest', err.message);
    serviceHelper.sendResponse(res, false, err);
    next();
  }
}
skill.get('/dysonpurecoollatest', dysonPureCoolLatest);

module.exports = skill;
