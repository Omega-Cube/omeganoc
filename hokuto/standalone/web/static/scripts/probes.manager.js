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

define(['metroservice', 'timeframecache', 'console'], function(MetroService, TimeFrameCache, Console) {
    function ProbesManager() {
        this.cache = new TimeFrameCache(ProbesManager._downloadCache);
        this.cache.onkeydownloaded(function(data) {
            this._updateNativeInterval(data.key);
        }.bind(this));

        /**
         * Cache of detected natural time intervals between points of each probe
         * This is updated everytime new data is downloaded.
         * Dictionary values are **in minutes**! It may be null, for example 
         * if the data contains no points.
         */
        this.nativeIntervals = {};
    }

    ProbesManager.prototype.get = function(probeNames, start, end) {
        return this.cache.get(probeNames, start, end);
    };

    ProbesManager._downloadCache = function(downloadList) {
        return MetroService.getMetricValues(downloadList).then(function(result) {
            for(var key in result) {
                result[key] = result[key].values;
            }

            return result;
        });
    };

    /**
     * Gets the values from a list of probes at the specified time.
     * The time does not need to be spot-on : this method will return the closest values
     * within a 10 minute window centered on the specified time.
     * @param {Array} probeNames A list of probe names to read
     * @param {number} time The time for which we want to get the values
     * @return {Object} An object in which the keys are the probe names, and the values are the times that were found.
     *                  Note that the value can be null.
     */
    ProbesManager.prototype.getAtTime = function(probeNames, time) {
        var maxDistance = 5 * 60; // 5 minutes maximum distance between an entry and the requested time
        var vals = this.cache.getAtTime(probeNames, time);
        var result = {};

        for(var i in probeNames) {
            var key = probeNames[i];
            var currentVal = vals[key];

            if(currentVal) {
                switch(currentVal.length) {
                case 0:
                        // An empty array means the cache had no data for this probe at this time
                    Console.log('A probe value was requested, but is not in the cache ! On probe "' + key + '" at time "' + time + '"');
                    result[key] = null;
                    break;
                case 1:
                    // Perfect match!
                    result[key] = currentVal[0].value;
                    break;
                case 2:
                    // Only found values before and after the requested time
                    if(!currentVal[0]) {
                        if(!currentVal[1]) {
                            // Both values are null : the cache exists but is empty
                            result[key] = null;
                        }
                        else {
                            // Before is null, after is not null
                            if(currentVal[1].time - time <= maxDistance) {
                                result[key] = currentVal[1].value;
                            }
                            else {
                                result[key] = null;
                            }
                        }
                    }
                    else if(!currentVal[1]) {
                        // Before is not null, after is null
                        if(time - currentVal[0].time <= maxDistance) {
                            result[key] = currentVal[0].value;
                        }
                        else {
                            result[key] = null;
                        }
                    }
                    else {
                        // Before and after aren't null
                        var beforeDist = time - currentVal[0].time;
                        var afterDist = currentVal[1].time - time;
                        var smallestDist = Math.min(beforeDist, afterDist);
                        if(smallestDist <= maxDistance) {
                            result[key] = (beforeDist < afterDist) ? currentVal[0].value : currentVal[1].value;
                        }
                        else {
                            result[key] = null;
                        }
                    }
                    break;
                }
            }
            else {
                result[key] = null;
            }
        }

        return result;
    };

    /**
     * Computes and returns the aggregated time series for the specified probes.
     * 
     * An "aggregated time series" is a list of data points that has been modified
     * to have one point at fixed regular intervals (for example one every five minutes), 
     * instead of having them at the positions they are at in the original data.
     * When there are more than one value in the original data to place at the new position,
     * the mode parameter specifies how these values will be merged.
     * 
     * This method will automatically download any additionnal data required to cover
     * the requested time frame.
     * 
     * @param probeNames {Array} A list of probe names to retrieve
     * @param {number} start Lower bound (inclusive) of the requested time area
     * @param {number} end Upper bound (exclusive) of the requested time area
     * @param {number} interval The number of seconds between each point in the aggregated series
     * @param {ProbesManager.aggregationModes} [mode=ProbesManager.aggregationModes.MAX] The aggregation mode
     * @return {Object} A dictionary containing probe names as keys, and whose values are { start: <start timestamp>, step: <distance between points, in seconds>, points: [point1, point2, point3, ...]}
     */
    ProbesManager.prototype.getAggregated = function(probeNames, start, end, interval, mode) {
        var sourceData = this.cache.get(probeNames, start, end);

        if(!interval) {
            // The interface should decide what the interval is. Not the manager
            Console.warn('No interval provided to getAggregated. Please dont do this :(');
        }

        if(!mode) {
            mode = ProbesManager.aggregationModes.MAX;
        }

        var result = {};
        for(var i in probeNames) {
            var probeName = probeNames[i];

            result[probeName] = this._getAggregatedUnit(probeName, sourceData[probeName], start, end, interval, mode);
        }

        return result;
    };

    /**
     * Computes the aggregated time series for the specified element
     */
    ProbesManager.prototype._getAggregatedUnit = function(probeName, data, start, end, interval, mode) {
        var nativeInterval = this.nativeIntervals[probeName];

        // Do we have an interval?
        if(interval) {
            // Make sure it's not more precise than the natural one
            if(interval < nativeInterval) {
                interval = nativeInterval;
            }
        }
        else {
            interval = nativeInterval;
        }

        var values = [];
        var pointPos = 0;
        for(var i = start; i < end;) {
            var accumulator = null;
            var counter = 0;
            i += interval;
            while(pointPos < data.length && data[pointPos].time < i) {
                switch(mode) {
                case 'min':
                    if(accumulator === null) {
                        accumulator = data[pointPos].value;
                    }
                    else if(data[pointPos].value < accumulator) {
                        accumulator = data[pointPos].value;
                    }
                    break;
                case 'max':
                    if(accumulator === null) {
                        accumulator = data[pointPos].value;
                    }
                    else if(data[pointPos].value > accumulator) {
                        accumulator = data[pointPos].value;
                    }
                    break;
                case 'avg':
                    if(accumulator === null) {
                        accumulator = 0;
                    }
                    accumulator += data[pointPos].value;
                }
                ++counter;
                ++pointPos;
            }

            if(mode === 'avg' && counter > 0) {
                accumulator /= counter;
            }

            values.push(accumulator);
        }

        return {
            start: start,
            step: interval,
            points: values,
        };
    };

    ProbesManager.prototype._updateNativeInterval = function(probeName) {
        // Collect all the know distances between points of this probeName, rounded by the minute
        // The one that we find the most will be our natural interval
        var distances = {};
        for(var i in this.cache.cache[probeName]) {
            var cacheFrame = this.cache.cache[probeName][i];
            var previous = null;
            for(var j in cacheFrame.entries) {
                if(previous !== null) {
                    var dist = Math.round((cacheFrame.entries[j].time - previous) / 60);
                    if(dist in distances) {
                        distances[dist] += 1;
                    }
                    else {
                        distances[dist] = 1;
                    }
                }

                previous = cacheFrame.entries[j].time;
            }
        }

        var result = null;
        var resultScore = 0;

        for(i in distances) {
            if(distances[i] > resultScore) {
                result = i;
                resultScore = distances[i];
            }
        }

        this.nativeIntervals[probeName] = (result === null) ? null : Number(result);
    };

    /**
     * Enumerates the possible aggregation modes
     * @readonly
     * @enum {string}
     */
    ProbesManager.aggregationModes = {
        /** The aggregated point value will be the lower point's value */
        MIN: 'min',
        /** The aggregated point value will be the higher point's value */
        MAX: 'max',
        /** The average point value will be the average of all its data sources */
        AVG: 'avg',
    };

    return ProbesManager;
});