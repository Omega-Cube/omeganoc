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

/**

Log data in the previous version :
- host_name
- options (all data combined, separated by ;)
- plugin_output
- service_description
- state (numerical)
- time
- type = "SERVICE ALERT"

 */

define(['libs/rsvp', 'metroservice'], function(RSVP, MetroService) {
    var LogsManager = function() {

        /**
         * A structure that holds the cached log entries, organized by host and service
         * The structure is: cache[hostname][servicename] = [
         *  {
         *    start: <timestamp>,
         *    end: <timestamp>,
         *    entries: [<log messages, ordered by time>]
         *  }
         * ]
         */
        this.cache = {};
    };

    /**
     * Gets all the log entries for the specified service instances in the specified time frame
     * @param {Array} hostAndServiceNames An array of [hostname, servicename] tuples
     * @param {Number} start The timestamp of the inclusive lower bound of the requested time frame
     * @param {Number} end The timestamp of the exclusive upper bound of the requested time frame
     */
    LogsManager.prototype.get = function(hostAndServiceNames, start, end) {
        // No floats, only integers!
        start = Math.floor(start);
        end = Math.ceil(end);

        // Check whether we need to download data to satisfy this query
        var requiredDownloads = [];
        for(var i = 0, l = hostAndServiceNames.length; i < l; ++i) {
            var spans = this._downloadRequired(hostAndServiceNames[i][0], hostAndServiceNames[i][1], start, end);
            if(spans) {
                for(var j = 0; j < spans.length; ++j) {
                    requiredDownloads.push([hostAndServiceNames[i][0], hostAndServiceNames[i][1], spans[j][0], spans[j][1]]);
                }
            }
        }

        var resultPromise = null;
        if(requiredDownloads.length > 0) {
            // We do need new data; download now
            resultPromise = this._downloadAndUpdateCache(requiredDownloads, start, end);
        }
        else {
            resultPromise = new RSVP.Promise(function(resolve) {
                // No new data needed.
                resolve();
            });
        }

        return resultPromise.then(function() {
            // Return the results from the cache
            return this._getFromCache(hostAndServiceNames, start, end);
        }.bind(this));
    };

    /**
     * Determines if a data download is needed or not to know the log entries for the specified host/service, on the specified time frame.
     * @param {String} hostName
     * @param {String} serviceName
     * @param {Number} start
     * @param {Number} end
     * @return {Boolean} An array of [start, end] tuples defining the time span(s) that needs downloading, or null if all the data is already in the cache
     */
    LogsManager.prototype._downloadRequired = function(hostName, serviceName, start, end) {
        if(this.cache.hasOwnProperty(hostName) && this.cache[hostName].hasOwnProperty(serviceName)) {
            // Do we have data for the requested time span?
            var serviceCache = this.cache[hostName][serviceName];
            var results = [];
            for(var i = 0, l = serviceCache.length; i < l; ++i) {
                var cacheEntry = serviceCache[i];

                if(cacheEntry.start >= end) {
                    // We went past the requested area; Done
                    break;
                }

                if(cacheEntry.end > start) {
                    // Intersect !
                    if(cacheEntry.start <= start) {
                        if(cacheEntry.end >= end) {
                            // This cache entry entirely covers the requested area!
                            return null;
                        }
                        else {
                            start = cacheEntry.end;
                        }
                    }
                    else {
                        if(cacheEntry.end >= end) {
                            end = cacheEntry.start;
                            break;
                        }
                        else {
                            // The currently cache entry cuts the requested area in half
                            // we'll have to return several segments !
                            results.push([start, cacheEntry.start]);
                            start = cacheEntry.end;
                        }
                    }
                }
            }

            results.push([start, end]);
            return results;
        }
        else {
            return [[start, end]];
        }
    };

    /**
     * Downloads the specified log data, and stores the results in the cache
     * @param {Array} downloadList
     */
    LogsManager.prototype._downloadAndUpdateCache = function(downloadList, requestedStart, requestedEnd) {
        return MetroService.getLogs(downloadList).then(function(result) {
            // Store the results in the local cache
            for(var hostName in result) {
                var hostEntry = result[hostName];
                for(var serviceName in hostEntry) {
                    this._mergeInCache(hostName, serviceName, requestedStart, requestedEnd, hostEntry[serviceName]);
                }
            }
        }.bind(this));
    };

    LogsManager.prototype._mergeInCache = function(hostName, serviceName, requestedStart, requestedEnd, data) {
        // Stores a set of log entries in the cache.
        // This method's role is to ensure that the cache state is consistent,
        // and cache entries with touching time spans merges into a single one

        var cacheEntry = null;

        if(!this.cache.hasOwnProperty(hostName)) {
            this.cache[hostName] = {};
        }
        if(!this.cache[hostName].hasOwnProperty(serviceName)) {
            this.cache[hostName][serviceName] = [];
        }
        var serviceEntry = this.cache[hostName][serviceName];

        // Find intersecting cache entries
        var intersects = [];
        var insertPos = -1;
        for(var i = 0, l = serviceEntry.length; i < l; ++i) {
            cacheEntry = serviceEntry[i];
            if(cacheEntry.start <= requestedEnd && cacheEntry.end >= requestedStart) {
                if(insertPos === -1)
                    insertPos = i;
                intersects.push(i);
            }
        }

        // Add intersects data in the new dataset
        for(i = intersects.length - 1; i >= 0; --i) {
            cacheEntry = serviceEntry[intersects[i]];
            if(cacheEntry.start < requestedStart)
                requestedStart = cacheEntry.start;
            if(cacheEntry.end > requestedEnd)
                requestedEnd = cacheEntry.end;
            LogsManager._mergeDataSets(data, cacheEntry.entries);
        }

        // Replace the intersects with the new cache entry
        serviceEntry.splice(insertPos, intersects.length, {
            start: requestedStart,
            end: requestedEnd,
            entries: data,
        });
    };

    LogsManager._mergeDataSets = function(data1, data2) {
        var i1 = 0;

        for(var i2 = 0, l = data2.length; i2 < l; ++i2) {
            var currentVal = data2[i2];
            while(i1 < data1.length && data1[i1].time < currentVal.time) {
                ++i1;
            }

            data1.splice(i1, 0, currentVal);
        }
    };

    LogsManager.prototype._getFromCache = function(hostAndServiceNames, start, end) {
        // This method assumes the cache already contains all the required data
        var result = {};
        for(var i = 0, l = hostAndServiceNames.length; i < l; ++i) {
            var hostName = hostAndServiceNames[i][0];
            var serviceName = hostAndServiceNames[i][1];
            var serviceCache = this.cache[hostName][serviceName];
            for(var j = 0, m = serviceCache.length; j < m; ++j) {
                if(start >= serviceCache[j].start) {
                    if(!result.hasOwnProperty(hostName)) {
                        result[hostName] = {};
                    }

                    // Only insert the events matching the requested frame
                    var from = serviceCache[j].entries;
                    var to = [];
                    for(var k = 0, n = from.length; k < n; ++k) {
                        var curEntry = from[k];
                        if(curEntry.time >= end) {
                            break;
                        }

                        if(curEntry.time >= start) {
                            to.push(curEntry);
                        }
                    }

                    result[hostName][serviceName] = to;
                }
            }
        }

        return result;
    };

    return LogsManager;
});