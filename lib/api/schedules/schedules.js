/**
 * Import external libraries
 */
const Skills = require('restify-router').Router;
const serviceHelper = require('alfred-helper');

/**
 * Import helper libraries
 */
const schedules = require('../../schedules/controller.js');
const scheduleSchema = require('../../schemas/device_schedule.json');

const skill = new Skills();

/**
 * @type get
 * @path /schedules
 */
async function listSchedules(req, res, next) {
  serviceHelper.log(
    'trace',
    'List schedules for a given room API called',
  );

  try {
    const SQL = 'SELECT * FROM garden_schedules ORDER BY id';
    serviceHelper.log(
      'trace',
      'Connect to data store connection pool',
    );
    const dbConnection = await serviceHelper.connectToDB('flowercare');
    serviceHelper.log(
      'trace',
      'Get sensors',
    );
    const results = await dbConnection.query(SQL);
    serviceHelper.log(
      'trace',
      'Release the data store connection back to the pool',
    );
    await dbConnection.end(); // Close data store connection

    // Send data back to caler
    if (typeof res !== 'undefined' && res !== null) {
      serviceHelper.sendResponse(
        res,
        200,
        results.rows,
      );
      next();
    } else {
      return results.rows;
    }
  } catch (err) {
    serviceHelper.log(
      'error',
      err.message,
    );
    if (typeof res !== 'undefined' && res !== null) {
      serviceHelper.sendResponse(
        res,
        500,
        err.message,
      );
      next();
    } else {
      return err;
    }
  }
  return true;
}
skill.get(
  '/schedules',
  listSchedules,
);

/**
 * @type put
 * @path /schedules/:scheduleID
 */
async function listSchedule(req, res, next) {
  serviceHelper.log(
    'trace',
    'View schedule API called',
  );

  const { scheduleID } = req.params;
  // eslint-disable-next-line no-restricted-globals
  if (isNaN(scheduleID)) {
    const err = new Error('param: scheduleID is not a number');
    serviceHelper.log(
      'error',
      err.message,
    );
    if (typeof res !== 'undefined' && res !== null) {
      serviceHelper.sendResponse(
        res,
        400,
        err,
      );
      next();
    }
    return err;
  }

  try {
    const SQL = `SELECT * FROM garden_schedules WHERE id = ${scheduleID}`;
    serviceHelper.log(
      'trace',
      'Connect to data store connection pool',
    );
    const dbConnection = await serviceHelper.connectToDB('flowercare');
    serviceHelper.log(
      'trace',
      'Get sensors',
    );
    const results = await dbConnection.query(SQL);
    serviceHelper.log(
      'trace',
      'Release the data store connection back to the pool',
    );
    await dbConnection.end(); // Close data store connection

    // Send data back to caler
    if (typeof res !== 'undefined' && res !== null) {
      serviceHelper.sendResponse(
        res,
        200,
        results.rows,
      );
      next();
    } else {
      return results.rows;
    }
  } catch (err) {
    serviceHelper.log(
      'error',
      err.message,
    );
    if (typeof res !== 'undefined' && res !== null) {
      serviceHelper.sendResponse(
        res,
        500,
        err.message,
      );
      next();
    } else {
      return err;
    }
  }
  return true;
}
skill.get(
  '/schedules/:scheduleID',
  listSchedule,
);

/**
 * @type put
 * @path /schedules/:scheduleID
 */
async function saveSchedule(req, res, next) {
  serviceHelper.log(
    'trace',
    'Update Schedule API called',
  );

  const {
    scheduleID,
    type,
    name,
    hour,
    minute,
    aiOverride,
    active,
  } = req.params;

  try {
    serviceHelper.log(
      'trace',
      'Read existing values',
    );
    const scheduleData = await listSchedule({ params: { scheduleID } }, null, null);
    if (scheduleData instanceof Error) {
      serviceHelper.log(
        'error',
        scheduleData.message,
      );
      if (typeof res !== 'undefined' && res !== null) {
        serviceHelper.sendResponse(
          res,
          500,
          scheduleData,
        );
        next();
      }
      return scheduleData;
    }

    serviceHelper.log(
      'trace',
      'Update values from params',
    );
    if (typeof type !== 'undefined' && type !== null) scheduleData[0].type = type;
    if (typeof name !== 'undefined' && name !== null) scheduleData[0].name = name;
    if (typeof hour !== 'undefined' && hour !== null) scheduleData[0].hour = hour;
    if (typeof minute !== 'undefined' && minute !== null) scheduleData[0].minute = minute;
    if (typeof aiOverride !== 'undefined' && aiOverride !== null) scheduleData[0].ai_override = aiOverride;
    if (typeof active !== 'undefined' && active !== null) scheduleData[0].active = active;

    serviceHelper.log(
      'trace',
      'Update db',
    );

    const SQL = 'UPDATE garden_schedules SET type=$2, name=$3, hour=$4, minute=$5, ai_override=$6, active=$7 WHERE id = $1';
    const SQLValues = [
      scheduleID,
      scheduleData[0].type,
      scheduleData[0].name,
      scheduleData[0].hour,
      scheduleData[0].minute,
      scheduleData[0].ai_override,
      scheduleData[0].active,
    ];

    serviceHelper.log(
      'trace',
      'Connect to data store connection pool',
    );
    const dbConnection = await serviceHelper.connectToDB('flowercare');
    serviceHelper.log(
      'trace',
      'Save sensor schedule',
    );
    const results = await dbConnection.query(
      SQL,
      SQLValues,
    );
    serviceHelper.log(
      'trace',
      'Release the data store connection back to the pool',
    );
    await dbConnection.end(); // Close data store connection

    // Send data back to caler
    if (results.rowCount === 1) {
      serviceHelper.log(
        'info',
        `Saved sensor data: ${JSON.stringify(req.body)}`,
      );

      serviceHelper.log(
        'info',
        'Reseting schedules due to save event',
      );
      await schedules.setSchedule(true); // re-set light schedules

      serviceHelper.sendResponse(
        res,
        200,
        '{ "state": "saved" }',
      );
    } else {
      const err = new Error('Failed to save');
      serviceHelper.log(
        'error',
        err.message,
      );
      serviceHelper.sendResponse(
        res,
        500,
        err,
      );
    }
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
  return true;
}
skill.put(
  '/schedules/:scheduleID',
  serviceHelper.validateSchema(scheduleSchema),
  saveSchedule,
);

module.exports = skill;
