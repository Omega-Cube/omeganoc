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

define(['libs/rsvp', 'argumenterror', 'console', 'observable'], function(RSVP, ArgumentError, Console, Observable) {
    function TimeFrameCache(downloader) {
        /**
         * A structure that holds the cached data entries
         * The structure is: cache[key] = [
         *  {
         *    start: <timestamp>,
         *    end: <timestamp>,
         *    entries: [<cached entries, ordered by time, must contain a time field>]
         *  }
         * ]
         */
        this.cache = {};
        this.downloader = downloader;
        this.observable = new Observable();
    }


    /**
     * Gets all the entries for the specified keys in the specified time frame
     * @param {Array} keys An array of keys that should be retrieved
     * @param {Number} start The timestamp of the inclusive lower bound of the requested time frame
     * @param {Number} end The timestamp of the exclusive upper bound of the requested time frame
     */
    TimeFrameCache.prototype.get = function(keys, start, end) {
        if(!start)
            throw new ArgumentError('Please provide a value for the start argument');
        if(!end)
            throw new ArgumentError('Please provide a value for the end argument');

        // No floats, only integers!
        start = Math.floor(start);
        end = Math.ceil(end);

        if(typeof keys === 'string') {
            keys = [keys];
        }

        // Check whether we need to download data to satisfy this query
        var requiredDownloads = [];
        for(var i = 0, l = keys.length; i < l; ++i) {
            var spans = this._downloadRequired(keys[i], start, end);
            if(spans) {
                for(var j = 0; j < spans.length; ++j) {
                    requiredDownloads.push([keys[i], spans[j][0], spans[j][1]]);
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
            }, 'TimeFrameCache.get.emptyPromise');
        }

        return resultPromise.then(function() {
            // Return the results from the cache
            return this._getFromCache(keys, start, end);
        }.bind(this), undefined, 'TimeFrameCache.get.readCache');
    };

    /**
     * Gets the values stored in the cache at the specified time point
     * @param {Array} keys A list if keys to retrieve
     * @param {number} timePoint A timestamp in seconds
     * @return {Object} An object whose values are arrays. These arrays are filled with the following rules :
     *                  - If the array contains 2 values, they will then contain the two closest cache entries before and after the requested time.
     *                    These entries can be null, if they are located outside the cached areas.
     *                  - If the array contains 1 value, this value contains the cache entry found precisely at the requested time.
     *                  - If the array is empty, it means that the requested time point is outside of the cached areas for this key.
     */
    TimeFrameCache.prototype.getAtTime = function(keys, timePoint) {
        var result = {};
        for(var i in keys) {
            var key = keys[i];

            if(key in this.cache) {
                var cacheFrame = this._findCacheFrame(key, timePoint);
                if(cacheFrame) {
                    var entries = cacheFrame.entries;
                    var previous = null;
                    var found = false;
                    for(var j = 0, l = entries.length; !found && j < l; ++j) {
                        var curEntry = entries[j];
                        if(curEntry.time > timePoint) {
                            result[key] = [
                                TimeFrameCache._createCopy(previous), 
                                TimeFrameCache._createCopy(curEntry)
                            ];
                            found = true;
                        }
                        else if(curEntry.time === timePoint) {
                            result[key] = [TimeFrameCache._createCopy(curEntry)];
                            found = true;
                        }
                        else {
                            previous = curEntry;
                        }
                    }

                    if(!found) {
                        result[key] = [TimeFrameCache._createCopy(previous), null];
                    }
                }
                else {
                    result[key] = [];
                }
            }
            else {
                result[key] = [];
            }
        }

        return result;
    };

    /**
     * Registers a callback to the onkeydownloaded event.
     * This event is triggered every time new data has been downloaded for a given key.
     */
    TimeFrameCache.prototype.onkeydownloaded = function(callback) {
        this.observable.on(TimeFrameCache.events.onkeydownloaded, callback);
    };

    /**
     * Determines if a data download is needed or not to know the log entries for the specified host/service, on the specified time frame.
     * @param {String} key
     * @param {Number} start
     * @param {Number} end
     * @return {Array} An array of [start, end] tuples defining the time span(s) that needs downloading, or null if all the data is already in the cache
     */
    TimeFrameCache.prototype._downloadRequired = function(key, start, end) {
        if(this.cache.hasOwnProperty(key)) {
            // Do we have data for the requested time span?
            var keyCache = this.cache[key];
            var results = [];
            for(var i = 0, l = keyCache.length; i < l; ++i) {
                var cacheEntry = keyCache[i];

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
    TimeFrameCache.prototype._downloadAndUpdateCache = function(downloadList, requestedStart, requestedEnd) {
        return this.downloader(downloadList).then(function(result) {
            // Store the results in the local cache
            for(var key in result) {
                this._mergeInCache(key, requestedStart, requestedEnd, result[key]);
                this.observable.trigger(TimeFrameCache.events.onkeydownloaded, {
                    key: key
                });
            }
        }.bind(this), undefined, 'TimeFrameCache._downloadAndUpdateCache');
    };

    /**
     * Adds new data in the cache of the specified key
     */
    TimeFrameCache.prototype._mergeInCache = function(key, requestedStart, requestedEnd, data) {
        // Stores a set of log entries in the cache.
        // This method's role is to ensure that the cache state is consistent,
        // and cache entries with touching time spans merges into a single one

        var cacheEntry = null;

        if(!this.cache.hasOwnProperty(key)) {
            this.cache[key] = [];
        }
        var keyEntry = this.cache[key];

        // Find intersecting cache entries
        var intersects = [];
        var insertPos = -1;
        for(var i = 0, l = keyEntry.length; i < l; ++i) {
            cacheEntry = keyEntry[i];
            if(cacheEntry.start <= requestedEnd && cacheEntry.end >= requestedStart) {
                if(insertPos === -1)
                    insertPos = i;
                intersects.push(i);
            }
        }

        // Add intersects data in the new dataset
        for(i = intersects.length - 1; i >= 0; --i) {
            cacheEntry = keyEntry[intersects[i]];
            if(cacheEntry.start < requestedStart)
                requestedStart = cacheEntry.start;
            if(cacheEntry.end > requestedEnd)
                requestedEnd = cacheEntry.end;
            TimeFrameCache._mergeDataSets(data, cacheEntry.entries);
        }

        // Replace the intersects with the new cache entry
        keyEntry.splice(insertPos, intersects.length, {
            start: requestedStart,
            end: requestedEnd,
            entries: data,
        });
    };

    /**
     * Merges two arrays of cache entries, making sure they are ordered by time
     */
    TimeFrameCache._mergeDataSets = function(data1, data2) {
        var i1 = 0;

        for(var i2 = 0, l = data2.length; i2 < l; ++i2) {
            var currentVal = data2[i2];
            while(i1 < data1.length && data1[i1].time < currentVal.time) {
                ++i1;
            }

            data1.splice(i1, 0, currentVal);
        }
    };

    TimeFrameCache.prototype._getFromCache = function(keys, start, end) {
        // This method assumes the cache already contains all the required data
        var result = {};
        
        for(var i = 0, l = keys.length; i < l; ++i) {
            var currentKey = keys[i];
            var cacheFrame = this._findCacheFrame(currentKey, start);

            if(cacheFrame) {
                // Only insert the events matching the requested frame
                var from = cacheFrame.entries;
                var to = [];
                for(var k = 0, n = from.length; k < n; ++k) {
                    var curEntry = from[k];
                    if(curEntry.time >= end) {
                        break;
                    }

                    if(curEntry.time >= start) {
                        // Push a copy of the cache into the results
                        to.push(TimeFrameCache._createCopy(curEntry));
                    }
                }
            }
            else {
                Console.error('Could not find a cache frame for key ' + currentKey + ' and time ' + start + '!');
            }

            result[currentKey] = to;
        }

        return result;
    };

    /**
     * Finds the cache frame matching the specified key and containing the specified time point.
     * @param {string} key
     * @param {number} time A timestamp in seconds
     * @return {Object} The frame that was found, or null if there is no frame in the cache for the specified time
     */
    TimeFrameCache.prototype._findCacheFrame = function(key, time) {
        var keyCache = this.cache[key];
        for(var i in keyCache) {
            if(keyCache[i].start <= time && keyCache[i].end > time) {
                return keyCache[i];
            }
        }
        return null;
    };

    /**
     * Creates a deep copy of a custom object
     * @param {Object} object The object that should be copied
     * @return {Object} A deep copy of the argument
     */
    TimeFrameCache._createCopy = function(object) {
        if(object === null)
            return null;

        var str = JSON.stringify(object);
        return JSON.parse(str);
    };

    TimeFrameCache.events = {
        onkeydownloaded: 'onkeydownloaded'
    };

    return TimeFrameCache;
});