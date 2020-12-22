/**
 * Import helper libraries
 */
const scheduleSchema = require('../../schemas/device_schedule.json');
const debug = require('debug')('Flower:API_Schedules');

/**
 * @type get
 * @path /schedules
 */
async function _listSchedules(req, res, next) {
  debug(`List schedules API called`);

  let dbConnection;

  try {
    debug(`Connect to db`);
    dbConnection = await this._connectToDB();
  
    debug(`Query DB`);
    const query = {};
    const results = await dbConnection
      .db(this.namespace)
      .collection('schedules')
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
    debug(`Close DB connection`);
    await dbConnection.close();
  }
  return true;
}

/**
 * @type get
 * @path /schedules/:scheduleID
 */
async function _listSchedule(req, res, next) {
  debug(`Display schedule API called`);

  const { scheduleID } = req.params;

  let dbConnection;

  try {
    debug(`Connect to db`);
    dbConnection = await this._connectToDB();

    debug(`Query DB`);
    const query = { schedule: Number(scheduleID) };
    const results = await dbConnection
      .db(this.namespace)
      .collection('schedules')
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
    debug(`Close DB connection`);
    await dbConnection.close();
  }
  return true;
}

/**
 * @type put
 * @path /schedules/:scheduleID
 */
async function _saveSchedule(req, res, next) {
  debug(`Update schedule API called`);

  const { scheduleID, name, hour, minute, override, active } = req.params;

  let dbConnection;

  try {
    debug(`Check for valid params`);
    const validSchema = this._validateSchema(req, scheduleSchema);
    if (validSchema !== true) {
      if (typeof res !== 'undefined' && res !== null) {
        this._sendResponse(res, next, 400, validSchema);
      }
      return validSchema;
    }

    debug(` Read existing values`);
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

    debug(`Update values from params`);
    if (typeof name !== 'undefined' && name !== null)
      scheduleData[0].name = name;
    if (typeof hour !== 'undefined' && hour !== null)
      scheduleData[0].hour = hour;
    if (typeof minute !== 'undefined' && minute !== null)
      scheduleData[0].minute = minute;
    if (typeof override !== 'undefined' && override !== null)
      scheduleData[0].override = override;
    if (typeof active !== 'undefined' && active !== null)
      scheduleData[0].active = active;

    debug(`Update DB`);

    const query = { _id: scheduleData[0]._id };
    const body = { $set: scheduleData[0] };
    const opts = {
      returnOriginal: false,
      upsert: true,
    };

    dbConnection = await this._connectToDB();
    debug(`Query DB`);
    const results = await dbConnection
      .db(this.namespace)
      .collection('schedules')
      .findOneAndUpdate(query, body, opts);

    // Send data back to caler
    if (results.result.nModified > 0) {
      debug(`Saved schedule data: ${JSON.stringify(req.params)}`);
      if (typeof res !== 'undefined' && res !== null) {
        this._sendResponse(res, next, 200, { state: 'saved' });
        debug(`Reseting schedules due to save event`);
      }

      // Re-set schedule
      await this.setupSchedules.call(this);
      await this.activateSchedules.call(this);
      return true;
    }

    if (typeof res !== 'undefined' && res !== null) {
      const err = new Error('Failed to save');
      this.logger.error(`${this._traceStack()} - ${err.message}`);
      this._sendResponse(res, next, 500, err);
      return err;
    }
    return true;
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 500, err);
    }
    return err;
  } finally {
    debug(`Close DB connection`);
    await dbConnection.close();
  }
}

module.exports = {
  _listSchedules,
  _listSchedule,
  _saveSchedule,
};
