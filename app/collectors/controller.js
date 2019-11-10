/**
 * Import external libraries
 */
const { fork } = require('child_process');

/**
 * Import helper libraries
 */
const serviceHelper = require('alfred-helper');

const timerInterval = 5 * 60 * 1000; // 5 minutes

exports.processFlowerCareDevices = async function fnProcessFlowerCareDevices() {
  try {
    serviceHelper.log('trace', 'Starting new client process');
    const childProcess = fork('./app/collectors/flowercare/flowercare.js', [], { silent: false });
    childProcess.on('message', (message) => {
      serviceHelper.log('trace', message);
    });

    childProcess.once('close', () => {
      serviceHelper.log('trace', 'Child process complete');
    });
  } catch (err) {
    serviceHelper.log('error', err.message);
  }
  setTimeout(() => {
    fnProcessFlowerCareDevices();
  }, timerInterval);
};
