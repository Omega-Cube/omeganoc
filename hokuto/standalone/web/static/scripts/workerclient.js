'use strict';

define(['onoc.createurl', 'console', 'onoc.config'], function(createUrl, Console, Config) {
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

    // Processes messages sent by the worker
    WorkerClient.prototype.processMessage = function(evt) {
        // Note : in this method 'this' contains the Worker instance
        var client = this._client;
        if(Array.isArray(evt.data) && evt.data.length === 2 && evt.data[0] === 'ready') {
            // Ready state change : changes the internal state of the worker
            switch(evt.data[1]) {
            case 0:
                if(client.readyState === -1) {
                    // Configure the worker
                    this.postMessage([
                        client.workerFile,
                        Config.baseUrl(),
                        Config.separator(),
                        Config.isAdmin(),
                        Config.shinkenContact()
                    ]);
                    client.readyState = 0;
                }
                else {
                    Console.error('Illegal worker state change: going from "' + client.readyState + '" to 0');
                }
                break;
            case 1:
                if(client.readyState === 0) {
                    // Send any queued message now that the worker is ready to receive them
                    while(client.outMessageQueue.length > 0) {
                        this.postMessage(client.outMessageQueue.shift());
                    }
                    client.readyState = 1;
                }
                else {
                    Console.error('Illegal worker state change: going from "' + client.readyState + '" to 1');
                }
                break;
            default:
                Console.error('Illegal state change: new state "' + evt.data[1] + '" unknown');
                break;
            }
        }
        else if (evt.data) {
            // Forward other messages to the worker user
            client.onMessageCallback(evt.data);
        }
    };

    WorkerClient.prototype.processError = function() {
        Console.error('An error occured while initializing a worker');
    };

    // Sends a message to the worker
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