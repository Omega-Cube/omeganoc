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

define(['onoc.createurl', 'console', 'onoc.config'], function(createUrl, Console, Config) {
    /**
     * A class that creates a Web Worker using the Omega Noc infrastructure,
     * and provides tools to communicate with it
     * @constructor
     * @param {String} workerFile The name of the module containing the worker's entry point
     * @param {Function} callback A function that will be called when the worker sends a message to this client.
     */
    var WorkerClient = function(workerFile, callback) {
        this.worker = new Worker(createUrl('static/scripts/workers/onoc.js'));
        this.worker._client = this;
        this.worker.onmessage = this.processMessage;
        this.worker.onerror = this.processError;


        // A list of messages that are stored, waiting for the worker to be ready
        this.outMessageQueue = [];

        // Stores the current state of the worker
        // -1: Still loading core dependencies
        //  0: Loading worker-specific logic
        //  1: Ready
        this.readyState = -1;

        // The name of the main worker logic module
        this.workerFile = workerFile;

        // the function(data) that will be called every time the worker sends a message
        //TODO: Remove the bind, after the requirement in dashboard.probes has been taken care of
        this.onMessageCallback = callback.bind(this);
    };

    /**
     * Main entry point for messages sent by the worker
     * @param {MessageEvent} evt The received message event
     */
    WorkerClient.prototype.processMessage = function(evt) {
        // Note : in this method 'this' contains the Worker instance
        var client = this._client;
        if(!client._tryProcessReadyMessage(evt.data) && !client._tryProcessConsoleMessage(evt.data)) {
            // Forward other messages to the worker user
            // TODO: Add bind(client) after we rewrote the callers
            client.onMessageCallback(evt.data);
        }
    };

    /**
     * Checks if the provided message is a worker state message, and processes it if it is the case
     * @param {Array} data The data received from the worker
     * @returns {Boolean} True if the message was a worker state message and was handled, false otherwise
     */
    WorkerClient.prototype._tryProcessReadyMessage = function(data) {
        if(Array.isArray(data) && data.length === 2 && data[0] === 'ready')
        { 
            // Ready state change : changes the internal state of the worker
            switch(data[1]) {
            case 0:
                if(this.readyState === -1) {
                    // Configure the worker
                    this.worker.postMessage([
                        this.workerFile,
                        Config.baseUrl(),
                        Config.separator(),
                        Config.isAdmin(),
                        Config.shinkenContact()
                    ]);
                    this.readyState = 0;
                }
                else {
                    Console.error('Illegal worker state change: going from "' + this.readyState + '" to 0');
                }
                break;
            case 1:
                if(this.readyState === 0) {
                    // Send any queued message now that the worker is ready to receive them
                    while(this.outMessageQueue.length > 0) {
                        this.worker.postMessage(this.outMessageQueue.shift());
                    }
                    this.readyState = 1;
                }
                else {
                    Console.error('Illegal worker state change: going from "' + this.readyState + '" to 1');
                }
                break;
            default:
                Console.error('Illegal state change: new state "' + data[1] + '" unknown');
                break;
            }

            return true;
        }
        else return false;
    };

    /**
     * Checks if the provided message is a console message, and processes it if it is the case
     * @param {Array} data The data received from the worker
     * @returns {Boolean} True if the message was a console message and was handled, false otherwise
     */
    WorkerClient.prototype._tryProcessConsoleMessage = function(data) {
        if(Array.isArray(data) && data.length === 2) {
            switch(data[0]) {
            case 'log':
            case 'info':
            case 'warn':
            case 'error':
                Console[data[0]](data[1]);
                return true;
            default:
                return false;
            }
        }
        else return false;
    };

    /**
     * Handler function for the worker's error event
     */
    WorkerClient.prototype.processError = function() {
        Console.error('An error occured while initializing a worker');
    };

    /**
     * This function can be used to send a message to the worker.
     * Use it like you would use the native postMessage function
     * @param {Object} data The payload that should be sent to the worker
     */
    WorkerClient.prototype.postMessage = function(data) {
        if(this.readyState === 1) {
            // Directly send the message
            this.worker.postMessage(data);
        }
        else {
            // Add the message in a queue that will be flushed when the worker is ready to receive it
            this.outMessageQueue.push(data);
        }
    };

    return WorkerClient;
});