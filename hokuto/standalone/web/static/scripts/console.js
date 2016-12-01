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

define(function() {
    var result = {
        // This object creates an interoperability layer
        // for debugging operations. It should contain methods
        // corresponding to the Firebug Console API, and work
        // every supported environment (even if firebug is not
        // actually available)
        // Note that while method names from the API may be present,
        // the arguments are often simplified (no format strings for example)

        _history: [],

        log: function (message) {
            result._history.push('[Log]\t' + message);
        },

        info: function (message) {
            result._history.push('[Info]\t' + message);
        },

        warn: function (message) {
            result._history.push('[Warning]\t' + message);
        },

        error: function (message) {
            result._history.push('[Error]\t' + message);
        },

        _init: function () {
            if (window.console) {
                // Replace the default implementations by more optimized ones
                result.log = function (message) {
                    console.log(message);
                };

                result.info = function (message) {
                    console.info(message);
                };

                result.warn = function (message) {
                    console.warn(message);
                };

                result.error = function (message) {
                    console.error(message);
                };
            }
        }
    };

    result._init();

    return result;
});
