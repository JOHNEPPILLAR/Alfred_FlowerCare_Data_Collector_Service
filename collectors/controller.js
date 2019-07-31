/**
 * Import external libraries
 */
const { fork } = require('child_process');

/**
 * Import helper libraries
 */
const serviceHelper = require('../lib/helper.js');

const timerInterval = 5 * 60 * 1000; // 5 minutes

exports.processFlowerCareDevices = function fnProcessFlowerCareDevices() {
  serviceHelper.log('trace', 'Starting new client process');
  try {
    const childProcess = fork('./collectors/flowercare/flowercare.js');
    childProcess.on('message', (message) => {
      serviceHelper.log('trace', message);
    });

    childProcess.on('close', () => {
      serviceHelper.log('trace', 'Child process complete');
    });
  } catch (err) {
    serviceHelper.log('error', err.message);
  }
  setTimeout(() => {
    fnProcessFlowerCareDevices();
  }, timerInterval);
};
