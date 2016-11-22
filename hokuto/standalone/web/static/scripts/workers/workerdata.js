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