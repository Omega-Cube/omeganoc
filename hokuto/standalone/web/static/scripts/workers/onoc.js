"use strict"

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

var _onoc_worker_initialized = false;

onmessage = function(evt) {
    if(!_onoc_worker_initialized) {
        requirejs({
            baseUrl: '../'
        }, ['onoc.config'], function(Config) {
            // Write configuration
            Config.setValues(evt.data[1], evt.data[2], evt.data[3], evt.data[4]);
            // Start worker logic
            requirejs([evt.data[0]]);
        });

        _onoc_worker_initialized = true;
    }
}

importScripts('../libs/require.js');