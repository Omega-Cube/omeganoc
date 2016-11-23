'use strict';

/*
 * This file is part of Omega Noc
 * Copyright Omega Noc (C) 2014 Omega Cube and contributors
 * Xavier Roger-Machart, xrm@omegacube.fr
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

// OmegaNoc.GraphState
// Contains code that allows the developer to save and restore 
// a graph's state on the server.
//
// Use the load function to load a graph data
// Use the save data to save data.
//
// Note that saving data does not happen the moment you call the save function.
// A small delay is applied before actually sending the new values to the server,
// in order to avoid too many repeated save requests when the user applies many little
// changes in a short amount of time.
// The actual server call for saving is made after a small amount of inactivity time
// (time spent without calling save), and will send all the data contained in all the save
// calls made since the last save was sent to the server.

// If you want to force sending all saving data to the server (for example because the page
// will be closed), call the flush function.

define(['jquery', 'console', 'onoc.createurl'], function(jQuery, Console, createurl) {
    var GraphState = {
        _saveBuffer: {},
        _currentOperations: {},
        _clear: {},
        _sendDelay: 1500, // Delay before a save operation is actually executed

        load: function (graphType, successCallback, errorCallback) {
            var url = createurl('/loadgraph/' + graphType);
            var jqxhr = jQuery.getJSON(url, function (result) {
                if (successCallback) {
                    successCallback(result);
                }
            });

            jqxhr.error(function (localXhr, textStatus, errorThrown) {
                Console.error('Failed loading data for graph ' + graphType);
                if (errorThrown) {
                    Console.error('HTTP message: ' + errorThrown);
                }

                if (errorCallback) {
                    errorCallback();
                }
            });
        },

        save: function (graphType, data, clear) {
            // Prepares the specified data to be sent to the server for saving
            clear = !!clear;
            var that = GraphState;
        
            if (clear || !(graphType in GraphState._saveBuffer)) {
                that._saveBuffer[graphType] = {};
            }
        
            that._saveBuffer[graphType] =
                jQuery.extend(that._saveBuffer[graphType], data);
        
            if (clear)
                that._clear[graphType] = true;
        
            if (graphType in that._currentOperations)
                clearInterval(that._currentOperations[graphType]);
        
            that._currentOperations[graphType] = setInterval(function () {
                GraphState._sendData(graphType);
            }, that._sendDelay);
        },

        flush: function () {
            // Forces sending all the data that is in the queue for being saved.

            var that = GraphState;
            for (var op in that._currentOperations) {
                that._sendData(op);
            }
        },

        _sendOnSuccess: function () {
            // TODO : Fill or remove
        },

        _sendOnError: function () {
            // TODO: decide what to do here

            jQuery(document).trigger('saveerror.state.onoc');
        },

        _sendData: function (graphType) {
            var that = GraphState;
            var data = that._saveBuffer[graphType];
            var clear = graphType in that._clear;

            var message = {
                'GRAPHID': graphType,
                'DATA': JSON.stringify(data)
            };

            if (clear)
                message['CLEAR'] = 'true';

            var jqxhr = jQuery.post(createurl('/savegraph'), message, that._sendOnSuccess, 'json');
            jqxhr.error(that._sendOnError);
            jqxhr._data = data;
            jqxhr._clear = clear;

            // The timer may still be running, for example if we send this data because of a flush
            clearTimeout(that._currentOperations[graphType]);

            delete that._currentOperations[graphType];
            delete that._saveBuffer[graphType];
            if (clear)
                delete that._clear[graphType];
        }
    };
    
    return GraphState;
});
