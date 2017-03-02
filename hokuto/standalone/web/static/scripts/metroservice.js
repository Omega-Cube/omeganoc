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

define(['onoc.xhr', 'onoc.config', 'onoc.createurl'], function(OnocXhr, Config, createUrl) {
    var MetroService = {
        /**
         * Gets a list of all the available metrics sources
         * @returns {Object} An object following this structure type: result[hostname][servicename][probename] = fullname
         */
        getMetricsList: function() {
            return OnocXhr.getJson(createUrl('/services/metrics'));
        },

        /**
         * Gets all the metric values associated to the specified probes
         * @param {String|Array} probeNames One or several full probe names
         * @param {Number} start The lower bound of the time range covered by the requested metrics
         * @param {Number} end The upper bound of the time range covered by the requested metrics
         * @returns {Promise} A promise returning an object following this structure type: result[probeName] = { host, service, metric, values = [{time, value}]}
         */
        getMetricValues: function(probeNames, start, end) {
            var qString = { probes: probeNames };
            if(start)
                qString.start = start;
            if(end)
                qString.end = end;

            return OnocXhr.getJson(createUrl('/services/metrics/values'), qString);
        },

        /**
         * Gets the state change log entries for the specified components
         * @param {Array} downloadList An array of [hostname, servicename, start, end] tuples
         * @returns {Promise} A promise returning an object following this structure type : result[hostname]servicename] = { time, output, state, alert_type }
         */
        getLogs: function(downloadList) {
            var separator = Config.separator();
            var query = {
                targets: downloadList.map(function(tuple) {
                    return tuple[0] + separator + tuple[1] + '|' + tuple[2] + '|' + tuple[3];
                })
            };

            return OnocXhr.getJson(createUrl('/services/logs'), query);
        },
    };

    return MetroService;
});