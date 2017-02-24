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

define([
    'libs/rsvp',
    'onoc.createurl', 
    'onoc.xhr', 
    'console',
    'workers/probes.log', 
    'workers/probes.probe'], function(RSVP, createUrl, OnocXhr, Console, Log, Probe) {
    
    // TODO: Remove this
    var separator = '[SEP]';

    /**
     * Data class
     * @class
     * @static
     * @property {Object} probes - Store @Probe instances
     * @property {Object} logs   - Store @Log instances
     */
    var Data = {
        probes: {},
        logs: {},

        /**
         * Add a new probe
         * @param {Array} data - [{String} probe name, {Number} check interval]
         */
        addProbe: function(probeName, interval) {
            if(typeof probe !== 'string'){
                postMessage([9001,'Failed to add probe, argument must be a string ' + (typeof probe) + ' given.']);
                return false;
            }
            if(!this.probes[probeName]){
                this.probes[probeName] = new Probe();
                this.probes[probeName].setInterval(interval);
                var d = probeName.split(separator);
                if(d.length > 1){
                    var h = d[0], s = d[1];
                    this.logs[h] = this.logs[h] || {};
                    if(!this.logs[h][s])
                        this.logs[h][s] = new Log();
                }
            }
            return this;
        },

        /**
         * Check if some probe have reached a new aggregate level
         * @param {Object} data
         *        {Object} data.probes          - probes data
         *        {Array}  data.contextTimeline - Current timeline
         *        {Array}  data.focusTimeline   - new timeline
         * @return false if no probe have reached a new aggregate level, new probes aggregated data eitherway
         */
        checkAggregate: function(data){
            var results = false, result = false, stacks = false;
            var step, probe;
            for(var p in data.probes){
                if(data.probes[p].stacked){
                    stacks = stacks || {};
                    stacks[data.probes[p].scale] = stacks[data.probes[p].scale] || [];
                    stacks[data.probes[p].scale].push(p);
                    continue;
                }
                step = this.probes[p].getStep() * 2;
                if(this.probes[p].checkAggregate(data.contextTimeline, [data.focusTimeline[0] - step, data.focusTimeline[1] + step])){
                    result = this.probes[p].get(data.focusTimeline[0] - step,data.focusTimeline[1] + step, data.mode);
                    results = results || {};
                    results[p] = result;
                }
            }

            //work with stacked probes
            if(stacks){
                for(var s in stacks){
                    var values = {};
                    var check = false;
                    for(p in stacks[s]){
                        probe = this.probes[stacks[s][p]];
                        step = probe.getStep() * 2;
                        if(probe.checkAggregate(data.contextTimeline, [data.focusTimeline[0] - step, data.focusTimeline[1] + step]))
                            check = true;
                    }

                    if(check){
                        results = results || {};
                        for(p in stacks[s]){
                            probe = stacks[s][p];
                            values[probe] = this.getProbe(probe, data.focusTimeline[0], data.focusTimeline[1], data.mode, 1);
                        }
                        var aggregate = this.aggregateStack(values, data.mode);
                        for(var a in aggregate)
                            results[a] = aggregate[a];
                    }
                }
            }

            return results;
        },

        /**
         * Return data from query
         * @param {Object} query - Request details
         *                 query.probes: [probename,probename,probename,...]
         *                 query.start: timestamp
         *                 query.end: timestamp
         * @param {Number} signature - Requester ID
         */
        get: function(query,signature){
            if(!query)
                return false;
            if(typeof query === 'string')
                return this.getProbe(query);
            else if(typeof query === 'object'){
                var results = {};
                var stacks = {};

                var mode = query['mode'] || 'max';
                if(query.start && query.start.constructor === Date)
                    query.start = query.start.getTime();
                if(query.end && query.end.constructor === Date)
                    query.end = query.end.getTime();
                for(var p in query.probes){
                    if(query.probes[p].stacked){
                        stacks[query.probes[p].scale] = stacks[query.probes[p].scale] || [];
                        stacks[query.probes[p].scale].push(p);
                        continue;
                    }
                    var data = this.getProbe(p,query['start'],query['end'],mode);
                    if(data)
                        results[p] = data;
                }


                //get stacked data
                for(var s in stacks){
                    var values = {};
                    for(p in stacks[s]) {
                        values[stacks[s][p]] = this.getProbe(stacks[s][p],query['start'],query['end'],mode,1);
                    }

                    //aggregate theme
                    var aggregate = this.aggregateStack(values,mode);
                    for(var a in aggregate) {
                        results[a] = aggregate[a];
                    }
                }

                postMessage([6,results,signature]);
                var logs = this.getLogs(query);
                if(logs)
                    postMessage([10,logs,signature]);
                return results;
            }
            return false;
        },

        /**
         * Aggregation rules for stacked probes
         * @param {Object} stack - Current stack's probes data
         * @param {String} mode  - Aggregation mode (max|min|avg)
         * @return Aggregated stack
         */
        aggregateStack: function(stack, mode){
            var results = {};

            var getInterpolated = function(time, previous, next){
                var diff = next.y - previous.y;
                var percent = (next.x - previous.x) / 100;
                percent = (time - previous.x) / percent;
                return (previous.y + percent / 100 * diff);
            };

            for(var p in stack){
                var probe = stack[p];
                var interval = this.probes[p]._getAggregateLevel(probe.start, probe.end);
                var step = this.probes[p].getStep();
                var newValues = [];
                var cached = {};

                for(var i = 0, len = probe.values.length; i<len; i+=interval){
                    var previous = false;
                    var newValue = 0;

                    for(var j = 0; j<interval;j++){
                        //get others values
                        if(typeof probe.values[i+j] === 'undefined') continue;
                        var time = probe.values[i+j].x;
                        var value = probe.values[i+j].y;
                        for(var q in stack){
                            if(q === p) continue;
                            for(var k = cached[q] || 0, klen = stack[q].values.length; k < klen; k++){
                                var tmp = stack[q].values[k];
                                if(tmp.x.getTime() < time.getTime()) continue;
                                if(tmp.x.getTime() === time.getTime())
                                    value += tmp.y;
                                else
                                    value += (stack[q].values[k - 1]) ? getInterpolated(time,stack[q].values[k - 1],stack[q].values[k]) : 0;
                                cached[q] = k;
                                break;
                            }
                        }
                        if(mode === 'max'){
                            if(previous <= value){
                                previous = value;
                                newValue = probe.values[i+j].y;
                            }
                        }else if(mode === 'min'){
                            if(typeof previous === 'boolean' || previous > value){
                                previous = value;
                                newValue = probe.values[i+j].y;
                            }
                        }else{
                            newValue += (probe.values[i+j].y - newValue) / (j + 1);
                        }
                        if(!probe.values[i+j+1]) break;
                    }

                    if(isNaN(newValue)){
                        postMessage([0,'NaN spotted on stacked probe!']);
                        continue;
                    }

                    if(!probe.values[i]) continue;
                    newValues.push({
                        'y': newValue,
                        'x': new Date(probe.values[i].x.getTime() + interval * step / 2),
                        'start': false,
                        'y0': 0
                    });
                }
                results[p] = {
                    'values': newValues,
                    'start': probe.start,
                    'end': probe.end,
                    'range': probe.range
                };
            }

            return results;
        },

        /**
         * Return the probe stored data.
         * @param {String} probe      - The probe name
         * @param {Number} [from]     - Start of the requested timeline
         * @param {Number} [until]    - End of the requested timeline
         * @param {String} [mode]     - Aggregation mode
         * @param {Number} [interval] - Force aggregation level
         */
        getProbe: function(probe, from, until, mode, interval){
            if(!this.probes[probe]) return false;
            return this.probes[probe].get(from, until, mode, interval);
        },

        /**
         * Return logs
         * @param {Object} data - Request data
         *                 data.probes: probes list
         *                 data.start: request timerange start
         *                 data.end: request timerange end
         */
        getLogs: function(data){
            var probes = data['probes'];
            var results = {};
            var host, service, parts;
            for(var probe in probes){
                parts = probe.split(separator);
                host = parts[0];
                service = parts[1];
                if(!service || !host) 
                    continue;
                var logs = this.logs[host][service].getLogs(data['start'],data['end']);
                if(!logs.length)
                    continue;
                if(!results[host])
                    results[host] = {};
                if(results[host][service])
                    continue;
                results[host][service] = logs;
            }
            if(!Object.keys(results).length)
                return false;
            return results;
        },

        /**
         * Get value from all probes at the given date
         * @param {Number} date - date timestamp
         */
        getCursor: function(date){
            var results = {};
            for(var p in this.probes)
                results[p] = this.probes[p].getCursor(date);
            return results;
        },

        /**
         * get data for given probes
         * will fetch new data if needed
         * @param {Object} data
         *                 data.start
         *                 data.end
         *                 data.probes
         * @param {Number} signature - Requester ID
         */
        getTimeline: function(data,signature){
            if(typeof data['start'] === 'object')
                data['start'] = data['start'].getTime();
            if(typeof data['end'] === 'object')
                data['end'] = data['end'].getTime();

            var probes = data.probes;
            var start = data['start'];
            var end = data['end'];
            if((!start && !end) || !probes){
                postMessage([9001,'Can\'t update fromDate, missing parameters']);
                return false;
            }

            var fetch = false;
            for(var p in this.probes)
                fetch = (this.probes[p].checkNeedFetch(start,end) || fetch);
            if(fetch)
                this.fetch(data,signature);
            else
                this.get(data,signature);

            return fetch;
        },

        /**
         * Fetch and return data from given probes
         * @param {Array} probesList - A list of probe IDs to retrieve
         * @param {Number} start - Timestamp of the lower bound of the time period to retrieve
         * @param {Number} end - Timestamp of the upper bound of the time period to retrieve
         */
        fetch: function(probesList, start, end, onResult, onDone) {
            var logsPromises = [];
            var metricsPromises = null;
            var predictsPromise = null;
            //TODO: fetch only probes and log at the given timeline
            probesList = probesList || Object.keys(this.probes);
            var details = [];
            if(!Array.isArray(probesList)) 
                probesList = Object.keys(probesList);
                
            for(var i=0,len = probesList.length;i<len;i++){
                if(start || end)
                    this.probes[probesList[i]].setRequestedDate(start,end); // TODO: Check that this.probes[probes[i]] exists
                details = probesList[i].split(separator);

                if(!!this.logs[details[0]] && !!this.logs[details[0]][details[1]]) {
                    this.fetchLog(details[0], details[1], start, end).then(function(logResults) {
                        onResult(['log', details[0],details[1], logResults]);
                    });
                }
            }

            var query = {'probes': probesList };
            if(start)
                start = Math.floor(start / 1000);
            if(end)
                end = Math.floor(end / 1000);

            OnocXhr.getJson(createUrl('/services/metrics/values'), query).then(function(data) {
                if(data) {
                    postMessage([1, data, signature]);
                    this._parseResponseData(data);
                    //need to return if the redraw is required, maybe the return from parseResponse?
                }
            }.bind(this));

            //fetch query if possible
            this.fetchPredicts(probes, signature);

            return this;
        },

        /**
         * TODO: Fetch one probe
         */
        // fetchProbe: function(probe){
        //     //TODO
        //     return this;
        // },

        /**
         * Fetch log data
         * @param {String} host    - Host name
         * @param {String} service - Service name
         * @param {Number} start   - Start date timestamp
         * @param {Number} end     - end date timestamp
         */
        fetchLog: function(host, service, start, end){
            if(start)
                start /= 1000;
            if(end)
                end /= 1000;

            if(!this.logs[host][service].getLogs().length) {
                var url = createUrl('/services/livestatus/get/service/logs/' + host + '/' + service + '/');
                var data = { 'start': start, 'end': end};
                return OnocXhr.getJson(url, data).then(function(logs) {
                    this.logs[host][service].setData(logs);
                    var results = {};
                    results[host] = {};
                    results[host][service] = this.logs[host][service].getLogs();
                    return results;
                }.bind(this));
            } 
            else {
                return new RSVP.Promise(function(resolve) {
                    var results = {};
                    results[host] = {};
                    results[host][service] = this.logs[host][service].getLogs();
                    resolve(results);
                }.bind(this));
            }
        },

        /**
         * Fetch predict data if any
         * TODO: need to be able to disable this
         * @param {Array} probes - Probes names
         * @param {Number} sig   - Requester ID
         */
        fetchPredicts: function(probes,sig){
            //TODO check if predict data already fetched to prevent useless requests
            var url = createUrl('/services/predict/forecast');
            var query = { 'probes': probes };
            OnocXhr.getJson(url, query).then(function(data) {
                postMessage([11,data,sig]);
                for(var p in data)
                    this.probes[p].setPredicted(data[p]);
            }.bind(this));
        },

        /**
         * Handle the response object by converting timestamp to ms and construct the data object.
         */
        _parseResponseData: function(response){
            /* Original parsing logic (used with graphite), to be kept for reference
            for(var d in response){
                //TODO: should handle errors messages and code
                if(!response[d].values) continue;
                response[d].start *= 1000;
                response[d].end *= 1000;
                response[d].step *= 1000;

                var time = response[d].start;
                // Distance between each Graphite point, in ms
                var step = response[d].step;
                var tmp = [];
                var start = true;
                var query = d.split(separator);
                var interval = Math.round((this.probes[d].getInterval() * 60000) / step) || 1;
                var firstKnownValue = false;

                for(var v = 0, len = response[d].values.length; v < len; v+=interval){

                    for(var value = null, i = 0; i<interval;i++){
                        value = response[d].values[v + i];
                        if(value) break;
                    }
                    if( !firstKnownValue && value)
                        firstKnownValue = time;
                    //graphite response is filled with over9000 null values, so we take only real metrics.
                    if(firstKnownValue)
                        tmp.push(value);
                    time+= step * interval;
                }

                response[d].values = tmp;
                if(!firstKnownValue) firstKnownValue = Date.now();
                this.probes[d].update(response[d].values, firstKnownValue, response[d].end, step * interval);
            }
            */

            // New parsing logic, used with Influx
            // The objective here is not to create somethink efficient, but rather something that
            // will get the closest possible result when compared to the original Graphite implementation
            // Optimizations will come later, with a more general reorganization
            var interval = 0;
            var current;
            var lastFilledSlot, firstFilledSlot, currentSlot, point, points;
            for(var id in response) {
                interval = (this.probes[id].getInterval() * 60) || 60;
                current = response[id];

                firstFilledSlot = 0;
                lastFilledSlot = 0;
                points = [];
                for(var i = 0, imax = current.values.length; i < imax; ++i) {
                    point = current.values[i];
                    currentSlot = point.time - (point.time % interval);
                    if(firstFilledSlot === 0) {
                        firstFilledSlot = currentSlot;
                    }
                    if(currentSlot > lastFilledSlot) {
                        // Take the current value for the current slot.
                        // That means that if there are several values in the same slot,
                        // only the last one will be used. (that should happen fairely 
                        // rarely though)

                        if(lastFilledSlot > 0) {
                            // Make sure that there are no empty slots between this value and the previous one
                            // If so, fill them with null values
                            for(var emptySlot = lastFilledSlot + interval; emptySlot < currentSlot; emptySlot += interval) {
                                points.push(null);
                            }
                        }

                        points.push(point.value);
                        lastFilledSlot = currentSlot;
                    }
                }

                // If there was no data at all
                if(firstFilledSlot === 0) {
                    firstFilledSlot = Date.now();
                } 

                // the update function expects times in ms, so we have to multiply all the timestamps here
                this.probes[id].update(points, firstFilledSlot * 1000, lastFilledSlot * 1000 + interval * 1000 - 1, interval * 1000);
            }
        }
    };

    return Data;
});