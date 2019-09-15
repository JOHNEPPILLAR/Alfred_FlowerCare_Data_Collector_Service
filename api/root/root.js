/**
 * Import external libraries
 */
const Skills = require('restify-router').Router;
const os = require('os');

/**
 * Import helper libraries
 */
const serviceHelper = require('alfred_helper');

const skill = new Skills();

/**
 * @api {get} /ping
 * @apiName ping
 * @apiGroup Root
 *
 * @apiSuccessExample {json} Success-Response:
 *   HTTPS/1.1 200 OK
 *   {
 *     data: 'pong'
 *   }
 *
 * @apiErrorExample {json} Error-Response:
 *   HTTPS/1.1 400 Bad Request
 *   {
 *     data: Error message
 *   }
 *
 */
async function ping(req, res, next) {
  serviceHelper.log('trace', 'Ping API called');

  const ackJSON = {
    service: process.env.ServiceName,
    reply: 'pong',
  };
  serviceHelper.sendResponse(res, true, ackJSON); // Send response back to caller

  if (process.env.Environment !== 'dev') {
    const load = os.loadavg();

    const message = {
      environment: process.env.Environment,
      mem_free: os.freemem(),
      mem_total: os.totalmem(),
      mem_percent: (os.freemem() * 100) / os.totalmem(),
      cpu: Math.min(Math.floor((load[0] * 100) / os.cpus().length), 100),
    };

    serviceHelper.log('health', message);
  }
  next();
}
skill.get('/ping', ping);

module.exports = skill;
