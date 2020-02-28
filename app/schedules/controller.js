/**
 * Import external libraries
 */
const scheduler = require('node-schedule');
const serviceHelper = require('alfred-helper');

/**
 * Import helper libraries
 */
const gardenWater = require('./gardenWater.js');

/**
 * Set up the timers
 */
async function setSchedule() {
  // Cancel any existing schedules
  serviceHelper.log(
    'trace',
    'Removing any existing schedules',
  );
  await global.schedules.map((value) => value.cancel());

  // Set schedules each day to keep in sync with sunrise & sunset changes
  const rule = new scheduler.RecurrenceRule();
  rule.hour = 3;
  rule.minute = 5;
  const schedule = scheduler.scheduleJob(rule, () => setSchedule()); // Set the schedule
  global.schedules.push(schedule);
  await gardenWater.setup(); // Water garden
}

exports.setSchedule = setSchedule;
