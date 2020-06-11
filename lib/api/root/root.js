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
 * @path /
 */
async function ping(req, res, next) {
  serviceHelper.ping(
    res,
    next,
  );
}
skill.get(
  '/ping',
  ping,
);

/**
 * @type get
 * @path /needswater
 */
async function needswater(req, res, next) {
  serviceHelper.log(
    'trace',
    'Display needs water API called',
  );
  try {
    const sql = 'SELECT address, identifier, sensor_label, plant_name, moisture, threshold_moisture, zone FROM vw_water_plants';
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
  '/needswater',
  needswater,
);

module.exports = skill;
