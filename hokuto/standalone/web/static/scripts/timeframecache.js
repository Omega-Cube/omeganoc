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

define(['libs/rsvp', 'argumenterror'], function(RSVP, ArgumentError) {
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
            var keyCache = this.cache[currentKey];
            for(var j = 0, m = keyCache.length; j < m; ++j) {
                if(start >= keyCache[j].start) {
                    // Only insert the events matching the requested frame
                    var from = keyCache[j].entries;
                    var to = [];
                    for(var k = 0, n = from.length; k < n; ++k) {
                        var curEntry = from[k];
                        if(curEntry.time >= end) {
                            break;
                        }

                        if(curEntry.time >= start) {
                            // Push a copy of the cache into the results
                            var copy = JSON.stringify(curEntry);
                            to.push(JSON.parse(copy));
                        }
                    }

                    result[currentKey] = to;
                }
            }
        }

        return result;
    };

    return TimeFrameCache;
});