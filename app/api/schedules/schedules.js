/**
 * Import external libraries
 */
const Skills = require('restify-router').Router;
const serviceHelper = require('alfred-helper');

const skill = new Skills();

/**
 * Import helper libraries
 */
const schedules = require('../../schedules/controller.js');

/**
 * @api {get} /schedules List all schedules
 * @apiName rooms
 * @apiGroup Sensors
 *
 * @apiSuccessExample {json} Success-Response:
 *   HTTPS/1.1 200 OK
 *   {
 *      "data": [
 *       {
 *           "id": 1,
 *           "type": 0,
 *           "name": "Morning Water",
 *           "hour": 7,
 *           "minute": 0,
 *           "ai_override": false,
 *           "active": true
 *       }
 *       ...
 *      ]
 *   }
 *
 * @apiErrorExample {json} Error-Response:
 *   HTTPS/1.1 500 Internal error
 *   {
 *     data: Error message
 *   }
 *
 */
async function listSchedules(req, res, next) {
  serviceHelper.log('trace', 'List schedules for a given room API called');

  try {
    const SQL = 'SELECT * FROM garden_schedules ORDER BY id';
    serviceHelper.log('trace', 'Connect to data store connection pool');
    const dbClient = await global.devicesDataClient.connect(); // Connect to data store
    serviceHelper.log('trace', 'Get sensors');
    const results = await dbClient.query(SQL);
    serviceHelper.log(
      'trace',
      'Release the data store connection back to the pool',
    );
    await dbClient.release(); // Return data store connection back to pool

    // Send data back to caler
    serviceHelper.sendResponse(res, true, results.rows);
    next();
  } catch (err) {
    serviceHelper.log('error', err.message);
    serviceHelper.sendResponse(res, false, err.message);
    next();
  }
  return true;
}
skill.get('/schedules', listSchedules);

/**
 * @api {get} /schedules List schedule
 * @apiName schedules
 * @apiGroup schedules
 *
 * @apiSuccessExample {json} Success-Response:
 *   HTTPS/1.1 200 OK
 *   {
 *      "data": [
 *       {
 *           "id": 1,
 *           "type": 0,
 *           "name": "Morning Water",
 *           "hour": 7,
 *           "minute": 0,
 *           "ai_override": false,
 *           "active": true
 *       }
 *      ]
 *   }
 *
 * @apiErrorExample {json} Error-Response:
 *   HTTPS/1.1 500 Internal error
 *   {
 *     data: Error message
 *   }
 *
 */
async function listSchedule(req, res, next) {
  serviceHelper.log('trace', 'View schedule API called');

  const { scheduleID } = req.params;

  try {
    const SQL = `SELECT * FROM garden_schedules WHERE id = ${scheduleID}`;
    serviceHelper.log('trace', 'Connect to data store connection pool');
    const dbClient = await global.devicesDataClient.connect(); // Connect to data store
    serviceHelper.log('trace', 'Get sensors');
    const results = await dbClient.query(SQL);
    serviceHelper.log(
      'trace',
      'Release the data store connection back to the pool',
    );
    await dbClient.release(); // Return data store connection back to pool

    // Send data back to caler
    serviceHelper.sendResponse(res, true, results.rows);
    next();
  } catch (err) {
    serviceHelper.log('error', err.message);
    serviceHelper.sendResponse(res, false, err.message);
    next();
  }
  return true;
}
skill.get('/schedules/:scheduleID', listSchedule);

/**
 * @api {put} /schedules/:scheduleID save schedule
 * @apiName save
 * @apiGroup Schedules
 *
 * @apiSuccessExample {json} Success-Response:
 *   HTTPS/1.1 200 OK
 *   {
 *      "data": { saved }
 *   }
 *
 * @apiErrorExample {json} Error-Response:
 *   HTTPS/1.1 500 Internal error
 *   {
 *     data: Error message
 *   }
 *
 */
async function saveSchedule(req, res, next) {
  serviceHelper.log('trace', 'Save Schedule API called');

  serviceHelper.log('trace', `Params: ${JSON.stringify(req.params)}`);
  serviceHelper.log('trace', `Body: ${JSON.stringify(req.body)}`);

  let dbClient;
  let results;

  const { scheduleID } = req.params;
  const {
    type,
    name,
    hour,
    minute,
    // eslint-disable-next-line camelcase
    ai_override,
    active,
  } = req.body;

  try {
    // Update data in data store
    const SQL = 'UPDATE garden_schedules SET type=$2, name=$3, hour=$4, minute=$5, ai_override=$6, active=$7 WHERE id = $1';
    // eslint-disable-next-line camelcase
    const SQLValues = [
      scheduleID,
      type,
      name,
      hour,
      minute,
      // eslint-disable-next-line camelcase
      ai_override,
      active,
    ];

    serviceHelper.log('trace', 'Connect to data store connection pool');
    dbClient = await global.devicesDataClient.connect(); // Connect to data store
    serviceHelper.log('trace', 'Save sensor schedule');
    results = await dbClient.query(SQL, SQLValues);
    serviceHelper.log(
      'trace',
      'Release the data store connection back to the pool',
    );
    await dbClient.release(); // Return data store connection back to pool

    // Send data back to caler
    if (results.rowCount === 1) {
      serviceHelper.log(
        'info',
        `Saved sensor data: ${JSON.stringify(req.body)}`,
      );

      serviceHelper.log('info', 'Reseting schedules');
      await schedules.setSchedule(true); // re-set light schedules

      serviceHelper.sendResponse(res, 200, 'saved');
    } else {
      serviceHelper.log('error', 'Failed to save data');
      serviceHelper.sendResponse(res, 500, 'failed to save');
    }
    next();
  } catch (err) {
    serviceHelper.log('error', err.message);
    serviceHelper.sendResponse(res, 500, err);
    next();
  }
  return true;
}
skill.put('/schedules/:scheduleID', saveSchedule);

module.exports = skill;
