/**
 * Import external libraries
 */
const Skills = require('restify-router').Router;
const elasticsearch = require('@elastic/elasticsearch');
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
async function ping(req, res, next) {
  serviceHelper.log('trace', 'Ping API called');

  const ackJSON = {
    service: process.env.ServiceName,
    reply: 'pong',
  };
  serviceHelper.sendResponse(res, true, ackJSON); // Send response back to caller

  const client = new elasticsearch.Client({
    node: process.env.ElasticSearch,
  });

  if (client instanceof Error || client.Connection === undefined) {
    serviceHelper.log('error', 'Unable to connect to ELK');
    return;
  }

  const load = os.loadavg();
  const currentDate = new Date();
  const formatDate = currentDate.toISOString();

  const results = await client.index({
    index: 'health',
    type: 'health',
    body: {
      time: formatDate,
      hostname: os.hostname(),
      environment: process.env.Environment,
      mem_free: os.freemem(),
      mem_total: os.totalmem(),
      mem_percent: (os.freemem() * 100) / os.totalmem(),
      cpu: Math.min(Math.floor((load[0] * 100) / os.cpus().length), 100),
    },
  });

  if (results instanceof Error) {
    serviceHelper.log('error', results.message);
  }

  await client.close();

  next();
}
skill.get('/ping', ping);

module.exports = skill;
