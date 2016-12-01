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

// This file is the only one where we allow ourselves to access the worker globals
/* global onmessage:true, postMessage:false */
/* exported onmessage */

define([], function() {
    var WorkerData = {
        messageQueue: [],
        currentCallback: null,
        callbackPicks: false,

        dispatch: function(data) {
            WorkerData.messageQueue.push(data);
            WorkerData._wakeUp();
        },

        pick: function(callback) {
            WorkerData.currentCallback = callback;
            WorkerData.callbackPicks = true;
            WorkerData._wakeUp();
        },

        wait: function(callback) {
            WorkerData.currentCallback = callback;
            WorkerData.callbackPicks = false;
            WorkerData._wakeUp();
        },

        _wakeUp: function() {
            while(WorkerData.messageQueue.length && WorkerData.currentCallback) {
                try {
                    WorkerData.currentCallback(WorkerData.messageQueue.shift());
                }
                catch(ex) {
                    //TODO: Do something with the error ?
                }

                if(WorkerData.callbackPicks) {
                    WorkerData.currentCallback = null;
                }
            }
        },

        postMessage: function(data) {
            postMessage(data);
        },

        // Called to notify the client that the worker logic have been loaded and is ready 
        // to receive messages
        notifyLogicReady: function() {
            postMessage(['ready', 1]);
        }
    };

    onmessage = function(evt) {
        WorkerData.dispatch(evt.data);
    };

    postMessage(['ready', 0]);

    return WorkerData;
});