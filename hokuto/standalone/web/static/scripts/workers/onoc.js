/*
 * This file is part of Omega Noc
 * Copyright Omega Noc (C) 2016 Omega Cube and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
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
