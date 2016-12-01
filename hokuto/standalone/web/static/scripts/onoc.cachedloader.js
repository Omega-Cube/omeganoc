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

define(['jquery'], function (jQuery) {

    // This module defines a class that can query an URL for some data, and cache
    // this data on the client side to avoid repeated queries. Create an instance
    // with an URL and optionnal jQuery XHR options, and the class will automatically
    // retrieve the data from the server the first time getData is called. After the first
    // call, a cached version is returned, until the cache duration is reached. When this happens
    // the cache is cleared and the next getData call will trigger another server call.
    // The default cache duration is 60000 (60 seconds).
    // The loader also has a custom transform feature. The user can provide a function that
    // processes the data received from the server to turn it into something else, so the result
    // of this processing is stored instead of the original data.

    var CachedLoader = function (url, xhrOptions, transformFunction, cacheDuration) {
        var cache = null;
        var isUpdating = false;
        var updateCallbacks = [];
        var timerHandle = null;
        cacheDuration = (typeof cacheDuration === 'undefined' ? 60000 : cacheDuration);
        xhrOptions = jQuery.extend({}, xhrOptions); // Create a local copy of the xhrOptions parameter

        // Customize xhrOptions, to inject our very own callbacks !
        var userSuccess = xhrOptions.success;

        xhrOptions.success = function (data, textStatus, jqXHR) {
            // Apply the transformation if needed
            if (transformFunction) {
                data = transformFunction(data);
            }

            cache = data;

            for (var i = 0, c = updateCallbacks.length; i < c; ++i) {
                updateCallbacks[i](data);
            }

            isUpdating = false;
            updateCallbacks = [];

            if (userSuccess)
                userSuccess(data, textStatus, jqXHR);

            // Set up the timer
            if (cacheDuration > 0) {
                timerHandle = setTimeout(onTimeout, cacheDuration);
            }
        };

        function onTimeout() {
            cache = null;
            timerHandle = null;
        }

        this.getData = function (callback) {
            if (cache === null) {
                this.forceUpdate(callback);
            }
            else {
                callback(cache);
            }
        };

        this.forceUpdate = function (callback) {
            updateCallbacks.push(callback);
            if(!isUpdating) {
                if (timerHandle) {
                    clearTimeout(timerHandle);
                    timerHandle = null;
                }

                jQuery.ajax(url, xhrOptions);
                isUpdating = true;
            }
        };
    };

    return CachedLoader;
});
