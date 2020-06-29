/**
 * Import helper libraries
 */
const scheduleSchema = require('../../schemas/device_schedule.json');

async function executeSQL(sql, sqlValues, req, res, next) {
  try {
    this.logger.trace(
      `${this._traceStack()} - Connect to data store connection pool`,
    );
    const dbConnection = await this._connectToDB('flowercare');

    this.logger.trace(`${this._traceStack()} - Get sensors`);
    let results;
    if (sqlValues === null) {
      results = await dbConnection.query(sql);
    } else {
      results = await dbConnection.query(sql, sqlValues);
    }
    this.logger.trace(
      `${this._traceStack()} - Release the data store connection back to the pool`,
    );
    await dbConnection.end(); // Close data store connection

    if (sqlValues !== null) {
      if (results.rowCount === 1) {
        this.logger.info(`Saved data: ${JSON.stringify(req.body)}`);
        if (typeof res !== 'undefined' && res !== null) {
          this._sendResponse(res, next, 200, { saved: true });
          return true;
        }
      } else {
        this.logger.error(`Saved data: ${JSON.stringify(req.body)}`);
        if (typeof res !== 'undefined' && res !== null) {
          this._sendResponse(res, next, 200, { saved: false });
          return false;
        }
      }
    }

    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 200, results.rows);
    } else {
      return results.rows;
    }
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 500, err);
    }
    return err;
  }
  return true;
}

/**
 * @type get
 * @path /schedules
 */
async function _listSchedules(req, res, next) {
  this.logger.debug(`${this._traceStack()} - List schedules API called`);
  const sql = 'SELECT * FROM garden_schedules ORDER BY id';
  return executeSQL.call(this, sql, null, req, res, next);
}

/**
 * @type put
 * @path /schedules/:scheduleID
 */
async function _listSchedule(req, res, next) {
  this.logger.debug(`${this._traceStack()} - View schedule API called`);

  const { scheduleID } = req.params;
  // eslint-disable-next-line no-restricted-globals
  if (isNaN(scheduleID)) {
    const err = new Error('param: scheduleID is not a number');
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 500, err);
    }
    return err;
  }

  const sql = `SELECT * FROM garden_schedules WHERE id = ${scheduleID}`;
  return executeSQL.call(this, sql, null, req, res, next);
}

/**
 * @type put
 * @path /schedules/:scheduleID
 */
async function _saveSchedule(req, res, next) {
  this.logger.debug(`${this._traceStack()} - Update schedule API called`);

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
    this.logger.trace(`${this._traceStack()} - Check for valid params`);
    const validSchema = this._validateSchema(req, scheduleSchema);
    if (validSchema !== true) {
      if (typeof res !== 'undefined' && res !== null) {
        this._sendResponse(res, next, 400, validSchema);
      }
      return validSchema;
    }

    this.logger.trace(`${this._traceStack()} - Read existing values`);
    const scheduleData = await _listSchedule.call(
      this,
      { params: { scheduleID } },
      null,
      null,
    );
    if (scheduleData instanceof Error) {
      this.logger.error(`${this._traceStack()} - ${scheduleData.message}`);
      if (typeof res !== 'undefined' && res !== null) {
        this._sendResponse(res, next, 500, scheduleData);
      }
      return scheduleData;
    }

    this.logger.trace(`${this._traceStack()} - Update values from params`);
    if (typeof type !== 'undefined' && type !== null)
      scheduleData[0].type = type;
    if (typeof name !== 'undefined' && name !== null)
      scheduleData[0].name = name;
    if (typeof hour !== 'undefined' && hour !== null)
      scheduleData[0].hour = hour;
    if (typeof minute !== 'undefined' && minute !== null)
      scheduleData[0].minute = minute;
    if (typeof aiOverride !== 'undefined' && aiOverride !== null)
      scheduleData[0].ai_override = aiOverride;
    if (typeof active !== 'undefined' && active !== null)
      scheduleData[0].active = active;

    this.logger.trace(`${this._traceStack()} - Update db`);

    const sql =
      'UPDATE garden_schedules SET type=$2, name=$3, hour=$4, minute=$5, ai_override=$6, active=$7 WHERE id = $1';
    const sqlValues = [
      scheduleID,
      scheduleData[0].type,
      scheduleData[0].name,
      scheduleData[0].hour,
      scheduleData[0].minute,
      scheduleData[0].ai_override,
      scheduleData[0].active,
    ];

    const results = await executeSQL.call(this, sql, sqlValues, req, res, next);
    if (!(results instanceof Error)) {
      // await schedules.setSchedule(true); // re-set schedules
    }
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 500, err);
    } else {
      return err;
    }
  }
  return true;
}

module.exports = {
  _listSchedules,
  _listSchedule,
  _saveSchedule,
};
