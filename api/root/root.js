/**
 * Import external libraries
 */
const Skills = require('restify-router').Router;
const elasticsearch = require('elasticsearch');
const os = require('os');

/**
 * Import helper libraries
 */
const serviceHelper = require('../../lib/helper.js');

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
function ping(req, res, next) {
  serviceHelper.log('trace', 'Ping API called');

  const ackJSON = {
    service: process.env.ServiceName,
    reply: 'pong',
  };

  if (process.env.Environment === 'production') {
    const client = new elasticsearch.Client({
      hosts: [process.env.ElasticSearch],
    });

    const load = os.loadavg();
    const currentDate = new Date();
    const formatDate = currentDate.toISOString();

    try {
      client.index({
        index: 'health',
        type: 'health',
        body: {
          time: formatDate,
          hostname: os.hostname(),
          mem_free: os.freemem(),
          mem_total: os.totalmem(),
          mem_percent: ((os.freemem() * 100) / os.totalmem()),
          cpu: Math.min(Math.floor((load[0] * 100) / os.cpus().length), 100),
        },
      });
    } catch (err) {
      serviceHelper.log('error', err.message);
    }
  }

  serviceHelper.sendResponse(res, true, ackJSON); // Send response back to caller
  next();
}
skill.get('/ping', ping);

module.exports = skill;
