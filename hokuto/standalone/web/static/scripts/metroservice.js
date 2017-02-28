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

define(['onoc.xhr', 'onoc.createurl'], function(OnocXhr, createUrl) {
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
         * @returns {Object} An object following this structure type: result[probeName] = { host, service, metric, values = [{time, value}]}
         */
        getMetricValues: function(probeNames, start, end) {
            var qString = { probes: probeNames };
            if(start)
                qString.start = start;
            if(end)
                qString.end = end;

            return OnocXhr.getJson(createUrl('/services/metrics/values'), qString);
        },
    };

    return MetroService;
});