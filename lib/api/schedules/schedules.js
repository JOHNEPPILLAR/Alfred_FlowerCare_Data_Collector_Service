/**
 * Import helper libraries
 */
const scheduleSchema = require('../../schemas/device_schedule.json');

/**
 * @type get
 * @path /schedules
 */
async function _listSchedules(req, res, next) {
  this.logger.debug(`${this._traceStack()} - List schedules API called`);

  let dbConnection;

  try {
    this.logger.trace(`${this._traceStack()} - Connect to db`);
    dbConnection = await this._connectToDB();
    this.logger.trace(`${this._traceStack()} - Execute query`);
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
    this.logger.trace(`${this._traceStack()} - Close DB connection`);
    await dbConnection.close();
  }
  return true;
}

/**
 * @type get
 * @path /schedules/:scheduleID
 */
async function _listSchedule(req, res, next) {
  this.logger.debug(`${this._traceStack()} - Display schedule API called`);

  const { scheduleID } = req.params;

  let dbConnection;

  try {
    this.logger.trace(`${this._traceStack()} - Connect to db`);
    dbConnection = await this._connectToDB();
    this.logger.trace(`${this._traceStack()} - Execute query`);
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
    this.logger.trace(`${this._traceStack()} - Close DB connection`);
    await dbConnection.close();
  }
  return true;
}

/**
 * @type put
 * @path /schedules/:scheduleID
 */
async function _saveSchedule(req, res, next) {
  this.logger.debug(`${this._traceStack()} - Update schedule API called`);

  const { scheduleID, name, hour, minute, override, active } = req.params;

  let dbConnection;

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

    this.logger.trace(`${this._traceStack()} - Update db`);

    const query = { _id: scheduleData[0]._id };
    const body = { $set: scheduleData[0] };
    const opts = {
      returnOriginal: false,
      upsert: true,
    };

    dbConnection = await this._connectToDB();
    this.logger.trace(`${this._traceStack()} - Execute query`);
    const results = await dbConnection
      .db(this.namespace)
      .collection('schedules')
      .findOneAndUpdate(query, body, opts);

    // Send data back to caler
    if (results.ok === 1) {
      this.logger.trace(
        `${this._traceStack()} - Saved schedule data: ${JSON.stringify(
          req.params,
        )}`,
      );
      if (typeof res !== 'undefined' && res !== null) {
        this._sendResponse(res, next, 200, { state: 'saved' });
        this.logger.trace(
          `${this._traceStack()} - Reseting schedules due to save event`,
        );
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
    this.logger.trace(`${this._traceStack()} - Close DB connection`);
    await dbConnection.close();
  }
}

module.exports = {
  _listSchedules,
  _listSchedule,
  _saveSchedule,
};
