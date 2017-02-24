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

define([], function() {
    /**
     * A simple observable implementation, triggering event based on their name
     * @constructor
     * @param {Object} source The object to use as the this keywork when calling callbacks.
     */
    var Observable = function(source) {
        /**
         * The currently registered observers. The object keys are the event names,
         * values are callback arrays.
         */
        this.observers = {};

        if(!source) {
            source = this;
        }
        this.source = source;
    };

    /**
     * Registers a function to be called when an event is triggered.
     * @param {String} eventName The name of the event you wish to subscribe to
     * @param {Function} callback The function that should be called when the event is triggered
     */
    Observable.prototype.on = function(eventName, callback) {
        if(this.observers.hasOwnProperty(eventName)) {
            this.observers[eventName].push(callback);
        }
        else {
            this.observers[eventName] = [callback];
        }
    };

    /**
     * Triggers the specified event, calling its callbacks with the specified parameter value
     * @param {String} eventName The name of the event to trigger
     * @param {Object} eventData A value that will be passed as a parameter to all the event's observers.
     */
    Observable.prototype.trigger = function(eventName, eventData) {
        if(this.observers.hasOwnProperty(eventName)) {
            var eventObservers = this.observers[eventName];
            for(var i = 0, l = eventObservers.length; i < l; ++i) {
                eventObservers[i].call(this.source, eventData);
            }
        }
    };

    return Observable;
});