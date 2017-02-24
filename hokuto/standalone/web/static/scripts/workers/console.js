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

define(['workers/workerserver'], function(WorkerServer) {
    return {
        // A console module written to be used from inside a worker context

        // This module has the same interface than the console module
        // in the parent folder

        log: function (message) {
            WorkerServer.currentInstance.sendConsoleMessage('[Worker]\t' + message, WorkerServer.LOG_LEVEL.LOG);
        },

        info: function (message) {
            WorkerServer.currentInstance.sendConsoleMessage('[Worker]\t' + message, WorkerServer.LOG_LEVEL.INFO);
        },

        warn: function (message) {
            WorkerServer.currentInstance.sendConsoleMessage('[Worker]\t' + message, WorkerServer.LOG_LEVEL.WARN);
        },

        error: function (message) {
            WorkerServer.currentInstance.sendConsoleMessage('[Worker]\t' + message, WorkerServer.LOG_LEVEL.ERROR);
        }
    };
});
