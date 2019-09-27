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
  serviceHelper.ping(res, next, process.env.ServiceName);
}
skill.get('/ping', ping);

module.exports = skill;
