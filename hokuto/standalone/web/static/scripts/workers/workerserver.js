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

define(['libs/rsvp', 'onoc.config', 'console'], function(RSVP, Config, Console) {

    /**
     * Creates a new WorkerServer.
     * Note that only one instance should ever be created per worker.
     * @class
     */
    function WorkerServer() {
        /**
         * Holds the messages that has not been handled yet
         * @private
         */
        this._messageQueue = [];
        this._proxyInstance = null;
        this._configReceived = false;

        WorkerServer.currentInstance = this;

        // A callback that is used when a message is received
        // that isn't using a known data format
        this.onunhandledmessage = null;

        // Hook up the global onmessage event
        onmessage = function(messageEvent) {
            this._dispatch(messageEvent.data);
        }.bind(this);

        // Set the current server instance

        // Start the initialization sequence
        this._notifyServerStarting();
    }

    /**
     * Defines the logic executed when a message is received from the client
     * @private
     * @param {Object} messageData The data send from the client
     */
    WorkerServer.prototype._dispatch = function(messageData) {
        this._messageQueue.push(messageData);
        this._wakeUp();
    };

    /**
     * Forces the server to check if a message is in the queue,
     * and process it if possible.
     * @private
     */
    WorkerServer.prototype._wakeUp = function() {
        while(this._messageQueue.length) {
            try {
                this._processMessage(this._messageQueue.shift());
            }
            catch(ex) {
                //TODO: Do something with the error ?
            }
        }
    };

    WorkerServer.prototype._processMessage = function(data) {
        if(!this._configReceived) {
            this._processConfigMessage(data);
        }
        else if(!this._tryProcessCallMessage(data)) {
            if(this.onunhandledmessage) {
                this.onunhandledmessage(data);
            }
            else {
                Console.warn('Unhandled message received by the worker server: ' + JSON.stringify(data));
            }
        }
    };

    WorkerServer.prototype._tryProcessCallMessage = function(data) {
        if(data.hasOwnProperty('call')) {
            if(this._proxyInstance) {
                try {
                    var result = this._proxyInstance[data.method].apply(this._proxyInstance, data.args);

                    if(result instanceof RSVP.Promise) {
                        this._handlePromiseCallResult(data.call, result);
                    }
                    else {
                        this._postCallback(data.call, result, null);
                    }
                }
                catch(error) {
                    this._postCallback(data.call, null, error);
                }
            }
            else {
                // Error : No server proxy available
                this._postCallback(data.call, null, 'Worker server error: there is no proxy available to relay your call to!');
            }
            return true;
        }
        else {
            return false;
        }
    };

    WorkerServer.prototype._handlePromiseCallResult = function(callId, promise) {
        promise.then(function(result) {
            this._postCallback(callId, result, null);
        }.bind(this)).catch(function(error) {
            this._postCallback(callId, null, error);
        }.bind(this));
    };

    WorkerServer.prototype._postCallback = function(id, result, error) {
        // One special case we want to handle here is errors: Error (and subclasses) insances
        // won't go through postMessage! In that case we'll just take the message and leave the rest here.
        if(error && error instanceof Error) {
            error = error.message;
        }

        this.postMessage([
            'callback',
            {
                callId: id,
                result: result,
                error: error,
            }
        ]);
    };

    WorkerServer.prototype._processConfigMessage = function(message) {
        // Load app configuration
        Config.import(message[1]);

        // Load the proxy that contains the actual logic
        require([message[0]], function(ProxyType) {
            try {
                this._proxyInstance = new ProxyType(this);
            }
            catch(error) {
                Console.error('Could not create an instance of the proxy object obtained from the module "' + message[0] + '": ' + error);
                return; // Stops the initialization sequence.
            }

            // Proceed with the next steps
            this._configReceived = true;
            this.notifyLogicReady();
        }.bind(this), function(err) {
            // An error occured while trying to load the proxy
            Console.error('Could not load the proxy module "' + message[0] + '"');
        });
    };

    /**
     * Directly sends a message to the client.
     * Libraries consuming WorkerServer should typically not call this method directly,
     * but use more high-level methods instead.
     * @param {Object} data The raw data that should be sent to the client
     */
    WorkerServer.prototype.postMessage = function(data) {
        postMessage(data);
    };

    /**
     * Notifies the client that the initialization phase of the server is done,
     * and that the higher level communications may start.
     */
    WorkerServer.prototype.notifyLogicReady = function() {
        this.postMessage(['ready', 1]);
    };

    WorkerServer.prototype._notifyServerStarting = function() {
        this.postMessage(['ready', 0]);
    };

    /**
     * Enumerates the available log levels available to transfer to the client
     * @enum {String}
     * @readonly
     */
    WorkerServer.LOG_LEVEL = {
        LOG: 'log',
        INFO: 'info',
        WARN: 'warn',
        ERROR: 'error',
    };

    /**
     * Sends a console message to the client.
     * This is intended to be a workaroud to the absence of window.console in workers.
     * @param {String} message A message
     * @param {WorkerServer.LOG_LEVEL} level The log level to be used by the client to display the message
     */
    WorkerServer.prototype.sendConsoleMessage = function(message, level) {
        if(!this._validateConsoleLevel(level)) {
            // Let's fix that first
            message = '[incorrect log level "' + level + '"] ' + message;
            level = WorkerServer.LOG_LEVEL.WARN;
        }
        this.postMessage([
            level,
            message,
        ]);
    };

    /**
     * Triggers an event on the UI thread
     * @param {String} eventName The name of the event that should be triggered
     * @param {Object} eventData The data that will be transmitted with the event
     */
    WorkerServer.prototype.trigger = function(eventName, eventData) {
        if(eventName) {
            this.postMessage([
                'event',
                eventName,
                eventData,
            ]);
        }
        else {
            Console.warn('Something tried to trigger an event on a worker server, but the event name is empty!');
        }
    };

    /**
     * Check the validity of a log level
     * @private
     * @param {String} level The value that should be validated.
     * @return {Boolean} True if the log level is valid, false otherwise
     */
    WorkerServer.prototype._validateConsoleLevel = function(level) {
        for (var key in WorkerServer.LOG_LEVEL) {
            if (WorkerServer.LOG_LEVEL.hasOwnProperty(key)) {
                if(level === WorkerServer.LOG_LEVEL[key]) {
                    return true;
                }
            }
        }
        return false;
    };

    /**
     * Contains the instance of WorkerServer that is currently hooked to the
     * worker's message events. This can be used by modules that have no directly
     * access to the server instance if they need to comunicate with the client.
     * @static
     * @readonly
     */
    WorkerServer.currentInstance = null;

    return WorkerServer;
});