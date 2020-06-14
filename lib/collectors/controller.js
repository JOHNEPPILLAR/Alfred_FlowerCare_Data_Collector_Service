/**
 * Import external libraries
 */
const serviceHelper = require('alfred-helper');

/**
 * Import helper libraries
 */
const flowerCare = require('./flowercare/flowercare.js');

const timerInterval = 10 * 60 * 1000; // 10 minutes

exports.processFlowerCareDevices = async function fnProcessFlowerCareDevices() {
  try {
    await flowerCare.getFlowerCareDevices();
  } catch (err) {
    serviceHelper.log(
      'error',
      err.message,
    );
  }
  setTimeout(() => {
    fnProcessFlowerCareDevices();
  }, timerInterval);
};
