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

define(['metroservice', 'timeframecache', 'console', 'onoc.config'], function(MetroService, TimeFrameCache, Console, Config) {
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
        this.cache = new TimeFrameCache(LogsManager._logDownloader);
    };

    /**
     * Gets all the log entries for the specified service instances in the specified time frame
     * @param {Array} hostAndServiceNames An array of [hostname, servicename] tuples
     * @param {Number} start The timestamp of the inclusive lower bound of the requested time frame
     * @param {Number} end The timestamp of the exclusive upper bound of the requested time frame
     */
    LogsManager.prototype.get = function(hostAndServiceNames, start, end) {
        var separator = Config.separator();
        var keys = hostAndServiceNames.map(function(val) {
            return val[0] + separator + val[1];
        });

        return this.cache.get(keys, start, end).then(function(results) {
            var expandedResults = {};
            for(var key in results) {
                var parts = key.split(separator);
                var hostName = parts[0];
                if(!(hostName in expandedResults)) {
                    expandedResults[hostName] = {};
                }

                expandedResults[hostName][parts[1]] = results[key];
            }
            return expandedResults;
        });
    };

    LogsManager._logDownloader = function(downloadList) {
        // Turn keys back in host,service tuples for the service call
        var separator = Config.separator();
        downloadList = downloadList.map(function(val) {
            var parts = val[0].split(separator);
            return [
                parts[0],
                parts[1],
                val[1],
                val[2]
            ];
        });

        return MetroService.getLogs(downloadList).then(function(result) {
            // Add the numerical state code before storing the results into the cache
            var separator2 = Config.separator();
            var transformed = {};
            for(var hostName in result) {
                for(var serviceName in result[hostName]) {
                    var serviceEntry = result[hostName][serviceName];
                    for(var i = 0, l = serviceEntry.length; i < l; ++i) {
                        LogsManager._addNumericalStateToEntry(serviceEntry[i]);
                    }
                    transformed[hostName + separator2 + serviceName] = serviceEntry;
                }
            }

            return transformed;
        });
    };

    LogsManager._addNumericalStateToEntry = function(entry) {
        // Before we insert an entry in the cache, let's add a consolidated numerical state indicator
        //  0 => OK or UP
        //  1 => WARNING
        //  2 => CRITICAL or DOWN
        //  3 => UNREACHABLE
        // -1 => others
        switch(entry.state.toUpperCase()) {
        case 'OK':
        case 'UP':
            entry.state_num = 0;
            break;
        case 'WARNING':
            entry.state_num = 1;
            break;
        case 'CRITICAL':
        case 'DOWN':
            entry.state_num = 2;
            break;
        case 'UNREACHABLE':
            entry.state_num = 3;
            break;
        default:
            Console.warn('Unknown state value in incoming log entry: ' + entry.state);
            entry.state_num = -1;
            break;
        }
    };

    return LogsManager;
});