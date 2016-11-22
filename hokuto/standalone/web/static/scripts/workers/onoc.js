'use strict';

/* globals importScripts */

// Startup script for a web worker
// Loads all the RequireJS related stuff and starts
// a module containing the main logic
// Once started, the worker must be initialized by posting a message
// containing an array with :
// - The main module name (string)
// - The baseUrl configuration value (for storage in onoc.config)
// - The separator configuration value (for storage in onoc.config)
// - The isAdmin configuration value (for storage in onoc.config)
// - The shinkenContact configuration value (for storage in onoc.config)

importScripts('../libs/require.js');

require.config({ baseUrl: '../' });
require(['onoc.config', 'workers/workerdata'], function(Config, WorkerData) {
    WorkerData.pick(function(data) {
        // Write configuration
        Config.setValues(data[1], data[2], data[3], data[4]);
        // Start worker logic
        require([data[0]]);
        WorkerData.notifyLogicReady();
    });
});
